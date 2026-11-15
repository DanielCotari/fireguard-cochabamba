import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

export type OperationalDocument = {
  id: string;
  [key: string]: unknown;
};

export type OperationalPage = {
  items: OperationalDocument[];
  nextCursor: string | null;
};

export type BrigadeRoster = OperationalDocument & {
  name: string;
  availability: string;
  members: { uid: string; name: string; availability: string }[];
};

function requireBackend() {
  if (!functions) {
    throw new Error('Firebase no está configurado. No se realizó ningún cambio operativo.');
  }
}

export async function callOperation<T>(name: string, payload: Record<string, unknown>) {
  requireBackend();
  const callable = httpsCallable<Record<string, unknown>, T>(functions!, name);
  const result = await callable(payload);
  return result.data;
}

export async function fetchReportsForReview(cursor?: string): Promise<OperationalPage> {
  return callOperation<OperationalPage>('listReportsForReview', cursor ? { cursor } : {});
}

export async function fetchOperationalIncidents(cursor?: string): Promise<OperationalPage> {
  return callOperation<OperationalPage>('listOperationalIncidents', cursor ? { cursor } : {});
}

export async function fetchIncidentLogs(incidentId: string): Promise<OperationalDocument[]> {
  const page = await callOperation<OperationalPage>('listIncidentLogs', { incidentId });
  return page.items;
}

export async function getAuthorizedBrigades(brigadeIds: string[]): Promise<BrigadeRoster[]> {
  const result = await callOperation<{ items: BrigadeRoster[] }>('listAuthorizedBrigades', { brigadeIds });
  return result.items;
}

export function newOperationId() {
  return globalThis.crypto?.randomUUID?.().replaceAll('-', '') ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}
