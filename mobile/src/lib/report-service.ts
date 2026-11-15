import { httpsCallable } from 'firebase/functions';
import { getMetadata, ref, uploadBytes } from 'firebase/storage';
import type { ImagePickerAsset } from 'expo-image-picker';
import { doc, GeoPoint, getDoc, onSnapshot, orderBy, query, collection, Timestamp, where } from 'firebase/firestore';
import { db, functions, storage } from '@/lib/firebase';

export type Coordinate = { latitude: number; longitude: number };
export type CitizenReport = {
  id: string;
  authorId: string;
  description: string;
  fireLocation: GeoPoint;
  observerLocation: GeoPoint | null;
  observedAt: Timestamp;
  status: string;
  satelliteMatch: 'pending' | 'match_found' | 'no_match_found';
  organizationId: string | null;
  incidentId: string | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp;
  photoPath: string;
};

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function newReportId() {
  return globalThis.crypto?.randomUUID?.().replaceAll('-', '') ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export type ReportUpdate = {
  id: string;
  type: string;
  message: string;
  createdAt: Timestamp | null;
};

function requireFirebase() {
  if (!db || !functions || !storage) {
    throw new Error('Firebase no está configurado; no se guardó ni envió el reporte.');
  }
}

function reportFromSnapshot(id: string, value: Record<string, unknown>): CitizenReport {
  const expectedFields = [
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
  if (
    Object.keys(value).length !== expectedFields.length ||
    expectedFields.some((field) => !(field in value)) ||
    typeof value.authorId !== 'string' ||
    typeof value.description !== 'string' ||
    !(value.fireLocation instanceof GeoPoint) ||
    (value.observerLocation !== null && !(value.observerLocation instanceof GeoPoint)) ||
    !(value.observedAt instanceof Timestamp) ||
    typeof value.photoPath !== 'string' ||
    typeof value.status !== 'string' ||
    !['pending', 'match_found', 'no_match_found'].includes(String(value.satelliteMatch)) ||
    (value.organizationId !== null && typeof value.organizationId !== 'string') ||
    (value.incidentId !== null && typeof value.incidentId !== 'string') ||
    !(value.createdAt instanceof Timestamp) ||
    !(value.updatedAt instanceof Timestamp)
  ) {
    throw new Error(`El reporte ${id} no cumple el modelo vigente.`);
  }
  return { id, ...value } as CitizenReport;
}

function updateFromSnapshot(id: string, value: Record<string, unknown>): ReportUpdate {
  if (
    typeof value.type !== 'string' ||
    typeof value.message !== 'string' ||
    !(value.createdAt instanceof Timestamp)
  ) {
    throw new Error(`La actualización ${id} no cumple el modelo vigente.`);
  }
  return { id, type: value.type, message: value.message, createdAt: value.createdAt };
}

export function validatePhoto(asset: ImagePickerAsset) {
  if (!asset.mimeType || !ACCEPTED_IMAGE_TYPES.has(asset.mimeType.toLowerCase())) {
    throw new Error('Adjunta una imagen JPG, PNG o WebP.');
  }
  if (asset.fileSize != null && (asset.fileSize <= 0 || asset.fileSize > MAX_PHOTO_BYTES)) {
    throw new Error('La imagen debe pesar más de 0 y como máximo 5 MB.');
  }
}

async function uploadPrivatePhoto(uid: string, reportId: string, asset: ImagePickerAsset) {
  const path = `reportPhotos/${uid}/${reportId}/original`;
  const photoRef = ref(storage!, path);
  try {
    await getMetadata(photoRef);
    return path;
  } catch (error) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 'storage/object-not-found'
    ) {
      throw error;
    }
    const response = await fetch(asset.uri);
    if (!response.ok) throw new Error('No se pudo leer la imagen seleccionada.');
    const blob = await response.blob();
    if (blob.size > MAX_PHOTO_BYTES || !ACCEPTED_IMAGE_TYPES.has(blob.type.toLowerCase())) {
      throw new Error('El archivo de imagen no es válido o supera 5 MB.');
    }
    await uploadBytes(photoRef, blob, {
      contentType: asset.mimeType,
      customMetadata: { authorId: uid, reportId },
    });
  }
  return path;
}

export async function submitCitizenReport(input: {
  uid: string;
  reportId: string;
  description: string;
  fireLocation: Coordinate;
  observerLocation: Coordinate | null;
  observedAt: string;
  photo: ImagePickerAsset;
}) {
  requireFirebase();
  validatePhoto(input.photo);
  const reportRef = doc(db!, 'reports', input.reportId);
  const existing = await getDoc(reportRef);
  if (existing.exists()) {
    if (existing.data().authorId !== input.uid) throw new Error('No se puede reutilizar este identificador de reporte.');
    return input.reportId;
  }

  const photoPath = await uploadPrivatePhoto(input.uid, input.reportId, input.photo);
  const createReport = httpsCallable(functions!, 'createCitizenReport');
  await createReport({
    reportId: input.reportId,
    description: input.description.trim(),
    fireLocation: input.fireLocation,
    observerLocation: input.observerLocation,
    observedAt: input.observedAt,
    photoPath,
  });
  return input.reportId;
}

export function subscribeToMyReports(uid: string, onReports: (reports: CitizenReport[]) => void, onError: (error: Error) => void) {
  requireFirebase();
  const reportsQuery = query(collection(db!, 'reports'), where('authorId', '==', uid), orderBy('createdAt', 'desc'));
  return onSnapshot(
    reportsQuery,
    (snapshot) => {
      try {
        onReports(snapshot.docs.map((item) => reportFromSnapshot(item.id, item.data())));
      } catch (error) {
        onError(error instanceof Error ? error : new Error('No se pudieron validar los reportes recibidos.'));
      }
    },
    (error) => onError(error),
  );
}

export function subscribeToReportUpdates(
  reportId: string,
  onUpdates: (updates: ReportUpdate[]) => void,
  onError: (error: Error) => void,
) {
  requireFirebase();
  const updatesQuery = query(
    collection(db!, 'reports', reportId, 'updates'),
    orderBy('createdAt', 'asc'),
  );
  return onSnapshot(
    updatesQuery,
    (snapshot) => {
      try {
        onUpdates(snapshot.docs.map((item) => updateFromSnapshot(item.id, item.data())));
      } catch (error) {
        onError(error instanceof Error ? error : new Error('No se pudieron validar las actualizaciones del reporte.'));
      }
    },
    onError,
  );
}
