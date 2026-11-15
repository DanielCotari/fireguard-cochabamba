import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, FieldValue, GeoPoint, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const args = new Set(process.argv.slice(2));
const projectArgument = process.argv.findIndex((value) => value === '--project');
const projectId = projectArgument >= 0 ? process.argv[projectArgument + 1] : process.env.FIREBASE_PROJECT_ID;
const apply = args.has('--apply');
const confirmProduction = args.has('--confirm-production');
const migrationVersion = 'legacy-v1';

if (!projectId) {
  throw new Error('Indica --project <id> o FIREBASE_PROJECT_ID. La migración nunca elige un proyecto implícitamente.');
}
if (apply && projectId !== 'demo-fireguard' && !confirmProduction) {
  throw new Error('Para escribir en un proyecto real, repite el comando con --confirm-production después de revisar el informe dry-run.');
}

if (getApps().length === 0) {
  initializeApp({
    projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`,
  });
}

const db = getFirestore();
const bucket = getStorage().bucket();
const PAGE_SIZE = 200;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function asTimestamp(value) {
  if (value instanceof Timestamp) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return Timestamp.fromDate(value);
  if (typeof value === 'string') {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return Timestamp.fromDate(date);
  }
  return null;
}

function asGeoPoint(value, field) {
  if (value == null && field === 'observerLocation') return null;
  if (value instanceof GeoPoint) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number' &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    value.longitude >= -180 &&
    value.longitude <= 180
  ) {
    return new GeoPoint(value.latitude, value.longitude);
  }
  throw new Error(`${field} no contiene coordenadas válidas.`);
}

function normalizedReport(id, source) {
  const authorId = typeof source.authorId === 'string' ? source.authorId : source.ownerUid;
  if (typeof authorId !== 'string' || authorId.length < 1) {
    throw new Error('No se pudo determinar authorId desde authorId/ownerUid.');
  }
  const createdAt = asTimestamp(source.createdAt);
  const observedAt = asTimestamp(source.observedAt);
  if (!createdAt || !observedAt) throw new Error('createdAt u observedAt faltan o no son válidos.');
  if (typeof source.description !== 'string' || source.description.trim().length < 10) {
    throw new Error('description no cumple la longitud mínima.');
  }
  if (typeof source.photoPath !== 'string') throw new Error('photoPath no está definido.');
  if (!['received', 'under_evaluation', 'linked_to_incident', 'reviewed_without_incident'].includes(source.status)) {
    throw new Error(`status legado no reconocido: ${String(source.status)}.`);
  }
  if (!['pending', 'match_found', 'no_match_found'].includes(source.satelliteMatch)) {
    throw new Error(`satelliteMatch legado no reconocido: ${String(source.satelliteMatch)}.`);
  }

  const targetPhotoPath = `reportPhotos/${authorId}/${id}/original`;
  const acceptedLegacyPath = `report-images/${authorId}/${id}`;
  if (source.photoPath !== targetPhotoPath && source.photoPath !== acceptedLegacyPath) {
    throw new Error('photoPath no corresponde a la ruta conocida del reporte; se requiere revisión manual.');
  }

  return {
    authorId,
    description: source.description.trim(),
    observerLocation: asGeoPoint(source.observerLocation, 'observerLocation'),
    fireLocation: asGeoPoint(source.fireLocation, 'fireLocation'),
    observedAt,
    photoPath: targetPhotoPath,
    status: source.status,
    satelliteMatch: source.satelliteMatch,
    organizationId: typeof source.organizationId === 'string' ? source.organizationId : null,
    incidentId: typeof source.incidentId === 'string' ? source.incidentId : null,
    createdAt,
    updatedAt: asTimestamp(source.updatedAt) ?? createdAt,
  };
}

async function ensurePhotoCopied(id, report) {
  const destination = bucket.file(report.photoPath);
  const [destinationExists] = await destination.exists();
  if (destinationExists) {
    const [metadata] = await destination.getMetadata();
    if (
      Number(metadata.size) <= 0 ||
      Number(metadata.size) > MAX_PHOTO_BYTES ||
      !ALLOWED_IMAGE_TYPES.has(String(metadata.contentType).toLowerCase()) ||
      metadata.metadata?.authorId !== report.authorId ||
      metadata.metadata?.reportId !== id
    ) {
      throw new Error('La fotografía destino existe, pero sus metadatos no coinciden con el nuevo contrato.');
    }
    return;
  }

  const legacyPath = `report-images/${report.authorId}/${id}`;
  const source = bucket.file(legacyPath);
  const [sourceExists] = await source.exists();
  if (!sourceExists) throw new Error(`No existe la fotografía esperada ${legacyPath}.`);
  const [metadata] = await source.getMetadata();
  if (
    Number(metadata.size) <= 0 ||
    Number(metadata.size) > MAX_PHOTO_BYTES ||
    !ALLOWED_IMAGE_TYPES.has(String(metadata.contentType).toLowerCase())
  ) {
    throw new Error('La fotografía heredada no cumple el tipo y tamaño admitidos.');
  }
  if (!args.has('--apply')) return;

  await source.copy(destination);
  await destination.setMetadata({
    contentType: metadata.contentType,
    metadata: { authorId: report.authorId, reportId: id },
  });
}

async function migrateReport(snapshot, totals, failures) {
  const source = snapshot.data();
  if (source.authorId && !source.ownerUid && source.photoPath === `reportPhotos/${source.authorId}/${snapshot.id}/original`) {
    totals.reportsCurrent += 1;
    return;
  }

  try {
    const report = normalizedReport(snapshot.id, source);
    const operationalAreaId = typeof source.operationalAreaId === 'string'
      ? source.operationalAreaId.trim()
      : '';
    if (!operationalAreaId) {
      throw new Error('operationalAreaId no está definido; requiere asignación operativa revisada antes de migrar.');
    }
    await ensurePhotoCopied(snapshot.id, report);
    totals.reportsEligible += 1;
    if (!apply) return;

    const reportRef = snapshot.ref;
    const reviewRef = db.collection('reportReviews').doc(snapshot.id);
    const archiveRef = db.collection('migrationArchive').doc(migrationVersion)
      .collection('reports').doc(snapshot.id);
    await db.runTransaction(async (transaction) => {
      const [current, archive, review] = await Promise.all([
        transaction.get(reportRef),
        transaction.get(archiveRef),
        transaction.get(reviewRef),
      ]);
      if (!current.exists) throw new Error('El reporte desapareció antes de la migración.');
      if (!archive.exists) {
        transaction.create(archiveRef, {
          sourceCollection: 'reports',
          sourceId: snapshot.id,
          sourceData: current.data(),
          migrationVersion,
          archivedAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.set(reportRef, report);
      if (!review.exists) {
        transaction.create(reviewRef, {
          authorId: report.authorId,
          operationalAreaId,
          status: report.status,
          createdAt: report.createdAt,
          updatedAt: report.updatedAt,
        });
      }
    });
    totals.reportsMigrated += 1;
  } catch (error) {
    failures.push(`reports/${snapshot.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function migrateProfile(snapshot, totals, failures) {
  const source = snapshot.data();
  const fields = ['displayName', 'phone', 'createdAt', 'updatedAt'];
  if (fields.every((field) => field in source) && Object.keys(source).length === fields.length) {
    totals.profilesCurrent += 1;
    return;
  }

  try {
    const displayName = typeof source.displayName === 'string' ? source.displayName.trim() : '';
    const createdAt = asTimestamp(source.createdAt);
    if (!displayName || displayName.length > 120 || !createdAt) {
      throw new Error('displayName o createdAt faltan o no son válidos; requiere revisión manual.');
    }
    const profile = {
      displayName,
      phone: typeof source.phone === 'string' && source.phone.trim() ? source.phone.trim() : null,
      createdAt,
      updatedAt: asTimestamp(source.updatedAt) ?? createdAt,
    };
    totals.profilesEligible += 1;
    if (!apply) return;

    const archiveRef = db.collection('migrationArchive').doc(migrationVersion)
      .collection('users').doc(snapshot.id);
    await db.runTransaction(async (transaction) => {
      const [current, archive] = await Promise.all([
        transaction.get(snapshot.ref),
        transaction.get(archiveRef),
      ]);
      if (!current.exists) throw new Error('El perfil desapareció antes de la migración.');
      if (!archive.exists) {
        transaction.create(archiveRef, {
          sourceCollection: 'users',
          sourceId: snapshot.id,
          sourceData: current.data(),
          migrationVersion,
          archivedAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.set(snapshot.ref, profile);
    });
    totals.profilesMigrated += 1;
  } catch (error) {
    failures.push(`users/${snapshot.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function scanCollection(collectionName, handler, totals, failures) {
  let cursor;
  while (true) {
    let page = db.collection(collectionName).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) page = page.startAfter(cursor);
    const snapshot = await page.get();
    if (snapshot.empty) return;
    await Promise.all(snapshot.docs.map((document) => handler(document, totals, failures)));
    cursor = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < PAGE_SIZE) return;
  }
}

async function main() {
  const totals = {
    reportsCurrent: 0,
    reportsEligible: 0,
    reportsMigrated: 0,
    profilesCurrent: 0,
    profilesEligible: 0,
    profilesMigrated: 0,
    usersWithoutActiveAccess: 0,
  };
  const failures = [];

  await scanCollection('reports', migrateReport, totals, failures);
  await scanCollection('users', async (user, currentTotals, currentFailures) => {
    await migrateProfile(user, currentTotals, currentFailures);
    const access = await db.collection('access').doc(user.id).get();
    if (!access.exists || access.data()?.active !== true) currentTotals.usersWithoutActiveAccess += 1;
  }, totals, failures);

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    projectId,
    reportsCurrent: totals.reportsCurrent,
    reportsEligible: totals.reportsEligible,
    reportsMigrated: totals.reportsMigrated,
    profilesCurrent: totals.profilesCurrent,
    profilesEligible: totals.profilesEligible,
    profilesMigrated: totals.profilesMigrated,
    usersWithoutActiveAccess: totals.usersWithoutActiveAccess,
    failures,
    note: 'No se crean permisos ni se eliminan archivos heredados. Los documentos anteriores se archivan antes de normalizarse.',
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
