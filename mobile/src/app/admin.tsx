import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAtlasTheme } from '@/components/atlas-ui';
import { ActionButton, Field, MutedText, Notice, Panel, WorkspacePage } from '@/components/workspace-ui';
import { useAuth } from '@/lib/auth-context';
import { callOperation } from '@/lib/operations-service';
import { spacing, typography } from '@/theme/tokens';

const OPERATIONAL_ROLES = [
  ['firefighter', 'Bombero'],
  ['brigade_leader', 'Encargado de brigada'],
  ['incident_commander', 'Mando operativo'],
] as const;

export default function AdminScreen() {
  const { technicalAdmin } = useAuth();
  const { colors } = useAtlasTheme();
  const [targetUid, setTargetUid] = useState('');
  const [role, setRole] = useState<(typeof OPERATIONAL_ROLES)[number][0]>('firefighter');
  const [brigadeIds, setBrigadeIds] = useState('');
  const [areaIds, setAreaIds] = useState('');
  const [techUid, setTechUid] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activate = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await callOperation('activateOperationalAccount', {
        targetUid: targetUid.trim(),
        role,
        brigadeIds: brigadeIds.split(',').map((id) => id.trim()).filter(Boolean),
        operationalAreaIds: areaIds.split(',').map((id) => id.trim()).filter(Boolean),
      });
      setMessage('La cuenta recibió permisos operativos autorizados. Pídele que vuelva a iniciar sesión para renovar sus credenciales.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo activar la cuenta.');
    } finally {
      setBusy(false);
    }
  };

  const updateTechnicalRole = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await callOperation('grantTechnicalAdministrator', { targetUid: techUid.trim(), enabled });
      setMessage(`Permiso de administración técnica ${enabled ? 'activado' : 'revocado'}.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo cambiar el permiso técnico.');
    } finally {
      setBusy(false);
    }
  };

  if (!technicalAdmin) {
    return (
      <WorkspacePage title="Administración" description="Esta sección requiere una autorización técnica separada del mando operativo.">
        <Panel title="Acceso restringido"><MutedText>Solo el servidor puede conceder este permiso. Un administrador técnico no se convierte automáticamente en comandante de incidentes.</MutedText></Panel>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage title="Administración técnica" description="Activa cuentas operativas autorizadas. Las áreas y brigadas se validan en el servidor contra sus registros.">
      {error ? <Notice error>{error}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}
      <Panel title="Activar una cuenta operativa">
        <Field label="UID de una cuenta existente" value={targetUid} onChangeText={setTargetUid} placeholder="UID de Firebase Authentication" />
        <Text style={[styles.label, { color: colors.ink }]}>Rol asignado por proceso autorizado</Text>
        <View style={styles.roles}>
          {OPERATIONAL_ROLES.map(([value, label]) => (
            <ActionButton key={value} label={label} secondary={role !== value} onPress={() => setRole(value)} />
          ))}
        </View>
        <Field label="UIDs de brigadas (separados por coma)" value={brigadeIds} onChangeText={setBrigadeIds} placeholder="Obligatorio para bomberos y encargados" />
        {role === 'incident_commander' ? <Field label="Áreas operativas autorizadas (separadas por coma)" value={areaIds} onChangeText={setAreaIds} placeholder="cochabamba-pilot" /> : null}
        <MutedText>El usuario debe crear primero su cuenta. El servidor valida el UID, la relación con las brigadas y los permisos del administrador. Nunca se aceptan roles enviados desde el perfil ciudadano.</MutedText>
        <ActionButton label={busy ? 'Procesando…' : 'Activar cuenta'} disabled={busy || targetUid.trim().length < 10} onPress={() => void activate()} />
      </Panel>
      <Panel title="Permisos de administración técnica">
        <Field label="UID de cuenta existente" value={techUid} onChangeText={setTechUid} placeholder="UID de Firebase Authentication" />
        <MutedText>El permiso técnico no otorga mando operativo ni lectura operativa por sí solo.</MutedText>
        <View style={styles.roles}>
          <ActionButton label="Conceder administración técnica" disabled={busy || techUid.trim().length < 10} onPress={() => void updateTechnicalRole(true)} />
          <ActionButton label="Revocar permiso" secondary disabled={busy || techUid.trim().length < 10} onPress={() => void updateTechnicalRole(false)} />
        </View>
      </Panel>
    </WorkspacePage>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '700' },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
