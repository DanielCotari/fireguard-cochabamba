import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, EmptyState, StatusTimeline, useAtlasTheme } from '@/components/atlas-ui';
import { ActionButton, MutedText, Notice, Panel, WorkspacePage } from '@/components/workspace-ui';
import { useAuth } from '@/lib/auth-context';
import { dimensions, radii, spacing, typography } from '@/theme/tokens';
import {
  callOperation,
  fetchOperationalIncidents,
  getAuthorizedBrigades,
  type OperationalDocument,
} from '@/lib/operations-service';

const ASSIGNMENT_STATUS: Record<string, { label: string; stage: string }> = {
  assigned: { label: 'Asignado · sin confirmar desplazamiento', stage: 'Asignación' },
  en_route: { label: 'En desplazamiento', stage: 'Desplazamiento' },
  in_intervention: { label: 'En intervención', stage: 'Intervención' },
  monitoring: { label: 'En vigilancia', stage: 'Vigilancia' },
};

type BrigadeInfo = {
  id: string;
  name: string;
  contact?: string;
  availability?: string;
  capabilities?: string[];
  members: MemberInfo[];
};

type MemberInfo = { uid: string; name: string; availability: string };

export default function BrigadeScreen() {
  const { user, role } = useAuth();
  const { colors } = useAtlasTheme();
  const [brigades, setBrigades] = useState<BrigadeInfo[]>([]);
  const [assignments, setAssignments] = useState<OperationalDocument[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [availability, setAvailability] = useState('available');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !['firefighter', 'brigade_leader'].includes(role)) {
      return;
    }
    let active = true;
    user.getIdTokenResult().then(async (token) => {
      const brigadeIds = Array.isArray(token.claims.brigadeIds)
        ? token.claims.brigadeIds.filter((item): item is string => typeof item === 'string')
        : [];
      const items = await getAuthorizedBrigades(brigadeIds);
      if (!active) return;
      const mapped = items.map((item) => ({
        id: item.id,
        name: item.name,
        contact: typeof item.contact === 'string' ? item.contact : undefined,
        availability: item.availability,
        capabilities: Array.isArray(item.capabilities) ? item.capabilities.filter((value): value is string => typeof value === 'string') : [],
        members: item.members,
      }));
      setBrigades(mapped);
      const roster = mapped.flatMap((brigade) => brigade.members);
      if (active) {
        const own = roster.find((member) => member.uid === user.uid);
        if (own) setAvailability(own.availability);
      }
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : 'No se pudieron consultar los datos de brigada.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [role, user]);

  useEffect(() => {
    if (!user || role !== 'firefighter') return;
    let active = true;
    fetchOperationalIncidents().then((page) => {
      if (active) {
        setAssignments(page.items.filter((item) => item.status !== 'closed'));
        setAssignmentsLoading(false);
      }
    }).catch((failure: unknown) => {
      if (active) {
        setError(failure instanceof Error ? failure.message : 'No se pudieron consultar las asignaciones.');
        setAssignmentsLoading(false);
      }
    });
    return () => { active = false; };
  }, [role, user]);

  const updateAvailability = async (next: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await callOperation('setOwnAvailability', { status: next });
      setAvailability(next);
      setMessage('Disponibilidad actualizada.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo actualizar la disponibilidad.');
    } finally {
      setBusy(false);
    }
  };

  if (!user || !['firefighter', 'brigade_leader'].includes(role)) {
    return (
      <WorkspacePage title="Brigada" description="Información interna visible solo para integrantes autorizados.">
        <Panel title="Acceso restringido"><MutedText>Inicia sesión con una cuenta de bombero o encargado activada.</MutedText></Panel>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage title="Brigada" description="La identidad operativa y pertenencia a brigadas se asignan por un proceso autorizado en el servidor.">
      {error ? <Notice error>{error}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}
      {role === 'firefighter' ? (
        <>
        <Panel title="Mi disponibilidad">
          <Text style={[styles.status, { color: colors.ink }]}>Estado actual: {availability === 'available' ? 'Disponible' : availability === 'busy' ? 'Ocupado' : availability === 'off_duty' ? 'Fuera de servicio' : 'Sin configurar'}</Text>
          <View style={styles.actions}>
            {[
              ['available', 'Disponible'],
              ['off_duty', 'Fuera de servicio'],
            ].map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={`Establecer disponibilidad: ${label}`}
                accessibilityState={{ selected: availability === value, disabled: busy || availability === 'busy' }}
                disabled={busy || availability === 'busy'}
                onPress={() => void updateAvailability(value)}
                style={({ pressed }) => [
                  styles.chip,
                  { borderColor: availability === value ? colors.calm : colors.line, backgroundColor: availability === value ? colors.calmSoft : colors.surface },
                  (pressed || busy || availability === 'busy') && styles.disabled,
                ]}
              >
                <Text style={[styles.chipText, { color: availability === value ? colors.calm : colors.inkMuted }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {availability === 'busy' ? <MutedText>La disponibilidad cambia automáticamente al cerrar una asignación activa.</MutedText> : null}
          {availability !== 'busy' ? <ActionButton label={busy ? 'Guardando…' : 'Guardar disponibilidad'} onPress={() => void updateAvailability(availability)} disabled={busy} /> : null}
        </Panel>
        <Panel title="Mis asignaciones activas">
          {assignmentsLoading ? <MutedText>Cargando asignaciones autorizadas…</MutedText> : null}
          {!assignmentsLoading && !assignments.length ? (
            <EmptyState variant="noData" title="Sin asignaciones activas">
              Cuando recibas una asignación aparecerá aquí. “Asignado” no significa que el equipo ya esté en desplazamiento.
            </EmptyState>
          ) : null}
          {assignments.map((assignment) => {
            const status = typeof assignment.status === 'string' ? assignment.status : '';
            const statusInfo = ASSIGNMENT_STATUS[status];
            return (
              <View key={assignment.id} style={[styles.assignment, { borderTopColor: colors.line }]}>
                <Badge tone={status === 'assigned' ? 'attention' : 'calm'}>
                  {statusInfo?.label ?? 'Estado operativo pendiente'}
                </Badge>
                <MutedText>Incidente {assignment.id}</MutedText>
                {statusInfo ? <StatusTimeline current={statusInfo.stage} /> : null}
                <ActionButton label="Abrir gestión de asignaciones" secondary onPress={() => router.push('/incidents')} />
              </View>
            );
          })}
        </Panel>
        </>
      ) : null}
      <Panel title={role === 'brigade_leader' ? 'Brigadas a mi cargo' : 'Mis brigadas'}>
        {loading ? <MutedText>Cargando información autorizada…</MutedText> : null}
        {!loading && !brigades.length ? <MutedText>No se encontraron brigadas en los permisos de esta cuenta.</MutedText> : null}
        {brigades.map((brigade) => (
          <View key={brigade.id} style={[styles.card, { borderTopColor: colors.line }]}>
            <Text style={[styles.status, { color: colors.ink }]}>{brigade.name}</Text>
            {brigade.availability ? <MutedText>Brigada: {brigade.availability === 'available' ? 'disponible' : brigade.availability === 'occupied' ? 'ocupada' : brigade.availability}</MutedText> : null}
            {brigade.contact ? <MutedText>Contacto institucional: {brigade.contact}</MutedText> : null}
            {brigade.capabilities?.length ? <MutedText>Capacidades: {brigade.capabilities.join(', ')}</MutedText> : null}
            {brigade.members.map((member) => {
            const uid = member.uid;
              return (
                <Text key={uid} style={[styles.member, { color: colors.inkMuted }]}>
                {member.name} · {member.availability === 'available' ? 'disponible' : member.availability === 'busy' ? 'ocupado' : member.availability === 'off_duty' ? 'fuera de servicio' : 'estado pendiente'}
                </Text>
              );
            })}
          </View>
        ))}
      </Panel>
    </WorkspacePage>
  );
}

const styles = StyleSheet.create({
  status: { fontFamily: typography.family.sans, fontSize: typography.size.body, fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { minHeight: dimensions.touchTarget, justifyContent: 'center', paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: dimensions.hairline },
  chipText: { fontFamily: typography.family.sans, fontSize: typography.size.caption, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  card: { borderTopWidth: dimensions.hairline, paddingTop: spacing.sm, gap: spacing.xs },
  assignment: { borderTopWidth: dimensions.hairline, paddingTop: spacing.sm, gap: spacing.sm },
  member: { fontFamily: typography.family.sans, fontSize: typography.size.caption, paddingVertical: spacing.xxs },
});
