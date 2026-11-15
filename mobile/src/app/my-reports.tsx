import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, MutedText, Notice, Panel, WorkspacePage } from '@/components/workspace-ui';
import { useAuth } from '@/lib/auth-context';
import {
  subscribeToMyReports,
  subscribeToReportUpdates,
  type CitizenReport,
  type ReportUpdate,
} from '@/lib/report-service';

const REPORT_STATUS: Record<string, string> = {
  received: 'Reporte recibido',
  under_evaluation: 'En evaluación',
  linked_to_incident: 'Vinculado a un incidente',
  reviewed_without_incident: 'Evaluado sin crear incidente',
};

function formatDate(value: CitizenReport['observedAt'] | CitizenReport['createdAt']) {
  if (!value) return 'Fecha pendiente';
  const date = typeof value === 'string' ? new Date(value) : new Date(value.seconds * 1000);
  return Number.isNaN(date.getTime()) ? 'Fecha pendiente' : date.toLocaleString();
}

export default function MyReportsScreen() {
  const { user, role } = useAuth();
  const [reports, setReports] = useState<CitizenReport[]>([]);
  const [updates, setUpdates] = useState<Record<string, ReportUpdate[]>>({});
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState<string | null>(null);
  const reportIds = useMemo(() => reports.map((report) => report.id).join(','), [reports]);

  useEffect(() => {
    if (!user || role !== 'citizen') {
      return;
    }
    return subscribeToMyReports(
      user.uid,
      (items) => {
        setReports(items);
        setLoading(false);
        setError(null);
      },
      (reason) => {
        setLoading(false);
        setError(reason.message);
      },
    );
  }, [role, user]);

  useEffect(() => {
    const subscriptions = reportIds ? reportIds.split(',').map((reportId) =>
      subscribeToReportUpdates(
        reportId,
        (items) => setUpdates((current) => ({ ...current, [reportId]: items })),
        (reason) => setError(reason.message),
      ),
    ) : [];
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [reportIds]);

  if (!user) {
    return (
      <WorkspacePage title="Mis reportes" description="El historial privado solo está disponible para la cuenta que creó cada reporte.">
        <Panel title="Inicia sesión">
          <MutedText>La consulta del mapa y el calendario es pública; el historial ciudadano requiere autenticación.</MutedText>
          <ActionButton label="Ir a Perfil" onPress={() => router.push('/profile')} />
        </Panel>
      </WorkspacePage>
    );
  }

  if (role !== 'citizen') {
    return (
      <WorkspacePage title="Mis reportes">
        <Panel title="Historial no disponible">
          <MutedText>Esta vista contiene solo reportes creados por una cuenta ciudadana.</MutedText>
        </Panel>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage title="Mis reportes" description="Consulta el estado y las actualizaciones confirmadas por los responsables operativos.">
      {error ? <Notice error>No se pudieron actualizar tus reportes: {error}. Verifica la conexión; la suscripción volverá a intentarlo.</Notice> : null}
      {loading ? <Panel title="Cargando"><MutedText>Consultando tus reportes…</MutedText></Panel> : null}
      {!loading && !error && !reports.length ? (
        <Panel title="Todavía no tienes reportes">
          <MutedText>Cuando envíes uno, aparecerá aquí después de guardarse en el servidor.</MutedText>
          <ActionButton label="Crear reporte" onPress={() => router.push('/report')} />
        </Panel>
      ) : null}
      {reports.map((report) => (
        <Panel
          key={report.id}
          title={REPORT_STATUS[report.status] ?? report.status}
          action={<Text style={styles.date}>{formatDate(report.createdAt)}</Text>}
        >
          <Text style={styles.description}>{report.description}</Text>
          <MutedText>Observado: {formatDate(report.observedAt)}</MutedText>
          <MutedText>
            Contraste satelital: {report.satelliteMatch === 'match_found'
              ? 'coincidencia encontrada (no confirma un incendio)'
              : report.satelliteMatch === 'no_match_found'
                ? 'sin coincidencia encontrada (no descarta el reporte)'
                : 'pendiente de consulta'}
          </MutedText>
          {report.incidentId ? <MutedText>Incidente asociado: {report.incidentId}</MutedText> : null}
          <View style={styles.timeline}>
            <Text style={styles.timelineTitle}>Actualizaciones</Text>
            {(updates[report.id] ?? []).map((update) => (
              <View key={update.id} style={styles.event}>
                <View style={styles.eventDot} />
                <View style={styles.eventCopy}>
                  <Text style={styles.eventMessage}>{update.message}</Text>
                  <Text style={styles.date}>{formatDate(update.createdAt)}</Text>
                </View>
              </View>
            ))}
            {!updates[report.id]?.length ? <MutedText>No hay eventos nuevos.</MutedText> : null}
          </View>
        </Panel>
      ))}
    </WorkspacePage>
  );
}

const styles = StyleSheet.create({
  date: { color: '#64756e', fontSize: 10 },
  description: { color: '#172c27', fontSize: 13, lineHeight: 19 },
  timeline: { borderTopWidth: 1, borderTopColor: '#e2e9e4', paddingTop: 10, gap: 9 },
  timelineTitle: { color: '#172c27', fontSize: 12, fontWeight: '800' },
  event: { flexDirection: 'row', gap: 8 },
  eventDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2d8a5a', marginTop: 5 },
  eventCopy: { flex: 1, gap: 2 },
  eventMessage: { color: '#52665a', fontSize: 11, lineHeight: 16 },
});
