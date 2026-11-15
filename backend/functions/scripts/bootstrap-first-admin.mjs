import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const projectId = argument('--project') ?? process.env.FIREBASE_PROJECT_ID;
const uid = argument('--uid');
const apply = process.argv.includes('--apply');
const confirmProduction = process.argv.includes('--confirm-production');

if (!projectId || !uid) {
  throw new Error('Uso: npm run bootstrap:admin -- --project <id> --uid <auth-uid> [--apply --confirm-production].');
}
if (apply && projectId !== 'demo-fireguard' && !confirmProduction) {
  throw new Error('Para escribir en un proyecto real, se requiere --confirm-production después de revisar el dry-run.');
}

if (getApps().length === 0) initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();

async function findExistingAdministrator() {
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      if (user.customClaims?.technicalAdmin === true) return user.uid;
      const access = await db.collection('access').doc(user.uid).get();
      if (access.data()?.active === true && access.data()?.technicalAdmin === true) return user.uid;
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return null;
}

async function main() {
  const target = await auth.getUser(uid);
  const existingAdminUid = await findExistingAdministrator();
  if (existingAdminUid && existingAdminUid !== uid) {
    throw new Error(`Ya existe un administrador técnico (${existingAdminUid}); el bootstrap inicial se cancela.`);
  }
  if (existingAdminUid === uid) {
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', uid, status: 'already-administrator' }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    projectId,
    uid,
    email: target.email ?? null,
    action: 'Conceder el primer rol super_admin y el permiso técnico mediante Admin SDK.',
    note: 'No se crea ni se modifica una contraseña; no se realiza ninguna escritura en modo dry-run.',
  }, null, 2));

  if (!apply) return;

  const stateRef = db.collection('technicalConfig').doc('firstSuperadminBootstrap');
  const accessRef = db.collection('access').doc(uid);
  await db.runTransaction(async (transaction) => {
    const [state, access] = await Promise.all([
      transaction.get(stateRef),
      transaction.get(accessRef),
    ]);
    if (state.exists) throw new Error('El bootstrap inicial ya fue ejecutado.');
    if (access.data()?.technicalAdmin === true) throw new Error('La cuenta ya tiene permiso técnico.');
    transaction.set(accessRef, {
      active: true,
      role: 'super_admin',
      technicalAdmin: true,
      updatedAt: FieldValue.serverTimestamp(),
      ...(!access.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
    transaction.create(stateRef, {
      uid,
      email: target.email ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  await auth.setCustomUserClaims(uid, {
    ...(target.customClaims ?? {}),
    role: 'super_admin',
    technicalAdmin: true,
    brigadeIds: [],
    operationalAreaIds: [],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
