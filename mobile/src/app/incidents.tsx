import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, Field, MutedText, Notice, Panel, WorkspacePage } from '@/components/workspace-ui';
import { StatusTimeline, useAtlasTheme } from '@/components/atlas-ui';
import { useAuth } from '@/lib/auth-context';
import {
  callOperation,
  fetchIncidentLogs,
  fetchOperationalIncidents,
  fetchReportsForReview,
  getAuthorizedBrigades,
  newOperationId,
  type BrigadeRoster,
  type OperationalDocument,
} from '@/lib/operations-service';
import { dimensions, radii, spacing, typography } from '@/theme/tokens';

const INCIDENT_STATUS: Record<string, string> = {
  under_evaluation: 'En evaluación',
  pending_assignment: 'Pendiente de asignación',
  assigned: 'Asignado · sin confirmar desplazamiento',
  en_route: 'En desplazamiento',
  in_intervention: 'En intervención',
  monitoring: 'En vigilancia',
  closed: 'Cerrado',
};

const INCIDENT_STAGE: Record<string, string> = {
  under_evaluation: 'Evaluación',
  pending_assignment: 'Asignación',
  assigned: 'Asignación',
  en_route: 'Desplazamiento',
  in_intervention: 'Intervención',
  monitoring: 'Vigilancia',
  closed: 'Cierre',
};

function requestKey(action: string, subject: string) {
  return `${action}:${subject}`;
}

export default function IncidentsScreen() {
  const { user, role } = useAuth();
  const { colors } = useAtlasTheme();
  const [brigadeIds, setBrigadeIds] = useState<string[]>([]);
  const [reports, setReports] = useState<OperationalDocument[]>([]);
  const [incidents, setIncidents] = useState<OperationalDocument[]>([]);
  const [incidentEvents, setIncidentEvents] = useState<Record<string, OperationalDocument[]>>({});
  const [observationNotes, setObservationNotes] = useState<Record<string, string>>({});
  const [brigades, setBrigades] = useState<BrigadeRoster[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportCursor, setReportCursor] = useState<string | null>(null);
  const [incidentCursor, setIncidentCursor] = useState<string | null>(null);
  const [loadingMoreReports, setLoadingMoreReports] = useState(false);
  const [loadingMoreIncidents, setLoadingMoreIncidents] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [targetUid, setTargetUid] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const requestIds = useRef(new Map<string, string>());
  const incidentIds = incidents.map((incident) => incident.id).join(',');
  const refreshData = useCallback(async () => {
    if (!user || !['firefighter', 'brigade_leader', 'incident_commander'].includes(role)) return;
    try {
      const [incidentPage, reportPage] = await Promise.all([
        fetchOperationalIncidents(),
        role === 'firefighter' ? Promise.resolve({ items: [] }) : fetchReportsForReview(),
      ]);
      setIncidents(incidentPage.items);
      setReports(reportPage.items);
      setIncidentCursor(incidentPage.nextCursor);
      setReportCursor('nextCursor' in reportPage ? reportPage.nextCursor : null);
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudieron cargar las bandejas operativas.');
    } finally {
      setLoading(false);
    }
  }, [role, user]);

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
      const teams = token.claims.brigadeIds;
      setBrigadeIds(Array.isArray(teams) ? teams.filter((item): item is string => typeof item === 'string') : []);
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : 'No se pudieron leer los permisos operativos.');
    });
    return () => { active = false; };
  }, [role, user]);

  useEffect(() => {
    if (!user || !['firefighter', 'brigade_leader', 'incident_commander'].includes(role)) return;
    let active = true;
    Promise.all([
      fetchOperationalIncidents(),
      role === 'firefighter' ? Promise.resolve({ items: [] }) : fetchReportsForReview(),
    ]).then(([incidentPage, reportPage]) => {
      if (!active) return;
      setIncidents(incidentPage.items);
      setReports(reportPage.items);
      setIncidentCursor(incidentPage.nextCursor);
      setReportCursor('nextCursor' in reportPage ? reportPage.nextCursor : null);
      setError(null);
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : 'No se pudieron cargar las bandejas operativas.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [role, user]);

  const loadMoreReports = async () => {
    if (!reportCursor || loadingMoreReports) return;
    setLoadingMoreReports(true);
    try {
      const page = await fetchReportsForReview(reportCursor);
      setReports((current) => [...current, ...page.items]);
      setReportCursor(page.nextCursor);
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo cargar la siguiente página de reportes.');
    } finally {
      setLoadingMoreReports(false);
    }
  };

  const loadMoreIncidents = async () => {
    if (!incidentCursor || loadingMoreIncidents) return;
    setLoadingMoreIncidents(true);
    try {
      const page = await fetchOperationalIncidents(incidentCursor);
      setIncidents((current) => [...current, ...page.items]);
      setIncidentCursor(page.nextCursor);
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo cargar la siguiente página de incidentes.');
    } finally {
      setLoadingMoreIncidents(false);
    }
  };

  useEffect(() => {
    let active = true;
    const loadLogs = async () => {
      try {
        const entries = await Promise.all(incidentIds.split(',').filter(Boolean).map(async (incidentId) => [
          incidentId,
          await fetchIncidentLogs(incidentId),
        ] as const));
        if (active) setIncidentEvents(Object.fromEntries(entries));
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'No se pudo consultar la bitácora autorizada.');
      }
    };
    void loadLogs();
    return () => { active = false; };
  }, [incidentIds]);

  useEffect(() => {
    let active = true;
    if (role !== 'brigade_leader' || brigadeIds.length === 0) {
      return;
    }
    getAuthorizedBrigades(brigadeIds)
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
      void refreshData();
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
              <View key={id} style={[styles.item, { borderTopColor: colors.line }]}>
                <Text style={[styles.itemTitle, { color: colors.ink }]}>Reporte · {status}</Text>
                <Text style={[styles.copy, { color: colors.inkMuted }]}>{typeof report.description === 'string' ? report.description : ''}</Text>
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
          {reportCursor ? (
            <ActionButton
              label={loadingMoreReports ? 'Cargando…' : 'Cargar más reportes'}
              secondary
              disabled={loadingMoreReports}
              onPress={() => void loadMoreReports()}
            />
          ) : null}
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
            <View key={id} style={[styles.item, { borderTopColor: colors.line }]}>
              <Text style={[styles.itemTitle, { color: colors.ink }]}>{INCIDENT_STATUS[status] ?? status}</Text>
              <MutedText>Incidente {id}</MutedText>
              {INCIDENT_STAGE[status] ? <StatusTimeline current={INCIDENT_STAGE[status]} /> : null}
              {Array.isArray(incident.reportIds) ? <MutedText>Reportes vinculados: {incident.reportIds.length}</MutedText> : null}
              <View style={[styles.timeline, { borderTopColor: colors.line }]}>
                <Text style={[styles.section, { color: colors.ink }]}>Bitácora de acciones</Text>
                {(incidentEvents[id] ?? []).map((event) => (
                  <View key={event.id} style={styles.event}>
                    <Text style={[styles.eventText, { color: colors.inkMuted }]}>{typeof event.message === 'string' ? event.message : 'Actualización del incidente.'}</Text>
                    <Text style={[styles.eventDate, { color: colors.inkSubtle }]}>{formatEventDate(event.createdAt)}</Text>
                  </View>
                ))}
                {!incidentEvents[id]?.length ? <MutedText>Sin acciones registradas.</MutedText> : null}
              </View>
              {role === 'brigade_leader' && status === 'pending_assignment' ? (
                <View style={styles.assignment}>
                  <Text style={[styles.section, { color: colors.ink }]}>Personal disponible de brigadas autorizadas</Text>
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
                  <ActionButton label="No puedo atender esta asignación" secondary disabled={busy !== null || reason.trim().length < 10} onPress={() => void decline(id)} />
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
                  <Text style={[styles.section, { color: colors.ink }]}>Transferencia de mando</Text>
                  <Field label="UID de la persona operativa autorizada" value={targetUid} onChangeText={setTargetUid} placeholder="UID de cuenta existente" />
                  <Field label="Motivo de transferencia" value={transferReason} onChangeText={setTransferReason} placeholder="Motivo documentado (mínimo 10 caracteres)" multiline />
                  <ActionButton label="Registrar transferencia" secondary disabled={busy !== null || targetUid.length < 10 || transferReason.trim().length < 10} onPress={() => void transfer(id)} />
                </View>
              ) : null}
            </View>
          );
        })}
        {incidentCursor ? (
          <ActionButton
            label={loadingMoreIncidents ? 'Cargando…' : 'Cargar más incidentes'}
            secondary
            disabled={loadingMoreIncidents}
            onPress={() => void loadMoreIncidents()}
          />
        ) : null}
      </Panel>
    </WorkspacePage>
  );
}

const styles = StyleSheet.create({
  item: { borderTopWidth: dimensions.hairline, paddingTop: spacing.sm, gap: spacing.sm },
  itemTitle: { fontFamily: typography.family.sans, fontSize: typography.size.body, fontWeight: '800' },
  copy: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  assignment: { borderRadius: radii.medium, padding: spacing.sm, gap: spacing.sm },
  section: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '800' },
  timeline: { borderTopWidth: dimensions.hairline, paddingTop: spacing.sm, gap: spacing.xs },
  event: { gap: spacing.xxs },
  eventText: { fontFamily: typography.family.sans, fontSize: typography.size.caption, lineHeight: typography.lineHeight.body },
  eventDate: { fontFamily: typography.family.mono, fontSize: typography.size.caption },
});
