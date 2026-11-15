import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';

if (getApps().length === 0) initializeApp();

const db = getFirestore();
const authAdmin = getAuth();
const bucket = getStorage().bucket();
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const OPERATIONAL_ROLES = new Set(['firefighter', 'brigade_leader', 'incident_commander']);
const INCIDENT_TRANSITIONS: Record<string, string[]> = {
  assigned: ['en_route'],
  en_route: ['in_intervention'],
  in_intervention: ['monitoring', 'closed'],
  monitoring: ['in_intervention', 'closed'],
};

type Coordinate = { latitude: number; longitude: number };

function dataObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'La solicitud tiene un formato inválido.');
  }
  return value as Record<string, unknown>;
}

function stringField(data: Record<string, unknown>, key: string, minimum = 1, maximum = 200): string {
  const value = data[key];
  if (typeof value !== 'string' || value.trim().length < minimum || value.trim().length > maximum) {
    throw new HttpsError('invalid-argument', `El campo ${key} no es válido.`);
  }
  return value.trim();
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{10,80}$/.test(value)) {
    throw new HttpsError('invalid-argument', `El identificador ${field} no es válido.`);
  }
  return value;
}

function coordinate(value: unknown, field: string, required: boolean): Coordinate | null {
  if (value == null && !required) return null;
  const point = dataObject(value);
  const latitude = point.latitude;
  const longitude = point.longitude;
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
    throw new HttpsError('invalid-argument', `La ubicación ${field} no es válida.`);
  }
  return { latitude, longitude };
}

function requireUid(request: CallableRequest<unknown>): string {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Inicia sesión para continuar.');
  return request.auth.uid;
}

function roleOf(request: CallableRequest<unknown>): string {
  return typeof request.auth?.token.role === 'string' ? request.auth.token.role : 'citizen';
}

async function requireRoles(request: CallableRequest<unknown>, roles: string[]): Promise<string> {
  const uid = requireUid(request);
  const access = await db.collection('access').doc(uid).get();
  const accessRole = access.data()?.role;
  if (
    !access.exists ||
    access.data()?.active !== true ||
    typeof accessRole !== 'string' ||
    !roles.includes(accessRole) ||
    roleOf(request) !== accessRole
  ) {
    throw new HttpsError('permission-denied', 'Tu cuenta no tiene permisos para esta operación.');
  }
  return uid;
}

async function requireTechnicalAdmin(request: CallableRequest<unknown>): Promise<string> {
  const uid = requireUid(request);
  const access = await db.collection('access').doc(uid).get();
  if (
    !access.exists ||
    access.data()?.active !== true ||
    access.data()?.technicalAdmin !== true ||
    request.auth?.token.technicalAdmin !== true
  ) {
    throw new HttpsError('permission-denied', 'Se requiere una cuenta de administración técnica autorizada.');
  }
  return uid;
}

function hasOperationalArea(areas: unknown, reportArea: unknown): boolean {
  return Array.isArray(areas) && typeof reportArea === 'string' && areas.includes(reportArea);
}

async function leaderHasArea(request: CallableRequest<unknown>, reportArea: unknown): Promise<boolean> {
  const uid = requireUid(request);
  return hasOperationalArea(await operationalAreaIds(uid), reportArea);
}

async function operationalAreaIds(uid: string): Promise<string[]> {
  const access = await db.collection('access').doc(uid).get();
  if (access.data()?.active !== true) return [];
  const areas = access.data()?.operationalAreaIds;
  return Array.isArray(areas)
    ? [...new Set(areas.filter((area): area is string => typeof area === 'string'))].slice(0, 10)
    : [];
}

function assertPhotoMetadata(
  metadata: {
    size?: string | number;
    contentType?: string;
    metadata?: Record<string, string | number | boolean | null>;
  },
  uid: string,
  reportId: string,
) {
  const size = Number(metadata.size);
  if (
    !Number.isFinite(size) ||
    size <= 0 ||
    size > MAX_PHOTO_BYTES ||
    !metadata.contentType ||
    !ALLOWED_IMAGE_TYPES.has(metadata.contentType.toLowerCase()) ||
    metadata.metadata?.authorId !== uid ||
    metadata.metadata?.reportId !== reportId
  ) {
    throw new HttpsError('invalid-argument', 'La fotografía no cumple los requisitos de tipo, tamaño o propiedad.');
  }
}

function pageSize(value: unknown): number {
  if (value === undefined) return 25;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 50) {
    throw new HttpsError('invalid-argument', 'El límite de página debe ser un entero entre 1 y 50.');
  }
  return value;
}

export const ensureCitizenAccess = onCall(async (request) => {
  const uid = requireUid(request);
  const accessRef = db.collection('access').doc(uid);
  return db.runTransaction(async (transaction) => {
    const access = await transaction.get(accessRef);
    if (access.exists) {
      if (access.data()?.active !== true) {
        throw new HttpsError('permission-denied', 'La cuenta no tiene acceso activo.');
      }
      return { active: true, role: access.data()?.role };
    }

    const claims = request.auth?.token;
    if (
      (typeof claims?.role === 'string' && claims.role !== 'citizen') ||
      claims?.technicalAdmin === true
    ) {
      throw new HttpsError('failed-precondition', 'La cuenta requiere activación administrativa antes de completar el perfil.');
    }

    const now = FieldValue.serverTimestamp();
    transaction.create(accessRef, {
      active: true,
      role: 'citizen',
      createdAt: now,
      updatedAt: now,
    });
    return { active: true, role: 'citizen' };
  });
});

export const createCitizenReport = onCall(async (request) => {
  const uid = await requireRoles(request, ['citizen']);
  const data = dataObject(request.data);
  const access = await db.collection('access').doc(uid).get();
  if (!access.exists || access.data()?.active !== true || access.data()?.role !== 'citizen') {
    throw new HttpsError('permission-denied', 'La cuenta no tiene acceso ciudadano activo.');
  }
  const reportId = identifier(data.reportId, 'reportId');
  const description = stringField(data, 'description', 10, 2000);
  const fireLocation = coordinate(data.fireLocation, 'del posible incendio', true)!;
  const observerLocation = coordinate(data.observerLocation, 'del observador', false);
  const observedAt = stringField(data, 'observedAt', 10, 40);
  const observedDate = new Date(observedAt);
  if (Number.isNaN(observedDate.getTime())) {
    throw new HttpsError('invalid-argument', 'La fecha y hora de observación no son válidas.');
  }
  const photoPath = stringField(data, 'photoPath', 1, 200);
  const expectedPhotoPath = `reportPhotos/${uid}/${reportId}/original`;
  if (photoPath !== expectedPhotoPath) {
    throw new HttpsError('permission-denied', 'La ruta de la fotografía no corresponde a tu reporte.');
  }

  const image = bucket.file(photoPath);
  const [exists] = await image.exists();
  if (!exists) throw new HttpsError('failed-precondition', 'La fotografía aún no se ha guardado.');
  const [metadata] = await image.getMetadata();
  assertPhotoMetadata(metadata, uid, reportId);

  const reportRef = db.collection('reports').doc(reportId);
  const reviewRef = db.collection('reportReviews').doc(reportId);
  const updateRef = reportRef.collection('updates').doc('received');
  await db.runTransaction(async (transaction) => {
    const [report, review] = await Promise.all([
      transaction.get(reportRef),
      transaction.get(reviewRef),
    ]);
    if (report.exists) {
      if (report.data()?.authorId !== uid) {
        throw new HttpsError('already-exists', 'Este identificador ya pertenece a otro reporte.');
      }
      if (!review.exists) {
        transaction.create(reviewRef, {
          authorId: uid,
          operationalAreaId: 'cochabamba-pilot',
          status: 'received',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      return;
    }

    transaction.create(reportRef, {
      authorId: uid,
      description,
      fireLocation: new GeoPoint(fireLocation.latitude, fireLocation.longitude),
      observerLocation: observerLocation
        ? new GeoPoint(observerLocation.latitude, observerLocation.longitude)
        : null,
      observedAt: Timestamp.fromDate(observedDate),
      photoPath,
      status: 'received',
      satelliteMatch: 'pending',
      organizationId: null,
      incidentId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(reviewRef, {
      authorId: uid,
      operationalAreaId: 'cochabamba-pilot',
      status: 'received',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(updateRef, {
      type: 'report_received',
      message: 'Reporte recibido para evaluación.',
      actorUid: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { reportId };
});

export const reviewReport = onCall(async (request) => {
  const uid = await requireRoles(request, ['brigade_leader', 'incident_commander']);
  const data = dataObject(request.data);
  const reportId = identifier(data.reportId, 'reportId');
  const requestId = identifier(data.requestId, 'requestId');
  const decision = stringField(data, 'decision', 1, 40);
  if (!['create_incident', 'keep_evaluating', 'close_without_incident'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'La decisión de evaluación no es válida.');
  }

  const reportRef = db.collection('reports').doc(reportId);
  const reviewRef = db.collection('reportReviews').doc(reportId);
  const updateRef = reportRef.collection('updates').doc(requestId);
  const incidentRef = decision === 'create_incident' ? db.collection('incidents').doc() : null;
  return db.runTransaction(async (transaction) => {
    const [report, review, priorUpdate] = await Promise.all([
      transaction.get(reportRef),
      transaction.get(reviewRef),
      transaction.get(updateRef),
    ]);
    if (priorUpdate.exists) return { incidentId: priorUpdate.data()?.incidentId ?? null };
    if (!report.exists) throw new HttpsError('not-found', 'No se encontró el reporte.');
    const reportData = report.data()!;
    const reviewData = review.data();
    if (!review.exists || !reviewData || !(await leaderHasArea(request, reviewData.operationalAreaId))) {
      throw new HttpsError('permission-denied', 'No tienes responsabilidad operativa sobre el área del reporte.');
    }
    if (reportData.status === 'linked_to_incident') {
      throw new HttpsError('failed-precondition', 'El reporte ya está vinculado a un incidente.');
    }
    if (reportData.status === 'reviewed_without_incident') {
      throw new HttpsError('failed-precondition', 'El reporte ya se cerró sin crear un incidente.');
    }

    if (incidentRef) {
      if (reportData.status === 'received') {
        transaction.create(reportRef.collection('updates').doc(`${requestId}-evaluation`), {
          type: 'under_evaluation',
          message: 'El reporte pasó a evaluación por una persona responsable.',
          actorUid: uid,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.create(incidentRef, {
        reportIds: [reportId],
        citizenUids: [reportData.authorId],
        assignedBrigadeIds: [],
        assignedUids: [],
        assignedBrigadeId: null,
        assignedUid: null,
        commandUid: uid,
        status: 'pending_assignment',
        createdBy: uid,
        operationalAreaId: reviewData.operationalAreaId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(incidentRef.collection('access').doc(reportData.authorId), {
        active: true,
        role: 'citizen',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(incidentRef.collection('access').doc(uid), {
        active: true,
        role: roleOf(request),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(incidentRef.collection('logs').doc(requestId), {
        type: 'incident_created',
        message: 'Incidente creado a partir de la evaluación del reporte.',
        actorUid: uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(reportRef, {
        status: 'linked_to_incident',
        incidentId: incidentRef.id,
        organizationId: typeof reviewData.organizationId === 'string' ? reviewData.organizationId : null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(updateRef, {
        type: 'incident_linked',
        message: 'El reporte fue vinculado a un incidente para su gestión operativa.',
        incidentId: incidentRef.id,
        actorUid: uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(reviewRef, {
        status: 'linked_to_incident',
        incidentId: incidentRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { incidentId: incidentRef.id };
    }

    const status = decision === 'keep_evaluating' ? 'under_evaluation' : 'reviewed_without_incident';
    transaction.update(reportRef, { status, updatedAt: FieldValue.serverTimestamp() });
    transaction.update(reviewRef, { status, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(updateRef, {
      type: status,
      message: decision === 'keep_evaluating'
        ? 'El reporte continúa en evaluación.'
        : 'El reporte fue evaluado y no se abrió un incidente.',
      actorUid: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { incidentId: null };
  });
});

export const linkReportToIncident = onCall(async (request) => {
  const uid = await requireRoles(request, ['brigade_leader', 'incident_commander']);
  const data = dataObject(request.data);
  const reportId = identifier(data.reportId, 'reportId');
  const incidentId = identifier(data.incidentId, 'incidentId');
  const requestId = identifier(data.requestId, 'requestId');
  const reportRef = db.collection('reports').doc(reportId);
  const incidentRef = db.collection('incidents').doc(incidentId);
  const reviewRef = db.collection('reportReviews').doc(reportId);
  const updateRef = reportRef.collection('updates').doc(requestId);
  const eventRef = incidentRef.collection('logs').doc(requestId);

  return db.runTransaction(async (transaction) => {
    const [report, review, incident, priorUpdate] = await Promise.all([
      transaction.get(reportRef),
      transaction.get(reviewRef),
      transaction.get(incidentRef),
      transaction.get(updateRef),
    ]);
    if (priorUpdate.exists) return { reportId, incidentId };
    if (!report.exists || !incident.exists) throw new HttpsError('not-found', 'No se encontró el reporte o incidente.');
    const reportData = report.data()!;
    const reviewData = review.data();
    const incidentData = incident.data()!;
    if (!review.exists || !reviewData ||
        !(await leaderHasArea(request, reviewData.operationalAreaId)) ||
        !(await leaderHasArea(request, incidentData.operationalAreaId))) {
      throw new HttpsError('permission-denied', 'No tienes responsabilidad operativa sobre el área.');
    }
    if (reportData.incidentId === incidentId) return { reportId, incidentId };
    if (typeof reportData.incidentId === 'string' || reportData.status === 'reviewed_without_incident') {
      throw new HttpsError('failed-precondition', 'El reporte ya está vinculado o se cerró sin incidente.');
    }
    if (incidentData.status === 'closed') throw new HttpsError('failed-precondition', 'El incidente ya está cerrado.');
    const reportIds = Array.isArray(incidentData.reportIds) ? incidentData.reportIds as string[] : [];
    const citizenUids = Array.isArray(incidentData.citizenUids) ? incidentData.citizenUids as string[] : [];
    if (reportData.status === 'received') {
      transaction.create(reportRef.collection('updates').doc(`${requestId}-evaluation`), {
        type: 'under_evaluation',
        message: 'El reporte pasó a evaluación por una persona responsable.',
        actorUid: uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.update(incidentRef, {
      reportIds: [...new Set([...reportIds, reportId])],
      citizenUids: [...new Set([...citizenUids, reportData.authorId as string])],
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(reportRef, {
      status: 'linked_to_incident',
      incidentId,
      organizationId: typeof reviewData.organizationId === 'string' ? reviewData.organizationId : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(reviewRef, {
      status: 'linked_to_incident',
      incidentId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(incidentRef.collection('access').doc(reportData.authorId as string), {
      active: true,
      role: 'citizen',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.create(updateRef, {
      type: 'incident_linked',
      message: 'El reporte fue vinculado a un incidente.',
      incidentId,
      actorUid: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(eventRef, {
      type: 'report_linked',
      message: 'Se vinculó un reporte ciudadano al incidente.',
      actorUid: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { reportId, incidentId };
  });
});

export const assignBrigade = onCall(async (request) => {
  const uid = await requireRoles(request, ['brigade_leader', 'incident_commander']);
  const data = dataObject(request.data);
  const incidentId = identifier(data.incidentId, 'incidentId');
  const brigadeId = identifier(data.brigadeId, 'brigadeId');
  const firefighterUid = identifier(data.firefighterUid, 'firefighterUid');
  const requestId = identifier(data.requestId, 'requestId');
  const incidentRef = db.collection('incidents').doc(incidentId);
  const brigadeRef = db.collection('brigades').doc(brigadeId);
  const firefighterRef = db.collection('availability').doc(firefighterUid);
  const memberRef = brigadeRef.collection('members').doc(firefighterUid);
  const firefighterAccessRef = db.collection('access').doc(firefighterUid);
  const eventRef = incidentRef.collection('logs').doc(requestId);

  return db.runTransaction(async (transaction) => {
    const [incident, brigade, member, firefighter, firefighterAccess, priorEvent] = await Promise.all([
      transaction.get(incidentRef),
      transaction.get(brigadeRef),
      transaction.get(memberRef),
      transaction.get(firefighterRef),
      transaction.get(firefighterAccessRef),
      transaction.get(eventRef),
    ]);
    if (priorEvent.exists) return { incidentId, brigadeId, firefighterUid };
    if (!incident.exists || !brigade.exists || !member.exists || !firefighter.exists || !firefighterAccess.exists) {
      throw new HttpsError('not-found', 'No se encontró el incidente, brigada o integrante.');
    }
    const incidentData = incident.data()!;
    const brigadeData = brigade.data()!;
    const firefighterData = firefighter.data()!;
    if (!(await leaderHasArea(request, incidentData.operationalAreaId))) {
      throw new HttpsError('permission-denied', 'No tienes responsabilidad sobre el área del incidente.');
    }
    if (roleOf(request) === 'brigade_leader' && brigadeData.leaderUid !== uid) {
      throw new HttpsError('permission-denied', 'Solo puedes asignar tu propia brigada.');
    }
    if (incidentData.status !== 'pending_assignment') {
      throw new HttpsError('failed-precondition', 'El estado del incidente no permite asignar una brigada.');
    }
    if (brigadeData.operationalAreaId !== incidentData.operationalAreaId) {
      throw new HttpsError('permission-denied', 'La brigada no está autorizada para el área de este incidente.');
    }
    if (brigadeData.availability !== 'available') {
      throw new HttpsError('failed-precondition', 'La brigada no está disponible.');
    }
    if (
      member.data()?.active !== true ||
      firefighterAccess.data()?.active !== true ||
      firefighterAccess.data()?.role !== 'firefighter' ||
      firefighterData.status !== 'available'
    ) {
      throw new HttpsError('failed-precondition', 'El integrante no pertenece a la brigada o no está disponible.');
    }

    transaction.update(incidentRef, {
      assignedBrigadeId: brigadeId,
      assignedBrigadeIds: [brigadeId],
      assignedUid: firefighterUid,
      assignedUids: [firefighterUid],
      assignmentId: requestId,
      status: 'assigned',
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(incidentRef.collection('assignments').doc(requestId), {
      brigadeId,
      firefighterUid,
      status: 'assigned',
      assignedBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(incidentRef.collection('access').doc(firefighterUid), {
      active: true,
      role: 'firefighter',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.update(brigadeRef, { availability: 'occupied', updatedAt: FieldValue.serverTimestamp() });
    transaction.update(firefighterRef, { status: 'busy', updatedAt: FieldValue.serverTimestamp() });
    transaction.create(eventRef, {
      type: 'brigade_assigned',
      message: 'Brigada asignada al incidente; la asignación no significa que ya esté en desplazamiento.',
      actorUid: uid,
      brigadeId,
      firefighterUid,
      createdAt: FieldValue.serverTimestamp(),
    });
    const reportIds = Array.isArray(incidentData.reportIds) ? incidentData.reportIds : [];
    for (const reportId of reportIds) {
      if (typeof reportId !== 'string') continue;
      transaction.create(db.collection('reports').doc(reportId).collection('updates').doc(requestId), {
        type: 'brigade_assigned',
        message: 'Una brigada fue asignada al incidente. La asignación no significa que ya esté en desplazamiento.',
        incidentId,
        actorUid: uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return { incidentId, brigadeId, firefighterUid };
  });
});

export const declineIncidentAssignment = onCall(async (request) => {
  const uid = await requireRoles(request, ['firefighter', 'brigade_leader', 'incident_commander']);
  const data = dataObject(request.data);
  const incidentId = identifier(data.incidentId, 'incidentId');
  const requestId = identifier(data.requestId, 'requestId');
  const reason = stringField(data, 'reason', 10, 1000);
  const incidentRef = db.collection('incidents').doc(incidentId);
  const eventRef = incidentRef.collection('logs').doc(requestId);

  return db.runTransaction(async (transaction) => {
    const [incident, priorEvent] = await Promise.all([
      transaction.get(incidentRef),
      transaction.get(eventRef),
    ]);
    if (priorEvent.exists) return { incidentId, status: 'pending_assignment' };
    if (!incident.exists) throw new HttpsError('not-found', 'No se encontró el incidente.');
    const incidentData = incident.data()!;
    const actorIncidentAccess = await transaction.get(incidentRef.collection('access').doc(uid));
    if (roleOf(request) === 'firefighter' && actorIncidentAccess.data()?.active !== true) {
      throw new HttpsError('permission-denied', 'Tu acceso a este incidente ya no está activo.');
    }
    if (!(await leaderHasArea(request, incidentData.operationalAreaId))) {
      throw new HttpsError('permission-denied', 'No tienes responsabilidad sobre el área del incidente.');
    }
    if (incidentData.status !== 'assigned') throw new HttpsError('failed-precondition', 'El incidente no tiene una asignación activa.');
    if (roleOf(request) === 'firefighter' && incidentData.assignedUid !== uid) {
      throw new HttpsError('permission-denied', 'Solo la persona asignada puede informar que no puede intervenir.');
    }
    const brigadeId = incidentData.assignedBrigadeId as string;
    const firefighterUid = incidentData.assignedUid as string;
    if (typeof incidentData.assignmentId !== 'string') {
      throw new HttpsError('failed-precondition', 'La asignación no tiene un identificador válido para ser revocada.');
    }
    const brigadeRef = db.collection('brigades').doc(brigadeId);
    const firefighterRef = db.collection('availability').doc(firefighterUid);
    const assignmentRef = incidentRef.collection('assignments').doc(String(incidentData.assignmentId));
    const [brigade, firefighter] = await Promise.all([
      transaction.get(brigadeRef),
      transaction.get(firefighterRef),
    ]);
    if (!brigade.exists || !firefighter.exists) throw new HttpsError('not-found', 'No se encontró la asignación actual.');

    transaction.update(incidentRef, {
      assignedBrigadeId: null,
      assignedBrigadeIds: [],
      assignedUid: null,
      assignedUids: [],
      assignmentId: null,
      status: 'pending_assignment',
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(assignmentRef, { status: 'declined', updatedAt: FieldValue.serverTimestamp() });
    transaction.set(incidentRef.collection('access').doc(firefighterUid), {
      active: false,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.update(brigadeRef, { availability: 'available', updatedAt: FieldValue.serverTimestamp() });
    transaction.update(firefighterRef, { status: 'available', updatedAt: FieldValue.serverTimestamp() });
    transaction.create(eventRef, {
      type: 'assignment_declined',
      message: `La brigada no puede intervenir: ${reason}`,
      reason,
      actorUid: uid,
      brigadeId,
      firefighterUid,
      createdAt: FieldValue.serverTimestamp(),
    });
    const reportIds = Array.isArray(incidentData.reportIds) ? incidentData.reportIds : [];
    for (const reportId of reportIds) {
      if (typeof reportId !== 'string') continue;
      transaction.create(db.collection('reports').doc(reportId).collection('updates').doc(requestId), {
        type: 'assignment_released',
        message: 'La asignación no pudo continuar. El incidente quedó pendiente de reasignación.',
        incidentId,
        actorUid: uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return { incidentId, status: 'pending_assignment' };
  });
});

export const updateIncidentStatus = onCall(async (request) => {
  const uid = await requireRoles(request, ['firefighter', 'incident_commander']);
  const data = dataObject(request.data);
  const incidentId = identifier(data.incidentId, 'incidentId');
  const requestId = identifier(data.requestId, 'requestId');
  const nextStatus = stringField(data, 'status', 1, 40);
  const note = typeof data.note === 'string' ? data.note.trim().slice(0, 1000) : '';
  if (!['en_route', 'in_intervention', 'monitoring', 'closed'].includes(nextStatus)) {
    throw new HttpsError('invalid-argument', 'El nuevo estado no es válido.');
  }
  if (nextStatus === 'closed' && note.length < 15) {
    throw new HttpsError('invalid-argument', 'Documenta el motivo de cierre (mínimo 15 caracteres).');
  }

  const incidentRef = db.collection('incidents').doc(incidentId);
  const eventRef = incidentRef.collection('logs').doc(requestId);
  return db.runTransaction(async (transaction) => {
    const [incident, priorEvent, actorIncidentAccess] = await Promise.all([
      transaction.get(incidentRef),
      transaction.get(eventRef),
      transaction.get(incidentRef.collection('access').doc(uid)),
    ]);
    if (priorEvent.exists) return { incidentId, status: priorEvent.data()?.status ?? nextStatus };
    if (!incident.exists) throw new HttpsError('not-found', 'No se encontró el incidente.');
    const incidentData = incident.data()!;
    if (actorIncidentAccess.data()?.active !== true) {
      throw new HttpsError('permission-denied', 'Tu acceso a este incidente ya no está activo.');
    }
    if (roleOf(request) === 'incident_commander' &&
        (!(await leaderHasArea(request, incidentData.operationalAreaId)) || incidentData.commandUid !== uid)) {
      throw new HttpsError('permission-denied', 'No eres el mando operativo actual de este incidente.');
    }
    if (roleOf(request) === 'firefighter' && incidentData.assignedUid !== uid) {
      throw new HttpsError('permission-denied', 'Este incidente no está asignado a tu cuenta.');
    }
    const currentStatus = String(incidentData.status);
    if (!(INCIDENT_TRANSITIONS[currentStatus] ?? []).includes(nextStatus)) {
      throw new HttpsError('failed-precondition', `No se permite pasar de ${currentStatus} a ${nextStatus}.`);
    }

    transaction.update(incidentRef, {
      status: nextStatus,
      updatedAt: FieldValue.serverTimestamp(),
      ...(nextStatus === 'closed' ? { closedAt: FieldValue.serverTimestamp(), closeReason: note } : {}),
    });
    transaction.create(eventRef, {
      type: nextStatus,
      status: nextStatus,
      message: note || `Estado actualizado a ${nextStatus}.`,
      note,
      actorUid: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    const citizenMessages: Record<string, string> = {
      en_route: 'La brigada inició su desplazamiento hacia el lugar reportado.',
      in_intervention: 'La brigada inició la intervención en el incidente.',
      monitoring: 'El incidente pasó a vigilancia.',
      closed: 'El incidente fue cerrado por el responsable operativo.',
    };
    const reportIds = Array.isArray(incidentData.reportIds) ? incidentData.reportIds : [];
    for (const reportId of reportIds) {
      if (typeof reportId !== 'string') continue;
      transaction.create(db.collection('reports').doc(reportId).collection('updates').doc(requestId), {
        type: nextStatus,
        message: citizenMessages[nextStatus],
        incidentId,
        actorUid: uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    if (nextStatus === 'closed') {
      const brigadeId = incidentData.assignedBrigadeId as string | null;
      const firefighterUid = incidentData.assignedUid as string | null;
      if (brigadeId && firefighterUid) {
        transaction.update(db.collection('brigades').doc(brigadeId), {
          availability: 'available',
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(db.collection('availability').doc(firefighterUid), {
          status: 'available',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
    return { incidentId, status: nextStatus };
  });
});

export const transferIncidentCommand = onCall(async (request) => {
  const uid = await requireRoles(request, ['incident_commander']);
  const data = dataObject(request.data);
  const incidentId = identifier(data.incidentId, 'incidentId');
  const requestId = identifier(data.requestId, 'requestId');
  const targetUid = identifier(data.targetUid, 'targetUid');
  const reason = stringField(data, 'reason', 10, 1000);
  if (targetUid === uid) throw new HttpsError('invalid-argument', 'No puedes transferirte el mando a ti mismo.');
  const target = await authAdmin.getUser(targetUid);
  const targetAccessRef = db.collection('access').doc(targetUid);
  if (target.customClaims?.role !== 'incident_commander') {
    throw new HttpsError('failed-precondition', 'El mando solo puede transferirse a una cuenta de mando operativo autorizada.');
  }

  const incidentRef = db.collection('incidents').doc(incidentId);
  const eventRef = incidentRef.collection('logs').doc(requestId);
  const transferRef = incidentRef.collection('commandTransfers').doc(requestId);
  return db.runTransaction(async (transaction) => {
    const [incident, priorEvent, priorTransfer, actorAccess, targetAccess] = await Promise.all([
      transaction.get(incidentRef),
      transaction.get(eventRef),
      transaction.get(transferRef),
      transaction.get(incidentRef.collection('access').doc(uid)),
      transaction.get(targetAccessRef),
    ]);
    if (priorEvent.exists || priorTransfer.exists) {
      return { incidentId, commandUid: priorEvent.data()?.targetUid ?? targetUid };
    }
    if (!incident.exists) throw new HttpsError('not-found', 'No se encontró el incidente.');
    if (actorAccess.data()?.active !== true) {
      throw new HttpsError('permission-denied', 'Tu acceso a este incidente ya no está activo.');
    }
    const targetAreas = targetAccess.data()?.operationalAreaIds;
    if (
      !targetAccess.exists ||
      targetAccess.data()?.active !== true ||
      targetAccess.data()?.role !== 'incident_commander' ||
      !Array.isArray(targetAreas)
    ) {
      throw new HttpsError('failed-precondition', 'La cuenta receptora no tiene acceso activo de mando operativo.');
    }
    const incidentData = incident.data()!;
    if (!(await leaderHasArea(request, incidentData.operationalAreaId)) || incidentData.commandUid !== uid) {
      throw new HttpsError('permission-denied', 'No eres el mando operativo actual de este incidente.');
    }
    if (!targetAreas.includes(incidentData.operationalAreaId)) {
      throw new HttpsError('failed-precondition', 'La persona receptora no tiene autorización para el área del incidente.');
    }
    if (incidentData.status === 'closed') throw new HttpsError('failed-precondition', 'No se puede transferir el mando de un incidente cerrado.');
    transaction.update(incidentRef, { commandUid: targetUid, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(incidentRef.collection('access').doc(uid), {
      active: false,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(incidentRef.collection('access').doc(targetUid), {
      active: true,
      role: 'incident_commander',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.create(transferRef, {
      fromUid: uid,
      toUid: targetUid,
      reason,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(eventRef, {
      type: 'command_transferred',
      message: `Se transfirió el mando operativo: ${reason}`,
      reason,
      actorUid: uid,
      targetUid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { incidentId, commandUid: targetUid };
  });
});

export const recordIncidentObservation = onCall(async (request) => {
  const uid = await requireRoles(request, ['firefighter', 'incident_commander']);
  const data = dataObject(request.data);
  const incidentId = identifier(data.incidentId, 'incidentId');
  const requestId = identifier(data.requestId, 'requestId');
  const note = stringField(data, 'note', 5, 2000);
  const incidentRef = db.collection('incidents').doc(incidentId);
  const eventRef = incidentRef.collection('logs').doc(requestId);

  return db.runTransaction(async (transaction) => {
    const [incident, priorEvent, actorAccess] = await Promise.all([
      transaction.get(incidentRef),
      transaction.get(eventRef),
      transaction.get(incidentRef.collection('access').doc(uid)),
    ]);
    if (priorEvent.exists) return { incidentId, recorded: true };
    if (!incident.exists) throw new HttpsError('not-found', 'No se encontró el incidente.');
    const incidentData = incident.data()!;
    if (actorAccess.data()?.active !== true) {
      throw new HttpsError('permission-denied', 'Tu acceso a este incidente ya no está activo.');
    }
    if (incidentData.status === 'closed') {
      throw new HttpsError('failed-precondition', 'No se pueden agregar observaciones a un incidente cerrado.');
    }
    if (roleOf(request) === 'firefighter' && incidentData.assignedUid !== uid) {
      throw new HttpsError('permission-denied', 'Solo la persona asignada puede registrar observaciones.');
    }
    if (roleOf(request) === 'incident_commander' &&
        (!(await leaderHasArea(request, incidentData.operationalAreaId)) || incidentData.commandUid !== uid)) {
      throw new HttpsError('permission-denied', 'No eres el mando operativo actual de este incidente.');
    }
    transaction.create(eventRef, {
      type: 'observation',
      message: note,
      actorUid: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(incidentRef, { updatedAt: FieldValue.serverTimestamp() });
    return { incidentId, recorded: true };
  });
});

export const setOwnAvailability = onCall(async (request) => {
  const uid = await requireRoles(request, ['firefighter']);
  const data = dataObject(request.data);
  const status = stringField(data, 'status', 1, 40);
  if (!['available', 'busy', 'off_duty'].includes(status)) {
    throw new HttpsError('invalid-argument', 'La disponibilidad debe ser available, busy u off_duty.');
  }
  const availabilityRef = db.collection('availability').doc(uid);
  await db.runTransaction(async (transaction) => {
    const availability = await transaction.get(availabilityRef);
    if (availability.data()?.status === 'busy' && status !== 'busy') {
      throw new HttpsError('failed-precondition', 'No puedes cambiar disponibilidad mientras tienes una asignación activa.');
    }
    transaction.set(availabilityRef, { status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { status };
});

export const listReportsForReview = onCall(async (request) => {
  const uid = await requireRoles(request, ['brigade_leader', 'incident_commander']);
  const data = dataObject(request.data);
  const allowedAreas = await operationalAreaIds(uid);
  if (!allowedAreas.length) return { items: [], nextCursor: null };
  const limit = pageSize(data.limit);
  let queue = db.collection('reportReviews')
    .where('operationalAreaId', 'in', allowedAreas)
    .orderBy('createdAt', 'desc')
    .limit(limit + 1);
  if (data.cursor !== undefined) {
    const cursor = db.collection('reportReviews').doc(identifier(data.cursor, 'cursor'));
    const cursorSnapshot = await cursor.get();
    if (!cursorSnapshot.exists ||
        typeof cursorSnapshot.data()?.operationalAreaId !== 'string' ||
        !allowedAreas.includes(cursorSnapshot.data()!.operationalAreaId as string)) {
      throw new HttpsError('invalid-argument', 'El cursor de reportes no pertenece a tus áreas autorizadas.');
    }
    queue = queue.startAfter(cursorSnapshot);
  }
  const page = await queue.get();
  const selected = page.docs.slice(0, limit);
  const reports = await Promise.all(selected.map((review) => db.collection('reports').doc(review.id).get()));
  return {
    items: reports.flatMap((report, index) => report.exists
      ? [{ id: report.id, ...report.data(), operationalAreaId: selected[index].data().operationalAreaId }]
      : []),
    nextCursor: page.docs.length > limit ? selected[selected.length - 1]?.id ?? null : null,
  };
});

export const getAuthorizedReportPhoto = onCall(async (request) => {
  const uid = await requireRoles(request, ['brigade_leader', 'incident_commander']);
  const data = dataObject(request.data);
  const reportId = identifier(data.reportId, 'reportId');
  const [report, review] = await Promise.all([
    db.collection('reports').doc(reportId).get(),
    db.collection('reportReviews').doc(reportId).get(),
  ]);
  if (!report.exists || !review.exists) throw new HttpsError('not-found', 'No se encontró el reporte.');
  const reportData = report.data()!;
  const areaId = review.data()?.operationalAreaId;
  if (!hasOperationalArea(await operationalAreaIds(uid), areaId)) {
    throw new HttpsError('permission-denied', 'No tienes responsabilidad operativa sobre el reporte.');
  }
  const expectedPath = `reportPhotos/${reportData.authorId}/${reportId}/original`;
  if (reportData.photoPath !== expectedPath) {
    throw new HttpsError('failed-precondition', 'La fotografía no cumple la ruta privada esperada.');
  }
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const [url] = await bucket.file(expectedPath).getSignedUrl({ action: 'read', expires: expiresAt });
  return { url, expiresAt };
});

export const listOperationalIncidents = onCall(async (request) => {
  const uid = await requireRoles(request, ['firefighter', 'brigade_leader', 'incident_commander']);
  const data = dataObject(request.data);
  const limit = pageSize(data.limit);
  let incidents = db.collection('incidents').orderBy('createdAt', 'desc');
  let cursorCollection = db.collection('incidents');
  const isFirefighter = roleOf(request) === 'firefighter';
  const allowedAreas = isFirefighter ? [] : await operationalAreaIds(uid);
  if (isFirefighter) {
    incidents = incidents.where('assignedUids', 'array-contains', uid);
  } else {
    if (!allowedAreas.length) return { items: [], nextCursor: null };
    incidents = incidents.where('operationalAreaId', 'in', allowedAreas);
  }
  incidents = incidents.limit(limit + 1);
  if (data.cursor !== undefined) {
    const cursor = cursorCollection.doc(identifier(data.cursor, 'cursor'));
    const cursorSnapshot = await cursor.get();
    if (!cursorSnapshot.exists) throw new HttpsError('invalid-argument', 'El cursor de incidentes ya no existe.');
    if (isFirefighter && !cursorSnapshot.data()?.assignedUids?.includes(uid)) {
      throw new HttpsError('invalid-argument', 'El cursor de incidentes no pertenece a tus asignaciones.');
    }
    if (!isFirefighter && !hasOperationalArea(allowedAreas, cursorSnapshot.data()?.operationalAreaId)) {
      throw new HttpsError('invalid-argument', 'El cursor de incidentes no pertenece a tus áreas autorizadas.');
    }
    incidents = incidents.startAfter(cursorSnapshot);
  }
  const page = await incidents.get();
  return {
    items: page.docs.slice(0, limit).map((incident) => ({ id: incident.id, ...incident.data() })),
    nextCursor: page.docs.length > limit ? page.docs[limit - 1]?.id ?? null : null,
  };
});

export const listIncidentLogs = onCall(async (request) => {
  const uid = requireUid(request);
  const account = await db.collection('access').doc(uid).get();
  if (!account.exists || account.data()?.active !== true) {
    throw new HttpsError('permission-denied', 'La cuenta no tiene acceso activo.');
  }
  const data = dataObject(request.data);
  const incidentId = identifier(data.incidentId, 'incidentId');
  const incidentRef = db.collection('incidents').doc(incidentId);
  const incident = await incidentRef.get();
  if (!incident.exists) throw new HttpsError('not-found', 'No se encontró el incidente.');
  const access = await incidentRef.collection('access').doc(uid).get();
  const accountRole = account.data()?.role;
  const mayReview = ['brigade_leader', 'incident_commander'].includes(String(accountRole)) &&
    hasOperationalArea(account.data()?.operationalAreaIds, incident.data()?.operationalAreaId);
  if (access.data()?.active !== true && !mayReview) {
    throw new HttpsError('permission-denied', 'No tienes acceso a la bitácora de este incidente.');
  }

  const limit = pageSize(data.limit);
  let logs = incidentRef.collection('logs').orderBy('createdAt', 'asc').limit(limit + 1);
  if (data.cursor !== undefined) {
    const cursor = incidentRef.collection('logs').doc(identifier(data.cursor, 'cursor'));
    const cursorSnapshot = await cursor.get();
    if (!cursorSnapshot.exists) throw new HttpsError('invalid-argument', 'El cursor de bitácora ya no existe.');
    logs = logs.startAfter(cursorSnapshot);
  }
  const page = await logs.get();
  return {
    items: page.docs.slice(0, limit).map((log) => ({ id: log.id, ...log.data() })),
    nextCursor: page.docs.length > limit ? page.docs[limit - 1]?.id ?? null : null,
  };
});

export const listAuthorizedBrigades = onCall(async (request) => {
  const uid = await requireRoles(request, ['firefighter', 'brigade_leader']);
  const account = await db.collection('access').doc(uid).get();
  const ownBrigadeIds = Array.isArray(account.data()?.brigadeIds)
    ? account.data()!.brigadeIds as string[]
    : [];
  const data = dataObject(request.data);
  const requestedIds = data.brigadeIds === undefined
    ? ownBrigadeIds
    : Array.isArray(data.brigadeIds)
      ? [...new Set(data.brigadeIds.map((id) => identifier(id, 'brigadeId')))]
      : (() => { throw new HttpsError('invalid-argument', 'brigadeIds debe ser una lista.'); })();
  if (requestedIds.some((id) => !ownBrigadeIds.includes(id))) {
    throw new HttpsError('permission-denied', 'La solicitud incluye brigadas fuera de tu acceso.');
  }

  const items = await Promise.all(requestedIds.slice(0, 10).map(async (brigadeId) => {
    const brigadeRef = db.collection('brigades').doc(brigadeId);
    const brigade = await brigadeRef.get();
    if (!brigade.exists) return null;
    const brigadeData = brigade.data()!;
    if (roleOf(request) === 'firefighter') {
      const membership = await brigadeRef.collection('members').doc(uid).get();
      if (!membership.exists || membership.data()?.active !== true) {
        throw new HttpsError('permission-denied', 'Tu membresía en una de las brigadas ya no está activa.');
      }
    }
    if (roleOf(request) === 'brigade_leader' && brigadeData.leaderUid !== uid) {
      throw new HttpsError('permission-denied', 'No eres responsable de una de las brigadas solicitadas.');
    }
    const members = await brigadeRef.collection('members').where('active', '==', true).get();
    const roster = await Promise.all(members.docs.map(async (member) => {
      const memberUid = member.id;
      const [profile, memberAccess, availability] = await Promise.all([
        db.collection('users').doc(memberUid).get(),
        db.collection('access').doc(memberUid).get(),
        db.collection('availability').doc(memberUid).get(),
      ]);
      if (!profile.exists || memberAccess.data()?.active !== true) return null;
      return {
        uid: memberUid,
        name: typeof profile.data()?.displayName === 'string' ? profile.data()!.displayName : 'Integrante',
        availability: typeof availability.data()?.status === 'string' ? availability.data()!.status : 'unknown',
      };
    }));
    return {
      id: brigade.id,
      ...brigadeData,
      members: roster.filter((member) => member !== null),
    };
  }));
  return { items: items.filter((brigade) => brigade !== null) };
});

export const activateOperationalAccount = onCall(async (request) => {
  const actorUid = await requireTechnicalAdmin(request);
  const data = dataObject(request.data);
  const targetUid = identifier(data.targetUid, 'targetUid');
  const role = stringField(data, 'role', 1, 40);
  const brigadeIds = Array.isArray(data.brigadeIds)
    ? [...new Set(data.brigadeIds.map((id) => identifier(id, 'brigadeId')))]
    : [];
  const requestedAreas = Array.isArray(data.operationalAreaIds)
    ? [...new Set(data.operationalAreaIds.map((area) => {
      if (typeof area !== 'string' || !/^[a-z0-9-]{3,80}$/.test(area)) {
        throw new HttpsError('invalid-argument', 'Un área operativa no es válida.');
      }
      return area;
    }))]
    : [];
  if (!OPERATIONAL_ROLES.has(role)) {
    throw new HttpsError('invalid-argument', 'El rol solicitado no es un rol operativo activable.');
  }
  const target = await authAdmin.getUser(targetUid);
  const existingClaims = target.customClaims ?? {};
  let operationalAreaIds = requestedAreas;
  if (role === 'brigade_leader') {
    const brigades = await Promise.all(brigadeIds.map((brigadeId) => db.collection('brigades').doc(brigadeId).get()));
    if (brigades.some((brigade) => !brigade.exists || brigade.data()?.leaderUid !== targetUid)) {
      throw new HttpsError('failed-precondition', 'Un encargado solo puede recibir permisos en brigadas que ya administra.');
    }
    if (!brigadeIds.length) throw new HttpsError('invalid-argument', 'Asigna al encargado a por lo menos una brigada.');
    operationalAreaIds = [...new Set(brigades.map((brigade) => brigade.data()?.operationalAreaId).filter((area): area is string => typeof area === 'string'))];
  }
  if (role === 'firefighter') {
    if (brigadeIds.length === 0) throw new HttpsError('invalid-argument', 'Asigna al bombero a por lo menos una brigada.');
    const memberships = await Promise.all(brigadeIds.map((brigadeId) =>
      db.collection('brigades').doc(brigadeId).collection('members').doc(targetUid).get(),
    ));
    if (memberships.some((membership) => !membership.exists || membership.data()?.active !== true)) {
      throw new HttpsError('failed-precondition', 'El integrante debe pertenecer a las brigadas indicadas.');
    }
    const brigades = await Promise.all(brigadeIds.map((brigadeId) => db.collection('brigades').doc(brigadeId).get()));
    operationalAreaIds = [...new Set(brigades.map((brigade) => brigade.data()?.operationalAreaId).filter((area): area is string => typeof area === 'string'))];
  }
  if (role === 'incident_commander' && !requestedAreas.length) {
    throw new HttpsError('invalid-argument', 'El mando debe recibir al menos un área operativa autorizada.');
  }
  const nextClaims = { ...existingClaims, role, brigadeIds, operationalAreaIds };
  const accessRef = db.collection('access').doc(targetUid);
  const availabilityRef = db.collection('availability').doc(targetUid);
  await db.runTransaction(async (transaction) => {
    const availability = await transaction.get(availabilityRef);
    transaction.set(accessRef, {
    active: true,
    role,
    brigadeIds,
    operationalAreaIds,
    updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (role === 'firefighter' && !availability.exists) {
    transaction.create(availabilityRef, {
      status: 'available',
      updatedAt: FieldValue.serverTimestamp(),
    });
    }
  });
  await authAdmin.setCustomUserClaims(targetUid, nextClaims);
  await db.collection('invitations').doc(targetUid).set({
    targetUid,
    role,
    brigadeIds,
    operationalAreaIds,
    activatedBy: actorUid,
    activatedAt: FieldValue.serverTimestamp(),
  });
  return { targetUid, role, brigadeIds };
});

export const grantTechnicalAdministrator = onCall(async (request) => {
  const actorUid = await requireTechnicalAdmin(request);
  const data = dataObject(request.data);
  const targetUid = identifier(data.targetUid, 'targetUid');
  const enabled = data.enabled;
  if (typeof enabled !== 'boolean') throw new HttpsError('invalid-argument', 'enabled debe ser booleano.');
  const target = await authAdmin.getUser(targetUid);
  await authAdmin.setCustomUserClaims(targetUid, {
    ...(target.customClaims ?? {}),
    technicalAdmin: enabled,
  });
  await db.collection('access').doc(targetUid).set({
    technicalAdmin: enabled,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.collection('invitations').doc(targetUid).set({
    technicalAdmin: enabled,
    changedBy: actorUid,
    changedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { targetUid, technicalAdmin: enabled };
});
