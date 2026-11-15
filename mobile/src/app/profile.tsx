import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, Field, MutedText, Notice, Panel, WorkspacePage } from '@/components/workspace-ui';
import { useAuth } from '@/lib/auth-context';
import { requestPasswordReset, registerCitizen, signIn, signOutCurrentUser } from '@/lib/auth-service';

type FormMode = 'sign_in' | 'register' | 'reset';

export default function ProfileScreen() {
  const { user, role, technicalAdmin, configured } = useAuth();
  const [mode, setMode] = useState<FormMode>('sign_in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  const submit = async () => {
    setBusy(true);
    setNotice(null);
    try {
      if (mode === 'register') {
        if (!name.trim() || !email.trim() || password.length < 6) {
          throw new Error('Ingresa tu nombre, correo y una contraseña de al menos 6 caracteres.');
        }
        await registerCitizen(name, email, password, phone);
        setNotice({ text: 'Cuenta ciudadana creada. Ya puedes enviar reportes.', error: false });
        router.replace('/report');
      } else if (mode === 'sign_in') {
        await signIn(email, password);
        setNotice({ text: 'Sesión iniciada.', error: false });
      } else {
        if (!email.trim()) throw new Error('Ingresa el correo asociado a tu cuenta.');
        await requestPasswordReset(email);
        setNotice({ text: 'Si el correo está registrado, recibirás instrucciones para recuperar el acceso.', error: false });
      }
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'No se pudo completar la operación.', error: true });
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await signOutCurrentUser();
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'No se pudo cerrar la sesión.', error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkspacePage title="Perfil y acceso" description="Las cuentas ciudadanas se registran con correo y contraseña. El teléfono es un contacto opcional, no un método de autenticación.">
      {user ? (
        <Panel title="Cuenta activa">
          <Text style={styles.name}>{user.displayName || user.email}</Text>
          <MutedText>{user.email}{user.phoneNumber ? ` · ${user.phoneNumber}` : ''}</MutedText>
          <MutedText>Permisos: {technicalAdmin ? 'administración técnica autorizada' : role === 'citizen' ? 'ciudadano' : 'operativo autorizado'}.</MutedText>
          <MutedText>Los permisos operativos son asignados por un proceso autorizado en el servidor; no se pueden solicitar desde el perfil.</MutedText>
          <ActionButton label={busy ? 'Cerrando sesión…' : 'Cerrar sesión'} onPress={() => void logout()} disabled={busy} secondary />
        </Panel>
      ) : (
        <Panel title={mode === 'register' ? 'Crear cuenta ciudadana' : mode === 'reset' ? 'Recuperar contraseña' : 'Iniciar sesión'}>
          {!configured ? (
            <Notice error>Firebase no está configurado. Copia mobile/.env.example a mobile/.env y configura el proyecto o sus emuladores.</Notice>
          ) : null}
          {mode === 'register' ? (
            <>
              <Field label="Nombre" value={name} onChangeText={setName} placeholder="Tu nombre" autoCapitalize="words" />
              <Field label="Teléfono de contacto (opcional)" value={phone} onChangeText={setPhone} placeholder="+591…" keyboardType="default" />
            </>
          ) : null}
          <Field label="Correo electrónico" value={email} onChangeText={setEmail} placeholder="nombre@correo.com" keyboardType="email-address" autoCapitalize="none" />
          {mode !== 'reset' ? <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : 'Contraseña'} autoCapitalize="none" /> : null}
          <ActionButton
            label={busy ? 'Procesando…' : mode === 'register' ? 'Crear cuenta' : mode === 'reset' ? 'Enviar enlace de recuperación' : 'Iniciar sesión'}
            onPress={() => void submit()}
            disabled={busy || !configured}
          />
          <View style={styles.modeButtons}>
            {mode !== 'sign_in' ? <ActionButton label="Iniciar sesión" onPress={() => { setMode('sign_in'); setNotice(null); }} secondary /> : null}
            {mode !== 'register' ? <ActionButton label="Crear cuenta ciudadana" onPress={() => { setMode('register'); setNotice(null); }} secondary /> : null}
            {mode !== 'reset' ? <ActionButton label="Olvidé mi contraseña" onPress={() => { setMode('reset'); setNotice(null); }} secondary /> : null}
          </View>
          <MutedText>No se solicita CI, fotografía de carnet, sexo ni fecha de nacimiento.</MutedText>
        </Panel>
      )}
      {notice ? <Notice error={notice.error}>{notice.text}</Notice> : null}
    </WorkspacePage>
  );
}

const styles = StyleSheet.create({
  name: { color: '#172c27', fontSize: 15, fontWeight: '800' },
  modeButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
