import { httpsCallable } from 'firebase/functions';
import { getMetadata, ref, uploadBytes, type FullMetadata } from 'firebase/storage';
import type { ImagePickerAsset } from 'expo-image-picker';
import { doc, getDoc, onSnapshot, orderBy, query, collection, where } from 'firebase/firestore';
import { db, functions, storage } from '@/lib/firebase';

export type Coordinate = { latitude: number; longitude: number };
export type CitizenReport = {
  id: string;
  description: string;
  fireLocation: Coordinate;
  observerLocation: Coordinate | null;
  observedAt: string | { seconds: number };
  status: string;
  satelliteMatch: 'pending' | 'match_found' | 'no_match_found';
  incidentId: string | null;
  createdAt: { seconds: number } | null;
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
  createdAt: { seconds: number } | null;
};

function requireFirebase() {
  if (!db || !functions || !storage) {
    throw new Error('Firebase no está configurado; no se guardó ni envió el reporte.');
  }
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
  const path = `report-images/${uid}/${reportId}`;
  const photoRef = ref(storage!, path);
  let metadata: FullMetadata;
  try {
    metadata = await getMetadata(photoRef);
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
    const uploaded = await uploadBytes(photoRef, blob, {
      contentType: asset.mimeType,
      customMetadata: { ownerUid: uid, reportId, operationalAreaId: 'cochabamba-pilot' },
    });
    metadata = uploaded.metadata;
  }
  return { path, size: metadata.size, contentType: metadata.contentType };
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
    if (existing.data().ownerUid !== input.uid) throw new Error('No se puede reutilizar este identificador de reporte.');
    return input.reportId;
  }

  const uploadedPhoto = await uploadPrivatePhoto(input.uid, input.reportId, input.photo);
  const createReport = httpsCallable(functions!, 'createCitizenReport');
  await createReport({
    reportId: input.reportId,
    description: input.description.trim(),
    fireLocation: input.fireLocation,
    observerLocation: input.observerLocation,
    observedAt: input.observedAt,
    photoPath: uploadedPhoto.path,
    photoContentType: uploadedPhoto.contentType,
    photoSize: uploadedPhoto.size,
  });
  return input.reportId;
}

export function subscribeToMyReports(uid: string, onReports: (reports: CitizenReport[]) => void, onError: (error: Error) => void) {
  requireFirebase();
  const reportsQuery = query(collection(db!, 'reports'), where('ownerUid', '==', uid), orderBy('createdAt', 'desc'));
  return onSnapshot(
    reportsQuery,
    (snapshot) => onReports(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as CitizenReport))),
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
    (snapshot) => onUpdates(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ReportUpdate))),
    onError,
  );
}
