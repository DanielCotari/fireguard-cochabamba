import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { db, functions } from '@/lib/firebase';

export type OperationalDocument = {
  id: string;
  [key: string]: unknown;
};

function requireBackend() {
  if (!db || !functions) {
    throw new Error('Firebase no está configurado. No se realizó ningún cambio operativo.');
  }
}

export async function callOperation<T>(name: string, payload: Record<string, unknown>) {
  requireBackend();
  const callable = httpsCallable<Record<string, unknown>, T>(functions!, name);
  const result = await callable(payload);
  return result.data;
}

function subscribeCollection(
  path: string,
  constraints: QueryConstraint[],
  onItems: (items: OperationalDocument[]) => void,
  onError: (error: Error) => void,
) {
  requireBackend();
  const target = query(collection(db!, path), ...constraints);
  return onSnapshot(
    target,
    (snapshot) => onItems(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError,
  );
}

export function subscribeReportsForReview(
  areaIds: string[],
  onItems: (items: OperationalDocument[]) => void,
  onError: (error: Error) => void,
) {
  if (!areaIds.length) {
    onItems([]);
    return () => undefined;
  }
  return subscribeCollection(
    'reports',
    [where('operationalAreaId', 'in', areaIds.slice(0, 10)), orderBy('createdAt', 'desc')],
    onItems,
    onError,
  );
}

export function subscribeOperationalIncidents(
  uid: string,
  role: string,
  areaIds: string[],
  onItems: (items: OperationalDocument[]) => void,
  onError: (error: Error) => void,
) {
  const constraints: QueryConstraint[] = role === 'firefighter'
    ? [where('assignedUids', 'array-contains', uid), orderBy('createdAt', 'desc')]
    : areaIds.length
      ? [where('operationalAreaId', 'in', areaIds.slice(0, 10)), orderBy('createdAt', 'desc')]
      : [];
  if (!constraints.length) {
    onItems([]);
    return () => undefined;
  }
  return subscribeCollection('incidents', constraints, onItems, onError);
}

export function subscribeIncidentEvents(
  incidentId: string,
  onItems: (items: OperationalDocument[]) => void,
  onError: (error: Error) => void,
) {
  requireBackend();
  const target = query(collection(db!, 'incidents', incidentId, 'events'), orderBy('createdAt', 'asc'));
  return onSnapshot(
    target,
    (snapshot) => onItems(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError,
  );
}

export async function getAuthorizedBrigades(brigadeIds: string[]) {
  requireBackend();
  const snapshots = await Promise.all(
    brigadeIds.map((id) => getDoc(doc(db!, 'brigades', id))),
  );
  return snapshots
    .filter((snapshot) => snapshot.exists())
    .map((snapshot) => Object.assign({ id: snapshot.id }, snapshot.data()));
}

export async function getBrigadeMember(uid: string): Promise<DocumentData | null> {
  requireBackend();
  const member = await getDoc(doc(db!, 'users', uid));
  return member.exists() ? member.data() : null;
}

export function newOperationId() {
  return globalThis.crypto?.randomUUID?.().replaceAll('-', '') ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}
