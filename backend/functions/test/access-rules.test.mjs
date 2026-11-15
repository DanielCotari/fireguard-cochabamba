import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { after, before, beforeEach, test } from 'node:test';

let environment;

before(async () => {
  const firestoreRules = await readFile(new URL('../../../firestore.rules', import.meta.url), 'utf8');
  const storageRules = await readFile(new URL('../../../storage.rules', import.meta.url), 'utf8');
  environment = await initializeTestEnvironment({
    projectId: 'demo-fireguard',
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules },
  });
});

after(async () => {
  await environment?.cleanup();
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await Promise.all([
      setDoc(doc(firestore, 'reports', 'report-citizen-1'), {
        ownerUid: 'citizen-1',
        operationalAreaId: 'zone-1',
        status: 'received',
      }),
      setDoc(doc(firestore, 'reports', 'report-citizen-2'), {
        ownerUid: 'citizen-2',
        operationalAreaId: 'zone-2',
        status: 'received',
      }),
      setDoc(doc(firestore, 'incidents', 'incident-citizen-1'), {
        citizenUids: ['citizen-1'],
        assignedUids: ['firefighter-1'],
        operationalAreaId: 'zone-1',
        status: 'assigned',
      }),
      setDoc(doc(firestore, 'incidents', 'incident-private'), {
        citizenUids: [],
        assignedUids: [],
        operationalAreaId: 'zone-2',
        status: 'assigned',
      }),
      setDoc(doc(firestore, 'incidents', 'incident-citizen-1', 'events', 'event-1'), {
        message: 'Intervención iniciada.',
      }),
    ]);
  });
});

test('citizens can read their own reports but not another citizen report', async () => {
  const firestore = environment.authenticatedContext('citizen-1', {
    role: 'citizen',
    email: 'citizen@example.test',
  }).firestore();
  await assertSucceeds(getDoc(doc(firestore, 'reports', 'report-citizen-1')));
  await assertFails(getDoc(doc(firestore, 'reports', 'report-citizen-2')));
});

test('clients cannot create reports directly or grant themselves operational claims', async () => {
  const firestore = environment.authenticatedContext('citizen-1', {
    role: 'citizen',
    email: 'citizen@example.test',
  }).firestore();
  await assertFails(setDoc(doc(firestore, 'reports', 'forged-report-123'), {
    ownerUid: 'citizen-1',
    operationalAreaId: 'zone-1',
  }));
  await assertFails(setDoc(doc(firestore, 'users', 'citizen-1'), {
    displayName: 'Ciudadano',
    email: 'citizen@example.test',
    phone: null,
    role: 'incident_commander',
    createdAt: serverTimestamp(),
  }));
});

test('operational reviewers only read reports in their authorized area', async () => {
  const reviewer = environment.authenticatedContext('reviewer-1', {
    role: 'brigade_leader',
    operationalAreaIds: ['zone-1'],
  }).firestore();
  await assertSucceeds(getDoc(doc(reviewer, 'reports', 'report-citizen-1')));
  await assertFails(getDoc(doc(reviewer, 'reports', 'report-citizen-2')));
});

test('incident access is limited to linked citizens, assigned personnel, and the authorized area', async () => {
  const citizen = environment.authenticatedContext('citizen-1', { role: 'citizen' }).firestore();
  const firefighter = environment.authenticatedContext('firefighter-1', { role: 'firefighter' }).firestore();
  const reviewer = environment.authenticatedContext('reviewer-1', {
    role: 'incident_commander',
    operationalAreaIds: ['zone-1'],
  }).firestore();
  const unrelated = environment.authenticatedContext('other-user', { role: 'citizen' }).firestore();
  const technicalAdmin = environment.authenticatedContext('admin-1', {
    role: 'super_admin',
    technicalAdmin: true,
  }).firestore();

  await assertSucceeds(getDoc(doc(citizen, 'incidents', 'incident-citizen-1')));
  await assertSucceeds(getDoc(doc(citizen, 'incidents', 'incident-citizen-1', 'events', 'event-1')));
  await assertSucceeds(getDoc(doc(firefighter, 'incidents', 'incident-citizen-1')));
  await assertSucceeds(getDoc(doc(reviewer, 'incidents', 'incident-citizen-1')));
  await assertFails(getDoc(doc(unrelated, 'incidents', 'incident-citizen-1')));
  await assertFails(getDoc(doc(reviewer, 'incidents', 'incident-private')));
  await assertFails(getDoc(doc(technicalAdmin, 'incidents', 'incident-private')));
  await assertFails(getDocs(collection(citizen, 'incidents')));
});

test('report photographs accept only the owner and bounded image uploads', async () => {
  const ownerStorage = environment.authenticatedContext('citizen-1').storage();
  const image = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  await assertSucceeds(uploadBytes(
    ref(ownerStorage, 'report-images/citizen-1/report-citizen-1'),
    image,
    {
      contentType: 'image/jpeg',
      customMetadata: {
        ownerUid: 'citizen-1',
        reportId: 'report-citizen-1',
        operationalAreaId: 'cochabamba-pilot',
      },
    },
  ));
  const otherStorage = environment.authenticatedContext('citizen-2').storage();
  await assertFails(uploadBytes(
    ref(otherStorage, 'report-images/citizen-1/report-citizen-1'),
    image,
    {
      contentType: 'image/jpeg',
      customMetadata: {
        ownerUid: 'citizen-1',
        reportId: 'report-citizen-1',
        operationalAreaId: 'cochabamba-pilot',
      },
    },
  ));
});
