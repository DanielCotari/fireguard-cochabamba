import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, Field, MutedText, Notice, Panel, WorkspacePage } from '@/components/workspace-ui';
import { useAuth } from '@/lib/auth-context';
import {
  callOperation,
  getAuthorizedBrigades,
  getBrigadeMember,
  newOperationId,
  subscribeIncidentEvents,
  subscribeOperationalIncidents,
  subscribeReportsForReview,
  type OperationalDocument,
} from '@/lib/operations-service';

const INCIDENT_STATUS: Record<string, string> = {
  under_evaluation: 'En evaluación',
  pending_assignment: 'Pendiente de asignación',
  assigned: 'Asignado · sin confirmar desplazamiento',
  en_route: 'En desplazamiento',
  in_intervention: 'En intervención',
  monitoring: 'En vigilancia',
  closed: 'Cerrado',
};

type BrigadeRoster = {
  id: string;
  name: string;
  availability: string;
  members: { uid: string; name: string; availability: string }[];
};

function requestKey(action: string, subject: string) {
  return `${action}:${subject}`;
}

export default function IncidentsScreen() {
  const { user, role } = useAuth();
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [brigadeIds, setBrigadeIds] = useState<string[]>([]);
  const [reports, setReports] = useState<OperationalDocument[]>([]);
  const [incidents, setIncidents] = useState<OperationalDocument[]>([]);
  const [incidentEvents, setIncidentEvents] = useState<Record<string, OperationalDocument[]>>({});
  const [observationNotes, setObservationNotes] = useState<Record<string, string>>({});
  const [brigades, setBrigades] = useState<BrigadeRoster[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [targetUid, setTargetUid] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const requestIds = useRef(new Map<string, string>());
  const incidentIds = incidents.map((incident) => incident.id).join(',');

  const idempotencyKey = useCallback((key: string) => {
    let id = requestIds.current.get(key);
    if (!id) {
      id = newOperationId();
      requestIds.current.set(key, id);
    }
    return id;
  }, []);

  useEffect(() => {
    if (!user || !['firefighter', 'brigade_leader', 'incident_commander'].includes(role)) {
      return;
    }
    let active = true;
    user.getIdTokenResult().then((token) => {
      if (!active) return;
      const areas = token.claims.operationalAreaIds;
      const teams = token.claims.brigadeIds;
      setAreaIds(Array.isArray(areas) ? areas.filter((item): item is string => typeof item === 'string') : []);
      setBrigadeIds(Array.isArray(teams) ? teams.filter((item): item is string => typeof item === 'string') : []);
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : 'No se pudieron leer los permisos operativos.');
    });
    return () => { active = false; };
  }, [role, user]);

  useEffect(() => {
    if (!user || !['firefighter', 'brigade_leader', 'incident_commander'].includes(role)) return;
    return subscribeOperationalIncidents(
      user.uid,
      role,
      areaIds,
      (items) => { setIncidents(items); setLoading(false); setError(null); },
      (failure) => { setLoading(false); setError(failure.message); },
    );
  }, [areaIds, role, user]);

  useEffect(() => {
    if (!user || !['brigade_leader', 'incident_commander'].includes(role)) return;
    return subscribeReportsForReview(
      areaIds,
      setReports,
      (failure) => setError(failure.message),
    );
  }, [areaIds, role, user]);

  useEffect(() => {
    const subscriptions = incidentIds
      ? incidentIds.split(',').map((incidentId) =>
        subscribeIncidentEvents(
          incidentId,
          (items) => setIncidentEvents((current) => ({ ...current, [incidentId]: items })),
          (failure) => setError(failure.message),
        ),
      )
      : [];
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [incidentIds]);

  useEffect(() => {
    let active = true;
    if (role !== 'brigade_leader' || brigadeIds.length === 0) {
      return;
    }
    getAuthorizedBrigades(brigadeIds).then(async (items) => Promise.all(items.map(async (brigade) => {
      const members = Array.isArray(brigade.memberUids) ? brigade.memberUids.filter((uid): uid is string => typeof uid === 'string') : [];
      const profiles = await Promise.all(members.map(async (uid) => ({ uid, profile: await getBrigadeMember(uid) })));
      return {
        id: brigade.id,
        name: typeof brigade.name === 'string' ? brigade.name : brigade.id,
        availability: typeof brigade.availability === 'string' ? brigade.availability : 'unknown',
        members: profiles.map(({ uid, profile }) => ({
          uid,
          name: typeof profile?.displayName === 'string' ? profile.displayName : `Integrante ${uid.slice(0, 6)}`,
          availability: typeof profile?.availability === 'string' ? profile.availability : 'unknown',
        })),
      };
    })))
      .then((items) => { if (active) setBrigades(items); })
      .catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : 'No se pudo consultar la disponibilidad de la brigada.'); });
    return () => { active = false; };
  }, [brigadeIds, role]);

  const runOperation = async (
    key: string,
    name: string,
    payload: Record<string, unknown>,
    success: string,
  ): Promise<boolean> => {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await callOperation(name, { ...payload, requestId: idempotencyKey(key) });
      requestIds.current.delete(key);
      setMessage(success);
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? `${failure.message} Puedes reintentar la misma acción.` : 'No se pudo completar la acción. Puedes reintentarlo.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const review = (reportId: string, decision: string) =>
    runOperation(requestKey(`review-${decision}`, reportId), 'reviewReport', { reportId, decision }, 'La evaluación quedó guardada en el servidor.');
  const assign = (incidentId: string, brigadeId: string, firefighterUid: string) =>
    runOperation(requestKey(`assign-${brigadeId}-${firefighterUid}`, incidentId), 'assignBrigade', { incidentId, brigadeId, firefighterUid }, 'Asignación registrada. El equipo aún no figura como desplazado.');

  const updateStatus = async (incidentId: string, status: string) => {
    const key = requestKey(`status-${status}`, incidentId);
    const succeeded = await runOperation(key, 'updateIncidentStatus', {
      incidentId,
      status,
      note: status === 'closed' ? reason : '',
    }, status === 'closed' ? 'El cierre y su motivo quedaron registrados.' : `Estado actualizado: ${INCIDENT_STATUS[status]}.`);
    if (status === 'closed' && succeeded) setReason('');
  };

  const decline = (incidentId: string) => runOperation(
    requestKey('decline', incidentId),
    'declineIncidentAssignment',
    { incidentId, reason },
    'Se registró el motivo y el incidente volvió a pendiente de asignación.',
  );

  const transfer = (incidentId: string) => runOperation(
    requestKey(`transfer-${targetUid}`, incidentId),
    'transferIncidentCommand',
    { incidentId, targetUid, reason: transferReason },
    'La transferencia de mando quedó registrada en la bitácora.',
  );

  const recordObservation = async (incidentId: string) => {
    const note = (observationNotes[incidentId] ?? '').trim();
    const succeeded = await runOperation(
      requestKey('observation', incidentId),
      'recordIncidentObservation',
      { incidentId, note },
      'La observación quedó registrada en la bitácora.',
    );
    if (succeeded) setObservationNotes((current) => ({ ...current, [incidentId]: '' }));
  };

  const formatEventDate = (value: unknown) => {
    if (typeof value !== 'object' || value === null || !('seconds' in value) || typeof value.seconds !== 'number') {
      return 'Hora pendiente';
    }
    return new Date(value.seconds * 1000).toLocaleString();
  };

  if (!user || !['firefighter', 'brigade_leader', 'incident_commander'].includes(role)) {
    return (
      <WorkspacePage title="Incidentes" description="Acceso operativo según funciones y áreas autorizadas.">
        <Panel title="Acceso restringido">
          <MutedText>Inicia sesión con una cuenta operativa activada por una persona administradora autorizada.</MutedText>
        </Panel>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage title="Incidentes" description="Un reporte ciudadano, una detección satelital y un incidente son registros distintos. Las decisiones operativas y sus autores quedan en la bitácora.">
      {error ? <Notice error>{error}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}
      {role !== 'firefighter' ? (
        <Panel title="Reportes para evaluación">
          {!reports.length ? <MutedText>No hay reportes visibles en tus áreas autorizadas.</MutedText> : null}
          {reports.map((report) => {
            const id = typeof report.id === 'string' ? report.id : '';
            const status = typeof report.status === 'string' ? report.status : 'received';
            return (
              <View key={id} style={styles.item}>
                <Text style={styles.itemTitle}>Reporte · {status}</Text>
                <Text style={styles.copy}>{typeof report.description === 'string' ? report.description : ''}</Text>
                <MutedText>
                  Contraste satelital: {report.satelliteMatch === 'match_found' ? 'coincidencia encontrada' : report.satelliteMatch === 'no_match_found' ? 'sin coincidencia' : 'pendiente'}.
                  Ningún resultado confirma ni descarta por sí solo un incendio.
                </MutedText>
                {['received', 'under_evaluation'].includes(status) ? (
                  <View style={styles.actions}>
                    <ActionButton label="Mantener en evaluación" secondary disabled={busy !== null} onPress={() => void review(id, 'keep_evaluating')} />
                    <ActionButton label="Crear incidente" disabled={busy !== null} onPress={() => void review(id, 'create_incident')} />
                    <ActionButton label="Evaluar sin incidente" secondary disabled={busy !== null} onPress={() => void review(id, 'close_without_incident')} />
                  </View>
                ) : null}
                {!['linked_to_incident', 'reviewed_without_incident'].includes(status) ? incidents
                  .filter((incident) => incident.status !== 'closed' && incident.operationalAreaId === report.operationalAreaId)
                  .map((incident) => (
                    <ActionButton
                      key={`${id}-${incident.id}`}
                      label={`Vincular al incidente ${incident.id.slice(0, 8)}`}
                      secondary
                      disabled={busy !== null}
                      onPress={() => void runOperation(
                        requestKey(`link-${incident.id}`, id),
                        'linkReportToIncident',
                        { reportId: id, incidentId: incident.id },
                        'El reporte quedó vinculado al incidente.',
                      )}
                    />
                  )) : null}
              </View>
            );
          })}
        </Panel>
      ) : null}

      <Panel title="Incidentes asignados y del área">
        {loading ? <MutedText>Cargando incidentes autorizados…</MutedText> : null}
        {!loading && !incidents.length ? <MutedText>No hay incidentes asignados o visibles en tus áreas.</MutedText> : null}
        {incidents.map((incident) => {
          const id = incident.id;
          const status = typeof incident.status === 'string' ? incident.status : 'unknown';
          const currentCommander = role === 'incident_commander' && incident.commandUid === user.uid;
          const canUpdate = currentCommander || (role === 'firefighter' && incident.assignedUid === user.uid);
          const nextStatuses = status === 'assigned'
            ? ['en_route']
            : status === 'en_route'
              ? ['in_intervention']
              : status === 'in_intervention'
                ? ['monitoring']
                : status === 'monitoring'
                  ? ['in_intervention', 'closed']
                  : [];
          return (
            <View key={id} style={styles.item}>
              <Text style={styles.itemTitle}>{INCIDENT_STATUS[status] ?? status}</Text>
              <MutedText>Incidente {id}</MutedText>
              {Array.isArray(incident.reportIds) ? <MutedText>Reportes vinculados: {incident.reportIds.length}</MutedText> : null}
              <View style={styles.timeline}>
                <Text style={styles.section}>Bitácora de acciones</Text>
                {(incidentEvents[id] ?? []).map((event) => (
                  <View key={event.id} style={styles.event}>
                    <Text style={styles.eventText}>{typeof event.message === 'string' ? event.message : 'Actualización del incidente.'}</Text>
                    <Text style={styles.eventDate}>{formatEventDate(event.createdAt)}</Text>
                  </View>
                ))}
                {!incidentEvents[id]?.length ? <MutedText>Sin acciones registradas.</MutedText> : null}
              </View>
              {role === 'brigade_leader' && status === 'pending_assignment' ? (
                <View style={styles.assignment}>
                  <Text style={styles.section}>Personal disponible de brigadas autorizadas</Text>
                  {brigades.flatMap((brigade) => brigade.members
                    .filter((member) => brigade.availability === 'available' && member.availability === 'available')
                    .map((member) => (
                      <ActionButton
                        key={`${brigade.id}-${member.uid}`}
                        label={`Asignar ${brigade.name} · ${member.name}`}
                        disabled={busy !== null}
                        onPress={() => void assign(id, brigade.id, member.uid)}
                      />
                    )))}
                  {!brigades.some((brigade) => brigade.availability === 'available' && brigade.members.some((member) => member.availability === 'available')) ? (
                    <MutedText>No hay brigadas e integrantes disponibles.</MutedText>
                  ) : null}
                </View>
              ) : null}
              {role === 'firefighter' && status === 'assigned' && incident.assignedUid === user.uid ? (
                <View style={styles.assignment}>
                  <Field label="Motivo si no puedes intervenir" value={reason} onChangeText={setReason} placeholder="Describe por qué se requiere reasignación." multiline />
                  <ActionButton label="Informar que no puedo intervenir" secondary disabled={busy !== null || reason.trim().length < 10} onPress={() => void decline(id)} />
                </View>
              ) : null}
              {canUpdate && nextStatuses.includes('closed') ? (
                <Field label="Motivo de cierre (mínimo 15 caracteres)" value={reason} onChangeText={setReason} placeholder="Documenta la evaluación y el motivo del cierre." multiline />
              ) : null}
              {canUpdate && status !== 'closed' ? (
                <View style={styles.assignment}>
                  <Field
                    label="Observación o avance (mínimo 5 caracteres)"
                    value={observationNotes[id] ?? ''}
                    onChangeText={(value) => {
                      setObservationNotes((current) => ({ ...current, [id]: value }));
                      requestIds.current.delete(requestKey('observation', id));
                    }}
                    placeholder="Describe condiciones, acciones realizadas o novedades."
                    multiline
                  />
                  <ActionButton
                    label="Registrar observación"
                    secondary
                    disabled={busy !== null || (observationNotes[id] ?? '').trim().length < 5}
                    onPress={() => void recordObservation(id)}
                  />
                </View>
              ) : null}
              {canUpdate ? (
                <View style={styles.actions}>
                  {nextStatuses.map((next) => (
                    <ActionButton
                      key={next}
                      label={next === 'en_route' ? 'Registrar salida a desplazamiento' : next === 'in_intervention' ? 'Iniciar intervención' : next === 'monitoring' ? 'Pasar a vigilancia' : 'Cerrar incidente'}
                      secondary={next === 'in_intervention'}
                      disabled={busy !== null || (next === 'closed' && reason.trim().length < 15)}
                      onPress={() => void updateStatus(id, next)}
                    />
                  ))}
                </View>
              ) : null}
              {currentCommander && status !== 'closed' ? (
                <View style={styles.assignment}>
                  <Text style={styles.section}>Transferencia de mando</Text>
                  <Field label="UID de la persona operativa autorizada" value={targetUid} onChangeText={setTargetUid} placeholder="UID de cuenta existente" />
                  <Field label="Motivo de transferencia" value={transferReason} onChangeText={setTransferReason} placeholder="Motivo documentado (mínimo 10 caracteres)" multiline />
                  <ActionButton label="Registrar transferencia" secondary disabled={busy !== null || targetUid.length < 10 || transferReason.trim().length < 10} onPress={() => void transfer(id)} />
                </View>
              ) : null}
            </View>
          );
        })}
      </Panel>
    </WorkspacePage>
  );
}

const styles = StyleSheet.create({
  item: { borderTopWidth: 1, borderTopColor: '#e2e9e4', paddingTop: 13, gap: 9 },
  itemTitle: { color: '#172c27', fontSize: 14, fontWeight: '800' },
  copy: { color: '#52665a', fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  assignment: { borderRadius: 9, backgroundColor: '#f5f8f5', padding: 11, gap: 9 },
  section: { color: '#172c27', fontSize: 12, fontWeight: '800' },
  timeline: { borderTopWidth: 1, borderTopColor: '#e2e9e4', paddingTop: 10, gap: 8 },
  event: { gap: 3 },
  eventText: { color: '#52665a', fontSize: 11, lineHeight: 16 },
  eventDate: { color: '#7c8b83', fontSize: 9 },
});
