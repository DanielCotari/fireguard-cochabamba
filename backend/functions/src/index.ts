import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
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

function requireRoles(request: CallableRequest<unknown>, roles: string[]): string {
  const uid = requireUid(request);
  if (!roles.includes(roleOf(request))) {
    throw new HttpsError('permission-denied', 'Tu cuenta no tiene permisos para esta operación.');
  }
  return uid;
}

function requireTechnicalAdmin(request: CallableRequest<unknown>): string {
  const uid = requireUid(request);
  if (request.auth?.token.technicalAdmin !== true) {
    throw new HttpsError('permission-denied', 'Se requiere una cuenta de administración técnica autorizada.');
  }
  return uid;
}

function leaderHasArea(request: CallableRequest<unknown>, reportArea: unknown): boolean {
  const areas = request.auth?.token.operationalAreaIds;
  return Array.isArray(areas) && typeof reportArea === 'string' && areas.includes(reportArea);
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
    metadata.metadata?.ownerUid !== uid ||
    metadata.metadata?.reportId !== reportId ||
    metadata.metadata?.operationalAreaId !== 'cochabamba-pilot'
  ) {
    throw new HttpsError('invalid-argument', 'La fotografía no cumple los requisitos de tipo, tamaño o propiedad.');
  }
}

export const createCitizenReport = onCall(async (request) => {
  const uid = requireRoles(request, ['citizen']);
  const data = dataObject(request.data);
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
  const expectedPhotoPath = `report-images/${uid}/${reportId}`;
  if (photoPath !== expectedPhotoPath) {
    throw new HttpsError('permission-denied', 'La ruta de la fotografía no corresponde a tu reporte.');
  }

  const image = bucket.file(photoPath);
  const [exists] = await image.exists();
  if (!exists) throw new HttpsError('failed-precondition', 'La fotografía aún no se ha guardado.');
  const [metadata] = await image.getMetadata();
  assertPhotoMetadata(metadata, uid, reportId);
  if (metadata.contentType !== data.photoContentType || Number(metadata.size) !== data.photoSize) {
    throw new HttpsError('invalid-argument', 'Los metadatos de la fotografía no coinciden con el archivo guardado.');
  }

  const reportRef = db.collection('reports').doc(reportId);
  const updateRef = reportRef.collection('updates').doc('received');
  await db.runTransaction(async (transaction) => {
    const report = await transaction.get(reportRef);
    if (report.exists) {
      if (report.data()?.ownerUid !== uid) {
        throw new HttpsError('already-exists', 'Este identificador ya pertenece a otro reporte.');
      }
      return;
    }

    transaction.create(reportRef, {
      ownerUid: uid,
      description,
      fireLocation,
      observerLocation,
      observedAt: Timestamp.fromDate(observedDate),
      photoPath,
      photoContentType: metadata.contentType,
      photoSize: Number(metadata.size),
      operationalAreaId: 'cochabamba-pilot',
      status: 'received',
      satelliteMatch: 'pending',
      incidentId: null,
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
  const uid = requireRoles(request, ['brigade_leader', 'incident_commander']);
  const data = dataObject(request.data);
  const reportId = identifier(data.reportId, 'reportId');
  const requestId = identifier(data.requestId, 'requestId');
  const decision = stringField(data, 'decision', 1, 40);
  if (!['create_incident', 'keep_evaluating', 'close_without_incident'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'La decisión de evaluación no es válida.');
  }

  const reportRef = db.collection('reports').doc(reportId);
  const updateRef = reportRef.collection('updates').doc(requestId);
  const incidentRef = decision === 'create_incident' ? db.collection('incidents').doc() : null;
  return db.runTransaction(async (transaction) => {
    const [report, priorUpdate] = await Promise.all([
      transaction.get(reportRef),
      transaction.get(updateRef),
    ]);
    if (priorUpdate.exists) return { incidentId: priorUpdate.data()?.incidentId ?? null };
    if (!report.exists) throw new HttpsError('not-found', 'No se encontró el reporte.');
    const reportData = report.data()!;
    if (!leaderHasArea(request, reportData.operationalAreaId)) {
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
        citizenUids: [reportData.ownerUid],
        assignedBrigadeIds: [],
        assignedUids: [],
        assignedBrigadeId: null,
        assignedUid: null,
        commandUid: uid,
        status: 'pending_assignment',
        createdBy: uid,
        operationalAreaId: reportData.operationalAreaId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(incidentRef.collection('events').doc(requestId), {
        type: 'incident_created',
        message: 'Incidente creado a partir de la evaluación del reporte.',
        actorUid: uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(reportRef, {
        status: 'linked_to_incident',
        incidentId: incidentRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(updateRef, {
        type: 'incident_linked',
        message: 'El reporte fue vinculado a un incidente para su gestión operativa.',
        incidentId: incidentRef.id,
        actorUid: uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { incidentId: incidentRef.id };
    }

    const status = decision === 'keep_evaluating' ? 'under_evaluation' : 'reviewed_without_incident';
    transaction.update(reportRef, { status, updatedAt: FieldValue.serverTimestamp() });
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
  const uid = requireRoles(request, ['brigade_leader', 'incident_commander']);
  const data = dataObject(request.data);
  const reportId = identifier(data.reportId, 'reportId');
  const incidentId = identifier(data.incidentId, 'incidentId');
  const requestId = identifier(data.requestId, 'requestId');
  const reportRef = db.collection('reports').doc(reportId);
  const incidentRef = db.collection('incidents').doc(incidentId);
  const updateRef = reportRef.collection('updates').doc(requestId);
  const eventRef = incidentRef.collection('events').doc(requestId);

  return db.runTransaction(async (transaction) => {
    const [report, incident, priorUpdate] = await Promise.all([
      transaction.get(reportRef),
      transaction.get(incidentRef),
      transaction.get(updateRef),
    ]);
    if (priorUpdate.exists) return { reportId, incidentId };
    if (!report.exists || !incident.exists) throw new HttpsError('not-found', 'No se encontró el reporte o incidente.');
    const reportData = report.data()!;
    const incidentData = incident.data()!;
    if (!leaderHasArea(request, reportData.operationalAreaId) ||
        !leaderHasArea(request, incidentData.operationalAreaId)) {
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
      citizenUids: [...new Set([...citizenUids, reportData.ownerUid as string])],
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(reportRef, {
      status: 'linked_to_incident',
      incidentId,
      updatedAt: FieldValue.serverTimestamp(),
    });
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
  const uid = requireRoles(request, ['brigade_leader', 'incident_commander']);
  const data = dataObject(request.data);
  const incidentId = identifier(data.incidentId, 'incidentId');
  const brigadeId = identifier(data.brigadeId, 'brigadeId');
  const firefighterUid = identifier(data.firefighterUid, 'firefighterUid');
  const requestId = identifier(data.requestId, 'requestId');
  const incidentRef = db.collection('incidents').doc(incidentId);
  const brigadeRef = db.collection('brigades').doc(brigadeId);
  const firefighterRef = db.collection('users').doc(firefighterUid);
  const eventRef = incidentRef.collection('events').doc(requestId);

  return db.runTransaction(async (transaction) => {
    const [incident, brigade, firefighter, priorEvent] = await Promise.all([
      transaction.get(incidentRef),
      transaction.get(brigadeRef),
      transaction.get(firefighterRef),
      transaction.get(eventRef),
    ]);
    if (priorEvent.exists) return { incidentId, brigadeId, firefighterUid };
    if (!incident.exists || !brigade.exists || !firefighter.exists) {
      throw new HttpsError('not-found', 'No se encontró el incidente, brigada o integrante.');
    }
    const incidentData = incident.data()!;
    const brigadeData = brigade.data()!;
    const firefighterData = firefighter.data()!;
    if (!leaderHasArea(request, incidentData.operationalAreaId)) {
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
    const memberUids = Array.isArray(brigadeData.memberUids) ? brigadeData.memberUids as string[] : [];
    if (!memberUids.includes(firefighterUid) || firefighterData.availability !== 'available') {
      throw new HttpsError('failed-precondition', 'El integrante no pertenece a la brigada o no está disponible.');
    }

    transaction.update(incidentRef, {
      assignedBrigadeId: brigadeId,
      assignedBrigadeIds: [brigadeId],
      assignedUid: firefighterUid,
      assignedUids: [firefighterUid],
      status: 'assigned',
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(brigadeRef, { availability: 'occupied', updatedAt: FieldValue.serverTimestamp() });
    transaction.update(firefighterRef, { availability: 'occupied', updatedAt: FieldValue.serverTimestamp() });
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
  const uid = requireRoles(request, ['firefighter', 'brigade_leader', 'incident_commander']);
  const data = dataObject(request.data);
  const incidentId = identifier(data.incidentId, 'incidentId');
  const requestId = identifier(data.requestId, 'requestId');
  const reason = stringField(data, 'reason', 10, 1000);
  const incidentRef = db.collection('incidents').doc(incidentId);
  const eventRef = incidentRef.collection('events').doc(requestId);

  return db.runTransaction(async (transaction) => {
    const [incident, priorEvent] = await Promise.all([
      transaction.get(incidentRef),
      transaction.get(eventRef),
    ]);
    if (priorEvent.exists) return { incidentId, status: 'pending_assignment' };
    if (!incident.exists) throw new HttpsError('not-found', 'No se encontró el incidente.');
    const incidentData = incident.data()!;
    if (!leaderHasArea(request, incidentData.operationalAreaId)) {
      throw new HttpsError('permission-denied', 'No tienes responsabilidad sobre el área del incidente.');
    }
    if (incidentData.status !== 'assigned') throw new HttpsError('failed-precondition', 'El incidente no tiene una asignación activa.');
    if (roleOf(request) === 'firefighter' && incidentData.assignedUid !== uid) {
      throw new HttpsError('permission-denied', 'Solo la persona asignada puede informar que no puede intervenir.');
    }
    const brigadeId = incidentData.assignedBrigadeId as string;
    const firefighterUid = incidentData.assignedUid as string;
    const brigadeRef = db.collection('brigades').doc(brigadeId);
    const firefighterRef = db.collection('users').doc(firefighterUid);
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
      status: 'pending_assignment',
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(brigadeRef, { availability: 'available', updatedAt: FieldValue.serverTimestamp() });
    transaction.update(firefighterRef, { availability: 'available', updatedAt: FieldValue.serverTimestamp() });
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
  const uid = requireRoles(request, ['firefighter', 'incident_commander']);
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
  const eventRef = incidentRef.collection('events').doc(requestId);
  return db.runTransaction(async (transaction) => {
    const [incident, priorEvent] = await Promise.all([
      transaction.get(incidentRef),
      transaction.get(eventRef),
    ]);
    if (priorEvent.exists) return { incidentId, status: priorEvent.data()?.status ?? nextStatus };
    if (!incident.exists) throw new HttpsError('not-found', 'No se encontró el incidente.');
    const incidentData = incident.data()!;
    if (roleOf(request) === 'incident_commander' &&
        (!leaderHasArea(request, incidentData.operationalAreaId) || incidentData.commandUid !== uid)) {
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
        transaction.update(db.collection('users').doc(firefighterUid), {
          availability: 'available',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
    return { incidentId, status: nextStatus };
  });
});

export const transferIncidentCommand = onCall(async (request) => {
  const uid = requireRoles(request, ['incident_commander']);
  const data = dataObject(request.data);
  const incidentId = identifier(data.incidentId, 'incidentId');
  const requestId = identifier(data.requestId, 'requestId');
  const targetUid = identifier(data.targetUid, 'targetUid');
  const reason = stringField(data, 'reason', 10, 1000);
  const target = await authAdmin.getUser(targetUid);
  const targetAreas = target.customClaims?.operationalAreaIds;
  if (target.customClaims?.role !== 'incident_commander' ||
      !Array.isArray(targetAreas)) {
    throw new HttpsError('failed-precondition', 'El mando solo puede transferirse a una cuenta de mando operativo autorizada.');
  }

  const incidentRef = db.collection('incidents').doc(incidentId);
  const eventRef = incidentRef.collection('events').doc(requestId);
  return db.runTransaction(async (transaction) => {
    const [incident, priorEvent] = await Promise.all([
      transaction.get(incidentRef),
      transaction.get(eventRef),
    ]);
    if (priorEvent.exists) return { incidentId, commandUid: priorEvent.data()?.targetUid ?? targetUid };
    if (!incident.exists) throw new HttpsError('not-found', 'No se encontró el incidente.');
    const incidentData = incident.data()!;
    if (!leaderHasArea(request, incidentData.operationalAreaId) || incidentData.commandUid !== uid) {
      throw new HttpsError('permission-denied', 'No eres el mando operativo actual de este incidente.');
    }
    if (!targetAreas.includes(incidentData.operationalAreaId)) {
      throw new HttpsError('failed-precondition', 'La persona receptora no tiene autorización para el área del incidente.');
    }
    if (incidentData.status === 'closed') throw new HttpsError('failed-precondition', 'No se puede transferir el mando de un incidente cerrado.');
    transaction.update(incidentRef, { commandUid: targetUid, updatedAt: FieldValue.serverTimestamp() });
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
  const uid = requireRoles(request, ['firefighter', 'incident_commander']);
  const data = dataObject(request.data);
  const incidentId = identifier(data.incidentId, 'incidentId');
  const requestId = identifier(data.requestId, 'requestId');
  const note = stringField(data, 'note', 5, 2000);
  const incidentRef = db.collection('incidents').doc(incidentId);
  const eventRef = incidentRef.collection('events').doc(requestId);

  return db.runTransaction(async (transaction) => {
    const [incident, priorEvent] = await Promise.all([
      transaction.get(incidentRef),
      transaction.get(eventRef),
    ]);
    if (priorEvent.exists) return { incidentId, recorded: true };
    if (!incident.exists) throw new HttpsError('not-found', 'No se encontró el incidente.');
    const incidentData = incident.data()!;
    if (incidentData.status === 'closed') {
      throw new HttpsError('failed-precondition', 'No se pueden agregar observaciones a un incidente cerrado.');
    }
    if (roleOf(request) === 'firefighter' && incidentData.assignedUid !== uid) {
      throw new HttpsError('permission-denied', 'Solo la persona asignada puede registrar observaciones.');
    }
    if (roleOf(request) === 'incident_commander' &&
        (!leaderHasArea(request, incidentData.operationalAreaId) || incidentData.commandUid !== uid)) {
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
  const uid = requireRoles(request, ['firefighter']);
  const data = dataObject(request.data);
  const availability = stringField(data, 'availability', 1, 40);
  if (!['available', 'occupied', 'out_of_service'].includes(availability)) {
    throw new HttpsError('invalid-argument', 'La disponibilidad debe ser disponible, ocupado o fuera de servicio.');
  }
  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async (transaction) => {
    const user = await transaction.get(userRef);
    if (!user.exists) throw new HttpsError('not-found', 'No se encontró el perfil operativo.');
    if (user.data()?.availability === 'occupied' && availability !== 'occupied') {
      throw new HttpsError('failed-precondition', 'No puedes cambiar disponibilidad mientras tienes una asignación activa.');
    }
    transaction.update(userRef, { availability, updatedAt: FieldValue.serverTimestamp() });
  });
  return { availability };
});

export const activateOperationalAccount = onCall(async (request) => {
  const actorUid = requireTechnicalAdmin(request);
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
    const brigades = await Promise.all(brigadeIds.map((brigadeId) => db.collection('brigades').doc(brigadeId).get()));
    if (brigades.some((brigade) => !brigade.exists || !Array.isArray(brigade.data()?.memberUids) ||
        !brigade.data()?.memberUids.includes(targetUid))) {
      throw new HttpsError('failed-precondition', 'El integrante debe pertenecer a las brigadas indicadas.');
    }
    operationalAreaIds = [...new Set(brigades.map((brigade) => brigade.data()?.operationalAreaId).filter((area): area is string => typeof area === 'string'))];
  }
  if (role === 'incident_commander' && !requestedAreas.length) {
    throw new HttpsError('invalid-argument', 'El mando debe recibir al menos un área operativa autorizada.');
  }
  const nextClaims = { ...existingClaims, role, brigadeIds, operationalAreaIds };
  await db.collection('users').doc(targetUid).set({
    role,
    brigadeIds,
    operationalAreaIds,
    availability: typeof (await db.collection('users').doc(targetUid).get()).data()?.availability === 'string'
      ? (await db.collection('users').doc(targetUid).get()).data()?.availability
      : 'available',
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await authAdmin.setCustomUserClaims(targetUid, nextClaims);
  await db.collection('operatorInvitations').doc(targetUid).set({
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
  const actorUid = requireTechnicalAdmin(request);
  const data = dataObject(request.data);
  const targetUid = identifier(data.targetUid, 'targetUid');
  const enabled = data.enabled;
  if (typeof enabled !== 'boolean') throw new HttpsError('invalid-argument', 'enabled debe ser booleano.');
  const target = await authAdmin.getUser(targetUid);
  await authAdmin.setCustomUserClaims(targetUid, {
    ...(target.customClaims ?? {}),
    technicalAdmin: enabled,
  });
  await db.collection('operatorInvitations').doc(targetUid).set({
    technicalAdmin: enabled,
    changedBy: actorUid,
    changedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { targetUid, technicalAdmin: enabled };
});
