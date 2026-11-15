import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const projectId = argument('--project') ?? process.env.FIREBASE_PROJECT_ID;
const apply = process.argv.includes('--apply');
const confirmProduction = process.argv.includes('--confirm-production');
const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

if (!projectId) throw new Error('Indica --project <id> o FIREBASE_PROJECT_ID.');
if (apply && projectId !== 'demo-fireguard' && !confirmProduction) {
  throw new Error('Para borrar archivos de un proyecto real, se requiere --confirm-production después de revisar el dry-run.');
}

if (getApps().length === 0) {
  initializeApp({
    projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`,
  });
}
const db = getFirestore();
const bucket = getStorage().bucket();

async function main() {
  let pageToken;
  const candidates = [];
  const failures = [];
  let scanned = 0;
  do {
    const [files, nextQuery] = await bucket.getFiles({
      prefix: 'reportPhotos/',
      maxResults: 500,
      pageToken,
      autoPaginate: false,
    });
    for (const file of files) {
      scanned += 1;
      const match = /^reportPhotos\/([^/]+)\/([A-Za-z0-9_-]{10,80})\/original$/.exec(file.name);
      if (!match) continue;
      const [, authorId, reportId] = match;
      try {
        const [metadata] = await file.getMetadata();
        const createdAt = Date.parse(String(metadata.timeCreated ?? ''));
        if (!Number.isFinite(createdAt) || createdAt >= cutoff) continue;
        const report = await db.collection('reports').doc(reportId).get();
        if (report.exists) {
          if (report.data()?.authorId !== authorId || report.data()?.photoPath !== file.name) {
            failures.push(`${file.name}: existe un reporte relacionado con propietario o ruta distintos; no se borra.`);
          }
          continue;
        }
        candidates.push(file);
        if (apply) await file.delete();
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    pageToken = nextQuery?.pageToken;
  } while (pageToken);

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    projectId,
    scanned,
    orphanCandidates: candidates.length,
    deleted: apply ? candidates.length : 0,
    candidates: candidates.map((file) => file.name),
    failures,
    rule: 'Solo archivos sin documento reports/{reportId}, con antigüedad mayor a 7 días y ruta exacta.',
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
