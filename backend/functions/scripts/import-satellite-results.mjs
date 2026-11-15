import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const projectId = argument('--project') ?? process.env.FIREBASE_PROJECT_ID;
const apply = process.argv.includes('--apply');
const confirmProduction = process.argv.includes('--confirm-production');
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const dataRoot = path.join(repositoryRoot, 'mobile', 'public', 'data');

if (!projectId) throw new Error('Indica --project <id> o FIREBASE_PROJECT_ID.');
if (apply && projectId !== 'demo-fireguard' && !confirmProduction) {
  throw new Error('Para escribir en un proyecto real, se requiere --confirm-production después de revisar el dry-run.');
}

if (getApps().length === 0) initializeApp({ projectId });
const db = getFirestore();

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function monthId(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

async function loadGeoJson(relativePath, month, sensor) {
  if (typeof relativePath !== 'string') return [];
  const relativeFile = relativePath.replace(/^\/data\//, '');
  const resolvedPath = path.resolve(dataRoot, relativeFile);
  if (!resolvedPath.startsWith(path.resolve(dataRoot) + path.sep)) {
    throw new Error(`La ruta de datos queda fuera de mobile/public/data: ${relativePath}`);
  }
  const content = await readFile(resolvedPath);
  const collection = JSON.parse(content.toString('utf8'));
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error(`GeoJSON no válido: ${relativePath}`);
  }
  return collection.features.map((feature) => {
    if (
      feature.type !== 'Feature' ||
      feature.geometry?.type !== 'Point' ||
      !Array.isArray(feature.geometry.coordinates) ||
      feature.geometry.coordinates.length !== 2 ||
      typeof feature.properties !== 'object' ||
      feature.properties === null
    ) {
      throw new Error(`Detección inválida en ${relativePath}.`);
    }
    const [longitude, latitude] = feature.geometry.coordinates;
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error(`Coordenadas inválidas en ${relativePath}.`);
    }
    const record = {
      sensor,
      year: month.year,
      month: month.month,
      yearMonth: monthId(month.year, month.month),
      latitude,
      longitude,
      properties: feature.properties,
    };
    return { id: hash(stableJson(record)), record };
  });
}

async function writeDetectionPages(records, importId) {
  const chunkSize = 400;
  for (let offset = 0; offset < records.length; offset += chunkSize) {
    const batch = db.batch();
    for (const { id, record } of records.slice(offset, offset + chunkSize)) {
      batch.set(db.collection('publicDetections').doc(id), {
        ...record,
        importId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

async function main() {
  const calendarBytes = await readFile(path.join(dataRoot, 'fire-calendar.json'));
  const calendar = JSON.parse(calendarBytes.toString('utf8'));
  if (!Array.isArray(calendar.monthly) || typeof calendar.status !== 'string') {
    throw new Error('fire-calendar.json no contiene el esquema mensual esperado.');
  }

  const detections = [];
  for (const month of calendar.monthly) {
    if (!Number.isInteger(month.year) || !Number.isInteger(month.month) || month.month < 1 || month.month > 12) {
      throw new Error('El calendario contiene un año o mes inválido.');
    }
    detections.push(...await loadGeoJson(month.modis_geojson, month, 'MODIS'));
    detections.push(...await loadGeoJson(month.viirs_geojson, month, 'VIIRS'));
  }

  const importId = hash(stableJson({
    calendar: calendarBytes.toString('utf8'),
    detectionIds: detections.map((detection) => detection.id).sort(),
  }));
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    projectId,
    importId,
    status: calendar.status,
    monthlyDocuments: calendar.monthly.length,
    publicDetectionDocuments: detections.length,
    publicCollections: ['publicDetections', 'publicMonthlyStats', 'publicCoverage', 'publicConfig'],
    traceCollections: ['satelliteImports', 'harmonizationRuns'],
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) return;

  await writeDetectionPages(detections, importId);
  const batchSize = 400;
  for (let offset = 0; offset < calendar.monthly.length; offset += batchSize) {
    const batch = db.batch();
    for (const month of calendar.monthly.slice(offset, offset + batchSize)) {
      const id = monthId(month.year, month.month);
      const timestamps = {
        importId,
        updatedAt: FieldValue.serverTimestamp(),
      };
      batch.set(db.collection('publicMonthlyStats').doc(id), { ...month, yearMonth: id, ...timestamps });
      batch.set(db.collection('publicCoverage').doc(id), {
        year: month.year,
        month: month.month,
        coverage: month.coverage,
        modisAvailable: month.modis_geojson !== null,
        viirsAvailable: month.viirs_geojson !== null,
        importId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  const run = {
    importId,
    status: calendar.status,
    statusMessage: calendar.statusMessage,
    metadata: calendar.metadata,
    harmonization: calendar.harmonization,
    evaluation: calendar.evaluation,
    monthlyDocuments: calendar.monthly.length,
    detectionDocuments: detections.length,
    importedAt: FieldValue.serverTimestamp(),
  };
  const traceBatch = db.batch();
  traceBatch.set(db.collection('satelliteImports').doc(importId), run);
  traceBatch.set(db.collection('harmonizationRuns').doc(importId), run);
  traceBatch.set(db.collection('publicConfig').doc('satellite'), {
    status: calendar.status,
    statusMessage: calendar.statusMessage,
    importId,
    metadata: calendar.metadata,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await traceBatch.commit();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
