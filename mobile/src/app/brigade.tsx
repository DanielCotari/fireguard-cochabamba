import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionButton, MutedText, Notice, Panel, WorkspacePage } from '@/components/workspace-ui';
import { useAuth } from '@/lib/auth-context';
import { callOperation, getAuthorizedBrigades, getBrigadeMember } from '@/lib/operations-service';

type BrigadeInfo = {
  id: string;
  name: string;
  contact?: string;
  availability?: string;
  capabilities?: string[];
  memberUids?: string[];
};

type MemberInfo = { uid: string; name: string; availability: string };

export default function BrigadeScreen() {
  const { user, role } = useAuth();
  const [brigades, setBrigades] = useState<BrigadeInfo[]>([]);
  const [members, setMembers] = useState<MemberInfo[]>([]);
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
        name: typeof item.name === 'string' ? item.name : item.id,
        contact: typeof item.contact === 'string' ? item.contact : undefined,
        availability: typeof item.availability === 'string' ? item.availability : undefined,
        capabilities: Array.isArray(item.capabilities) ? item.capabilities.filter((value): value is string => typeof value === 'string') : [],
        memberUids: Array.isArray(item.memberUids) ? item.memberUids.filter((value): value is string => typeof value === 'string') : [],
      }));
      setBrigades(mapped);
      const roster = await Promise.all(mapped.flatMap((brigade) => (brigade.memberUids ?? []).map(async (uid) => {
        const profile = await getBrigadeMember(uid);
        return {
          uid,
          name: typeof profile?.displayName === 'string' ? profile.displayName : `Integrante ${uid.slice(0, 6)}`,
          availability: typeof profile?.availability === 'string' ? profile.availability : 'unknown',
        };
      })));
      if (active) {
        setMembers(roster);
        const own = roster.find((member) => member.uid === user.uid);
        if (own) setAvailability(own.availability);
      }
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : 'No se pudieron consultar los datos de brigada.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [role, user]);

  const updateAvailability = async (next: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await callOperation('setOwnAvailability', { availability: next });
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
        <Panel title="Mi disponibilidad">
          <Text style={styles.status}>Estado actual: {availability === 'available' ? 'Disponible' : availability === 'occupied' ? 'Ocupado' : availability === 'out_of_service' ? 'Fuera de servicio' : 'Sin configurar'}</Text>
          <View style={styles.actions}>
            {[
              ['available', 'Disponible'],
              ['out_of_service', 'Fuera de servicio'],
            ].map(([value, label]) => (
              <Pressable
                key={value}
                disabled={busy || availability === 'occupied'}
                onPress={() => void updateAvailability(value)}
                style={({ pressed }) => [styles.chip, availability === value && styles.chipSelected, (pressed || busy || availability === 'occupied') && styles.disabled]}
              >
                <Text style={[styles.chipText, availability === value && styles.chipTextSelected]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {availability === 'occupied' ? <MutedText>La disponibilidad cambia automáticamente al cerrar una asignación activa.</MutedText> : null}
          {availability !== 'occupied' ? <ActionButton label={busy ? 'Guardando…' : 'Guardar disponibilidad'} onPress={() => void updateAvailability(availability)} disabled={busy} /> : null}
        </Panel>
      ) : null}
      <Panel title={role === 'brigade_leader' ? 'Brigadas a mi cargo' : 'Mis brigadas'}>
        {loading ? <MutedText>Cargando información autorizada…</MutedText> : null}
        {!loading && !brigades.length ? <MutedText>No se encontraron brigadas en los permisos de esta cuenta.</MutedText> : null}
        {brigades.map((brigade) => (
          <View key={brigade.id} style={styles.card}>
            <Text style={styles.status}>{brigade.name}</Text>
            {brigade.availability ? <MutedText>Brigada: {brigade.availability === 'available' ? 'disponible' : brigade.availability === 'occupied' ? 'ocupada' : brigade.availability}</MutedText> : null}
            {brigade.contact ? <MutedText>Contacto institucional: {brigade.contact}</MutedText> : null}
            {brigade.capabilities?.length ? <MutedText>Capacidades: {brigade.capabilities.join(', ')}</MutedText> : null}
            {brigade.memberUids?.map((uid) => {
              const member = members.find((item) => item.uid === uid);
              return (
                <Text key={uid} style={styles.member}>
                  {member?.name ?? `Integrante ${uid.slice(0, 6)}`} · {member?.availability === 'available' ? 'disponible' : member?.availability === 'occupied' ? 'ocupado' : member?.availability === 'out_of_service' ? 'fuera de servicio' : 'estado pendiente'}
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
  status: { color: '#172c27', fontSize: 14, fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 18, borderWidth: 1, borderColor: '#e2e9e4', backgroundColor: '#fff' },
  chipSelected: { backgroundColor: '#eaf2ec', borderColor: '#144b3a' },
  chipText: { color: '#52665a', fontSize: 11, fontWeight: '700' },
  chipTextSelected: { color: '#144b3a' },
  disabled: { opacity: 0.5 },
  card: { borderTopWidth: 1, borderTopColor: '#e2e9e4', paddingTop: 11, gap: 7 },
  member: { color: '#52665a', fontSize: 11, paddingVertical: 3 },
});
