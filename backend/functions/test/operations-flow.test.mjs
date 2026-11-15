import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getFirestore,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from 'firebase/functions';
import {
  connectStorageEmulator,
  getStorage,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore';

const PROJECT_ID = 'demo-fireguard';
const REGION = 'us-central1';
const apps = [];
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
const app = initializeAdminApp({
  projectId: PROJECT_ID,
  storageBucket: `${PROJECT_ID}.appspot.com`,
}, 'operations-test-admin');
const adminAuth = getAdminAuth(app);
const adminDb = getAdminFirestore(app);

async function submitReport(clientApp, citizenUid, areaId, description) {
  const reportId = randomUUID().replaceAll('-', '');
  await uploadBytes(
    ref(getStorage(clientApp), `reportPhotos/${citizenUid}/${reportId}/original`),
    new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    {
      contentType: 'image/jpeg',
      customMetadata: {
        authorId: citizenUid,
        reportId,
      },
    },
  );
  const createReport = httpsCallable(getFunctions(clientApp, REGION), 'createCitizenReport');
  const payload = {
    reportId,
    description,
    fireLocation: { latitude: -17.3, longitude: -66.1 },
    observerLocation: null,
    observedAt: new Date().toISOString(),
    photoPath: `reportPhotos/${citizenUid}/${reportId}/original`,
  };
  await createReport(payload);
  await createReport(payload);
  return reportId;
}

after(async () => {
  await Promise.all(apps.map((client) => deleteApp(client)));
  await deleteAdminApp(app);
});

test('citizen report reaches an incident, brigade, intervention, and citizen history', async () => {
  const citizenApp = initializeApp({
    apiKey: 'emulator-api-key',
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    projectId: PROJECT_ID,
    storageBucket: `${PROJECT_ID}.appspot.com`,
    appId: `1:123456789:web:${randomUUID()}`,
  }, `citizen-${randomUUID()}`);
  const firefighterApp = initializeApp({
    apiKey: 'emulator-api-key',
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    projectId: PROJECT_ID,
    storageBucket: `${PROJECT_ID}.appspot.com`,
    appId: `1:123456789:web:${randomUUID()}`,
  }, `firefighter-${randomUUID()}`);
  const leaderApp = initializeApp({
    apiKey: 'emulator-api-key',
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    projectId: PROJECT_ID,
    storageBucket: `${PROJECT_ID}.appspot.com`,
    appId: `1:123456789:web:${randomUUID()}`,
  }, `leader-${randomUUID()}`);
  apps.push(citizenApp, firefighterApp, leaderApp);

  const clients = [citizenApp, firefighterApp, leaderApp];
  for (const client of clients) {
    connectAuthEmulator(getAuth(client), 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(getFirestore(client), '127.0.0.1', 8080);
    connectFunctionsEmulator(getFunctions(client, REGION), '127.0.0.1', 5001);
    connectStorageEmulator(getStorage(client), '127.0.0.1', 9199);
  }

  const citizenCredential = await createUserWithEmailAndPassword(
    getAuth(citizenApp),
    `citizen-${randomUUID()}@example.test`,
    'test-pass-123',
  );
  const firefighterCredential = await createUserWithEmailAndPassword(
    getAuth(firefighterApp),
    `firefighter-${randomUUID()}@example.test`,
    'test-pass-123',
  );
  const leaderCredential = await createUserWithEmailAndPassword(
    getAuth(leaderApp),
    `leader-${randomUUID()}@example.test`,
    'test-pass-123',
  );
  const citizenUid = citizenCredential.user.uid;
  const firefighterUid = firefighterCredential.user.uid;
  const leaderUid = leaderCredential.user.uid;
  const brigadeId = 'brigade-123';
  const areaId = 'cochabamba-pilot';
  await updateProfile(citizenCredential.user, { displayName: 'Ciudadano de prueba' });
  const ensureCitizenAccess = httpsCallable(getFunctions(citizenApp, REGION), 'ensureCitizenAccess');
  await ensureCitizenAccess({});
  await ensureCitizenAccess({});
  await setDoc(doc(getFirestore(citizenApp), 'users', citizenUid), {
    displayName: 'Ciudadano de prueba',
    phone: '+591 70000000',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await adminDb.collection('access').doc(leaderUid).set({
    active: true,
    role: 'brigade_leader',
    brigadeIds: [brigadeId],
    operationalAreaIds: [areaId],
  });
  await adminDb.collection('access').doc(firefighterUid).set({
    active: true,
    role: 'firefighter',
    brigadeIds: [brigadeId],
    operationalAreaIds: [areaId],
  });
  await adminAuth.setCustomUserClaims(leaderUid, {
    role: 'brigade_leader',
    brigadeIds: [brigadeId],
    operationalAreaIds: [areaId],
  });
  await adminAuth.setCustomUserClaims(firefighterUid, {
    role: 'firefighter',
    brigadeIds: [brigadeId],
    operationalAreaIds: [areaId],
  });
  await Promise.all([
    adminDb.collection('users').doc(leaderUid).set({
      displayName: 'Encargado de prueba',
      phone: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }),
    adminDb.collection('users').doc(firefighterUid).set({
      displayName: 'Bombero de prueba',
      phone: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }),
    adminDb.collection('availability').doc(firefighterUid).set({
      status: 'available',
      updatedAt: FieldValue.serverTimestamp(),
    }),
    adminDb.collection('brigades').doc(brigadeId).set({
      name: 'Brigada de prueba',
      leaderUid,
      operationalAreaId: areaId,
      availability: 'available',
    }),
    adminDb.collection('brigades').doc(brigadeId).collection('members').doc(firefighterUid).set({
      active: true,
      role: 'firefighter',
    }),
  ]);
  await Promise.all([
    leaderCredential.user.getIdToken(true),
    firefighterCredential.user.getIdToken(true),
  ]);

  const citizenFunctions = getFunctions(citizenApp, REGION);
  const citizenReports = getFirestore(citizenApp);
  const reportId = await submitReport(
    citizenApp,
    citizenUid,
    areaId,
    'Humo visible cerca del camino principal.',
  );
  const leaderFunctions = getFunctions(leaderApp, REGION);
  const reviewQueue = await httpsCallable(leaderFunctions, 'listReportsForReview')({});
  assert.ok(reviewQueue.data.items.some((report) => report.id === reportId));
  await assert.rejects(getDoc(doc(getFirestore(leaderApp), 'reports', reportId)));
  const photoCallable = httpsCallable(leaderFunctions, 'getAuthorizedReportPhoto');
  await adminDb.collection('access').doc(leaderUid).update({
    operationalAreaIds: ['unassigned-area'],
  });
  await assert.rejects(
    photoCallable({ reportId }),
    (error) => error.code === 'functions/permission-denied',
  );
  await adminDb.collection('access').doc(leaderUid).update({
    operationalAreaIds: [areaId],
  });
  await assert.rejects(
    httpsCallable(citizenFunctions, 'getAuthorizedReportPhoto')({ reportId }),
    (error) => error.code === 'functions/permission-denied',
  );
  const storedReport = await getDoc(doc(citizenReports, 'reports', reportId));
  const reportData = storedReport.data();
  const reportFields = [
    'authorId',
    'description',
    'observerLocation',
    'fireLocation',
    'observedAt',
    'photoPath',
    'status',
    'satelliteMatch',
    'organizationId',
    'incidentId',
    'createdAt',
    'updatedAt',
  ];
  assert.deepEqual(Object.keys(reportData ?? {}).sort(), [...reportFields].sort());
  if (
    !storedReport.exists() ||
    reportData.authorId !== citizenUid ||
    typeof reportData.fireLocation.latitude !== 'number' ||
    reportData.observerLocation !== null ||
    typeof reportData.observedAt.toDate !== 'function'
  ) {
    throw new Error('El reporte no quedó guardado para su cuenta ciudadana.');
  }
  const profile = await getDoc(doc(citizenReports, 'users', citizenUid));
  assert.deepEqual(Object.keys(profile.data() ?? {}).sort(), ['createdAt', 'displayName', 'phone', 'updatedAt']);
  await assert.rejects(
    httpsCallable(citizenFunctions, 'reviewReport')({
      reportId,
      decision: 'create_incident',
      requestId: randomUUID().replaceAll('-', ''),
    }),
  );

  const review = httpsCallable(leaderFunctions, 'reviewReport');
  const incidentResult = await review({
    reportId,
    decision: 'create_incident',
    requestId: randomUUID().replaceAll('-', ''),
  });
  const incidentId = incidentResult.data.incidentId;
  if (typeof incidentId !== 'string') throw new Error('La evaluación no creó un incidente.');
  const leaderIncidents = await httpsCallable(leaderFunctions, 'listOperationalIncidents')({});
  assert.ok(leaderIncidents.data.items.some((incident) => incident.id === incidentId));
  const incidentLogs = await httpsCallable(leaderFunctions, 'listIncidentLogs')({ incidentId });
  assert.ok(incidentLogs.data.items.some((log) => log.type === 'incident_created'));
  const authorizedBrigades = await httpsCallable(leaderFunctions, 'listAuthorizedBrigades')({
    brigadeIds: [brigadeId],
  });
  assert.equal(authorizedBrigades.data.items[0].members[0].uid, firefighterUid);

  const secondReportId = await submitReport(
    citizenApp,
    citizenUid,
    areaId,
    'Se observa humo desde una segunda ubicación cercana.',
  );
  await httpsCallable(leaderFunctions, 'linkReportToIncident')({
    reportId: secondReportId,
    incidentId,
    requestId: randomUUID().replaceAll('-', ''),
  });

  const assignRequestId = randomUUID().replaceAll('-', '');
  const assign = httpsCallable(leaderFunctions, 'assignBrigade');
  const assignment = { incidentId, brigadeId, firefighterUid, requestId: assignRequestId };
  await assign(assignment);
  await assign(assignment);

  const firefighterFunctions = getFunctions(firefighterApp, REGION);
  const declineAssignment = httpsCallable(firefighterFunctions, 'declineIncidentAssignment');
  await declineAssignment({
    incidentId,
    reason: 'Se requiere reasignación por falta de equipo de protección.',
    requestId: randomUUID().replaceAll('-', ''),
  });
  const pendingIncident = await getDoc(doc(getFirestore(leaderApp), 'incidents', incidentId));
  if (pendingIncident.data()?.status !== 'pending_assignment') {
    throw new Error('El incidente no volvió a pendiente de asignación tras el rechazo.');
  }
  await assign({
    incidentId,
    brigadeId,
    firefighterUid,
    requestId: randomUUID().replaceAll('-', ''),
  });

  const updateStatus = httpsCallable(firefighterFunctions, 'updateIncidentStatus');
  const recordObservation = httpsCallable(firefighterFunctions, 'recordIncidentObservation');
  await updateStatus({ incidentId, status: 'en_route', requestId: randomUUID().replaceAll('-', '') });
  await recordObservation({
    incidentId,
    note: 'El equipo llegó al punto indicado y evalúa el perímetro.',
    requestId: randomUUID().replaceAll('-', ''),
  });
  await updateStatus({ incidentId, status: 'in_intervention', requestId: randomUUID().replaceAll('-', '') });
  await updateStatus({
    incidentId,
    status: 'closed',
    note: 'Incidente controlado y área revisada.',
    requestId: randomUUID().replaceAll('-', ''),
  });

  const incident = await getDoc(doc(citizenReports, 'incidents', incidentId));
  if (!incident.exists() || incident.data().status !== 'closed' || incident.data().reportIds.length !== 2) {
    throw new Error('El incidente no reflejó el cierre confirmado.');
  }
  for (const linkedReportId of [reportId, secondReportId]) {
    const reportUpdates = await getDocs(query(
      collection(citizenReports, 'reports', linkedReportId, 'updates'),
      orderBy('createdAt', 'asc'),
    ));
    const updateMessages = reportUpdates.docs.map((item) => item.data().message);
    for (const expected of ['Reporte recibido para evaluación.', 'pasó a evaluación', 'Una brigada fue asignada al incidente.', 'asignación no pudo continuar', 'inició su desplazamiento', 'inició la intervención', 'fue cerrado']) {
      if (!updateMessages.some((message) => typeof message === 'string' && message.includes(expected))) {
        throw new Error(`Falta la actualización ciudadana esperada: ${expected}`);
      }
    }
  }
  const events = await getDocs(query(
    collection(citizenReports, 'incidents', incidentId, 'logs'),
    orderBy('createdAt', 'asc'),
  ));
  if (!events.docs.some((item) => item.data().type === 'observation')) {
    throw new Error('La observación no quedó en la bitácora del incidente.');
  }
  assert.equal(events.docs.filter((item) => item.data().type === 'brigade_assigned').length, 2);
  assert.equal(events.docs.filter((item) => item.data().type === 'assignment_declined').length, 1);
  const firefighterAvailability = await getDoc(doc(getFirestore(firefighterApp), 'availability', firefighterUid));
  if (firefighterAvailability.data()?.status !== 'available') {
    throw new Error('La disponibilidad del integrante no se liberó al cerrar el incidente.');
  }

  await signOut(getAuth(citizenApp));
  const signedIn = await signInWithEmailAndPassword(
    getAuth(citizenApp),
    citizenCredential.user.email,
    'test-pass-123',
  );
  await sendPasswordResetEmail(getAuth(citizenApp), citizenCredential.user.email);
  if (signedIn.user.uid !== citizenUid) throw new Error('El inicio de sesión no recuperó la cuenta ciudadana.');
});
