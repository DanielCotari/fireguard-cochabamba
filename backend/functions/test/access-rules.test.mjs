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
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
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
      setDoc(doc(firestore, 'access', 'citizen-1'), { active: true, role: 'citizen' }),
      setDoc(doc(firestore, 'access', 'citizen-2'), { active: true, role: 'citizen' }),
      setDoc(doc(firestore, 'access', 'new-citizen'), { active: true, role: 'citizen' }),
      setDoc(doc(firestore, 'access', 'inactive-citizen'), { active: false, role: 'citizen' }),
      setDoc(doc(firestore, 'access', 'firefighter-1'), { active: true, role: 'firefighter' }),
      setDoc(doc(firestore, 'access', 'reviewer-1'), { active: true, role: 'brigade_leader' }),
      setDoc(doc(firestore, 'users', 'citizen-1'), {
        displayName: 'Ciudadano',
        phone: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      setDoc(doc(firestore, 'reports', 'report-citizen-1'), {
        authorId: 'citizen-1',
        description: 'Humo visible cerca del camino.',
        status: 'received',
      }),
      setDoc(doc(firestore, 'reports', 'report-citizen-2'), {
        authorId: 'citizen-2',
        description: 'Humo visible en otra zona.',
        status: 'received',
      }),
      setDoc(doc(firestore, 'incidents', 'incident-private'), { status: 'assigned' }),
      setDoc(doc(firestore, 'incidents', 'incident-private', 'access', 'citizen-1'), { active: true }),
      setDoc(doc(firestore, 'incidents', 'incident-private', 'logs', 'log-1'), {
        message: 'Intervención iniciada.',
      }),
      setDoc(doc(firestore, 'publicDetections', 'detection-1'), { monthId: '2026-01' }),
    ]);
  });
});

test('visitors can read public satellite data but not private user data', async () => {
  const visitor = environment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(visitor, 'publicDetections', 'detection-1')));
  await assertFails(getDoc(doc(visitor, 'reports', 'report-citizen-1')));
  await assertFails(getDoc(doc(visitor, 'users', 'citizen-1')));
});

test('citizens can read only their own profile and reports using authorId filters', async () => {
  const firestore = environment.authenticatedContext('citizen-1').firestore();
  await assertSucceeds(getDoc(doc(firestore, 'users', 'citizen-1')));
  await assertFails(getDoc(doc(firestore, 'users', 'citizen-2')));
  await assertSucceeds(getDoc(doc(firestore, 'reports', 'report-citizen-1')));
  await assertFails(getDoc(doc(firestore, 'reports', 'report-citizen-2')));
  await assertSucceeds(getDocs(query(
    collection(firestore, 'reports'),
    where('authorId', '==', 'citizen-1'),
  )));
  await assertFails(getDocs(collection(firestore, 'reports')));
});

test('clients cannot write access documents or change report state', async () => {
  const firestore = environment.authenticatedContext('citizen-1').firestore();
  await assertFails(setDoc(doc(firestore, 'access', 'citizen-1'), { active: true, role: 'super_admin' }));
  await assertFails(setDoc(doc(firestore, 'reports', 'forged-report-123'), {
    authorId: 'citizen-1',
    status: 'received',
  }));
  await assertFails(setDoc(doc(firestore, 'users', 'citizen-1'), {
    displayName: 'Elevated',
    phone: null,
    email: 'citizen@example.test',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(firestore, 'reports', 'report-citizen-1'), {
    authorId: 'citizen-1',
    status: 'closed',
  }));
});

test('active users can create only the exact profile schema with server timestamps', async () => {
  const firestore = environment.authenticatedContext('new-citizen').firestore();
  await assertSucceeds(setDoc(doc(firestore, 'users', 'new-citizen'), {
    displayName: 'Nueva persona',
    phone: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(firestore, 'users', 'new-citizen'), {
    displayName: 'Perfil no válido',
    phone: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    role: 'super_admin',
  }));
});

test('inactive accounts cannot read private documents', async () => {
  const firestore = environment.authenticatedContext('inactive-citizen').firestore();
  await assertFails(getDoc(doc(firestore, 'users', 'inactive-citizen')));
  await assertFails(getDoc(doc(firestore, 'reports', 'report-citizen-1')));
});

test('operational report and incident lists are not directly readable by clients', async () => {
  const reviewer = environment.authenticatedContext('reviewer-1', {
    role: 'brigade_leader',
    operationalAreaIds: ['zone-1'],
  }).firestore();
  await assertFails(getDoc(doc(reviewer, 'reports', 'report-citizen-1')));
  await assertFails(getDocs(collection(reviewer, 'reports')));
  await assertFails(getDoc(doc(reviewer, 'incidents', 'incident-private')));
  await assertFails(getDocs(collection(reviewer, 'incidents')));
});

test('incident documents and logs require an active per-incident access record', async () => {
  const authorized = environment.authenticatedContext('citizen-1').firestore();
  const unrelated = environment.authenticatedContext('citizen-2').firestore();
  await assertSucceeds(getDoc(doc(authorized, 'incidents', 'incident-private')));
  await assertSucceeds(getDoc(doc(authorized, 'incidents', 'incident-private', 'logs', 'log-1')));
  await assertFails(getDoc(doc(unrelated, 'incidents', 'incident-private')));
  await assertFails(getDoc(doc(unrelated, 'incidents', 'incident-private', 'logs', 'log-1')));
});

test('revoking incident access immediately blocks incident and log reads', async () => {
  const firestore = environment.authenticatedContext('citizen-1').firestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'incidents', 'incident-private', 'access', 'citizen-1'), {
      active: false,
    });
  });
  await assertFails(getDoc(doc(firestore, 'incidents', 'incident-private')));
  await assertFails(getDoc(doc(firestore, 'incidents', 'incident-private', 'logs', 'log-1')));
});

test('report photos are private, owner-scoped, bounded, and immutable', async () => {
  const ownerStorage = environment.authenticatedContext('citizen-1').storage();
  const image = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const ownerPhoto = ref(ownerStorage, 'reportPhotos/citizen-1/report-citizen-1/original');
  await assertSucceeds(uploadBytes(ownerPhoto, image, {
    contentType: 'image/jpeg',
    customMetadata: { authorId: 'citizen-1', reportId: 'report-citizen-1' },
  }));
  await assertSucceeds(getBytes(ownerPhoto));

  const otherStorage = environment.authenticatedContext('citizen-2').storage();
  await assertFails(getBytes(ref(otherStorage, 'reportPhotos/citizen-1/report-citizen-1/original')));
  await assertFails(uploadBytes(
    ref(otherStorage, 'reportPhotos/citizen-1/report-citizen-1/original'),
    image,
    { contentType: 'image/jpeg', customMetadata: { authorId: 'citizen-1', reportId: 'report-citizen-1' } },
  ));
  await assertFails(uploadBytes(
    ref(ownerStorage, 'reportPhotos/citizen-1/report-citizen-1/original'),
    image,
    { contentType: 'image/jpeg', customMetadata: { authorId: 'citizen-1', reportId: 'report-citizen-1' } },
  ));
  await assertFails(uploadBytes(
    ref(ownerStorage, 'reportPhotos/citizen-1/report-citizen-2/original'),
    image,
    { contentType: 'image/svg+xml', customMetadata: { authorId: 'citizen-1', reportId: 'report-citizen-2' } },
  ));
  const inactiveStorage = environment.authenticatedContext('inactive-citizen').storage();
  await assertFails(uploadBytes(
    ref(inactiveStorage, 'reportPhotos/inactive-citizen/report-citizen-3/original'),
    image,
    { contentType: 'image/jpeg', customMetadata: { authorId: 'inactive-citizen', reportId: 'report-citizen-3' } },
  ));
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'access', 'citizen-1'), { active: false });
  });
  await assertFails(getBytes(ownerPhoto));
});
