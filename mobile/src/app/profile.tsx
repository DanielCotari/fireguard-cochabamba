import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { ActionButton, Notice } from '@/components/workspace-ui';
import { useAuth, type AppRole } from '@/lib/auth-context';
import { requestPasswordReset, registerCitizen, signIn, signOutCurrentUser } from '@/lib/auth-service';

type FormMode = 'sign_in' | 'register' | 'reset';
type AuthPath = '/overview' | '/incidents' | '/admin';

const OPERATIONAL_ROLES: AppRole[] = ['firefighter', 'brigade_leader', 'incident_commander'];
const COLORS = {
  navy: '#10283b',
  navyDeep: '#0b1c2a',
  red: '#a3312c',
  orange: '#f08c3d',
  green: '#2d8a5a',
  paper: '#f5f7f8',
  white: '#ffffff',
  muted: '#64756e',
  border: '#e0e6e8',
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function messageForAuthError(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return error instanceof Error ? error.message : 'No se pudo completar la operación. Inténtalo nuevamente.';
  }
  const code = error.code;
  if (typeof code !== 'string') return 'No se pudo completar la operación. Inténtalo nuevamente.';
  const messages: Record<string, string> = {
    'auth/invalid-email': 'El correo electrónico no tiene un formato válido.',
    'auth/user-not-found': 'No encontramos una cuenta con ese correo.',
    'auth/wrong-password': 'La contraseña no es correcta.',
    'auth/invalid-credential': 'El correo o la contraseña no son correctos.',
    'auth/too-many-requests': 'Hubo demasiados intentos. Espera un momento y vuelve a intentarlo.',
    'auth/network-request-failed': 'No se pudo conectar con Firebase. Revisa tu conexión.',
    'auth/email-already-in-use': 'Ese correo ya tiene una cuenta. Prueba iniciar sesión.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/operation-not-allowed': 'El inicio de sesión por correo no está habilitado en Firebase.',
  };
  return messages[code] ?? 'No se pudo completar la operación. Inténtalo nuevamente.';
}

function pathForClaims(claims: Record<string, unknown>): AuthPath {
  if (claims.technicalAdmin === true) return '/admin';
  return typeof claims.role === 'string' && OPERATIONAL_ROLES.some((role) => role === claims.role)
    ? '/incidents'
    : '/overview';
}

function AuthBrand() {
  return (
    <View style={styles.brand}>
      <View style={styles.brandMark}><Text style={styles.brandMarkText}>F</Text></View>
      <View>
        <Text style={styles.brandName}>FIREGUARD</Text>
        <Text style={styles.brandLocation}>COCHABAMBA · BOLIVIA</Text>
      </View>
    </View>
  );
}

function AuthField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType = 'default',
  autoCapitalize = 'none',
  editable = true,
  rightAction,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'words';
  editable?: boolean;
  rightAction?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel={label}
          autoCapitalize={autoCapitalize}
          autoComplete={keyboardType === 'email-address' ? 'email' : secureTextEntry ? 'password' : 'off'}
          editable={editable}
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#8b9890"
          secureTextEntry={secureTextEntry}
          style={[styles.input, rightAction && styles.inputWithAction, !editable && styles.inputDisabled]}
          value={value}
        />
        {rightAction ? (
          <Pressable accessibilityRole="button" onPress={rightAction.onPress} style={styles.inputAction}>
            <Text style={styles.inputActionText}>{rightAction.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function AuthButton({
  label,
  onPress,
  disabled,
  loading,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.submitButton,
        secondary && styles.secondaryButton,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      {loading ? <ActivityIndicator color={secondary ? COLORS.navy : COLORS.white} size="small" /> : null}
      <Text style={[styles.submitButtonText, secondary && styles.secondaryButtonText]}>
        {loading ? 'Procesando…' : label}
      </Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const { user, role, technicalAdmin, configured, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<FormMode>('sign_in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  const setFormMode = (next: FormMode) => {
    setMode(next);
    setNotice(null);
    setPassword('');
  };

  const submit = async () => {
    setNotice(null);
    const normalizedEmail = email.trim();
    if (!isValidEmail(normalizedEmail)) {
      setNotice({ text: 'Ingresa un correo electrónico válido.', error: true });
      return;
    }
    if (mode === 'sign_in' && !password) {
      setNotice({ text: 'Ingresa tu contraseña.', error: true });
      return;
    }
    if (mode === 'register') {
      if (!name.trim()) {
        setNotice({ text: 'Ingresa tu nombre para crear la cuenta.', error: true });
        return;
      }
      if (password.length < 6) {
        setNotice({ text: 'La contraseña debe tener al menos 6 caracteres.', error: true });
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'register') {
        await registerCitizen(name, normalizedEmail, password, phone);
        setNotice({ text: 'Cuenta ciudadana creada. Ya puedes enviar reportes.', error: false });
        router.replace('/report');
      } else if (mode === 'sign_in') {
        const credential = await signIn(normalizedEmail, password);
        const token = await credential.user.getIdTokenResult();
        router.replace(pathForClaims(token.claims));
      } else {
        await requestPasswordReset(normalizedEmail);
        setNotice({ text: 'Si el correo está registrado, recibirás instrucciones para recuperar el acceso.', error: false });
      }
    } catch (error) {
      setNotice({ text: messageForAuthError(error), error: true });
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await signOutCurrentUser();
      router.replace('/');
    } catch (error) {
      setNotice({ text: messageForAuthError(error), error: true });
    } finally {
      setBusy(false);
    }
  };

  const pageTitle = mode === 'register'
    ? 'Crear cuenta ciudadana'
    : mode === 'reset'
      ? 'Recuperar contraseña'
      : 'Iniciar sesión';

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
      <View style={styles.topBar}>
        <Pressable accessibilityRole="link" onPress={() => router.replace('/')}><AuthBrand /></Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.replace('/')} style={styles.backLink}>
          <Text style={styles.backLinkText}>← Volver a FIREGUARD</Text>
        </Pressable>
      </View>

      <View style={[styles.layout, wide && styles.layoutWide]}>
        <View style={[styles.visualPanel, wide && styles.visualPanelWide]}>
          <View style={styles.visualContent}>
            <View style={styles.visualBadge}><View style={styles.visualBadgeDot} /><Text style={styles.visualBadgeText}>ACCESO A LA PLATAFORMA</Text></View>
            <Text style={[styles.visualTitle, !wide && styles.visualTitleCompact]}>
              Información que conecta. Equipos que responden.
            </Text>
            <Text style={styles.visualDescription}>
              Ingresa para consultar tus funciones autorizadas y dar seguimiento a reportes e incidentes.
            </Text>
            <View style={styles.visualGraphic} accessibilityLabel="Ilustración conceptual de coordinación y monitoreo">
              <View style={styles.graphicOrbitOuter} />
              <View style={styles.graphicOrbitInner} />
              <View style={styles.graphicCrossHorizontal} />
              <View style={styles.graphicCrossVertical} />
              <View style={styles.graphicCore}><Text style={styles.graphicCoreText}>FG</Text></View>
              <View style={[styles.graphicPoint, styles.graphicPointOne]} />
              <View style={[styles.graphicPoint, styles.graphicPointTwo]} />
              <View style={[styles.graphicPoint, styles.graphicPointThree]} />
            </View>
          </View>
          <View style={styles.visualFoot}>
            <Text style={styles.visualFootText}>El acceso a herramientas operativas depende de los permisos asignados por un proceso autorizado.</Text>
          </View>
        </View>

        <View style={[styles.formPanel, wide && styles.formPanelWide]}>
          {authLoading && !user ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={COLORS.red} />
              <Text style={styles.loadingText}>Comprobando sesión…</Text>
            </View>
          ) : user ? (
            <>
              <Text style={styles.formKicker}>TU ESPACIO FIREGUARD</Text>
              <Text style={styles.formTitle}>Cuenta activa</Text>
              <Text style={styles.formDescription}>Tu navegación y herramientas dependen de los permisos confirmados por Firebase.</Text>
              <View style={styles.accountCard}>
                <View style={styles.accountAvatar}><Text style={styles.accountAvatarText}>{(user.displayName || user.email || 'F').slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.accountInfo}>
                  <Text style={styles.accountName}>{user.displayName || user.email}</Text>
                  {user.displayName ? <Text style={styles.accountEmail}>{user.email}</Text> : null}
                </View>
              </View>
              <View style={styles.permissionNotice}>
                <Text style={styles.permissionTitle}>Permisos de la cuenta</Text>
                <Text style={styles.permissionText}>
                  {technicalAdmin
                    ? 'Administración técnica autorizada.'
                    : role === 'citizen'
                      ? 'Ciudadano.'
                      : 'Operativo autorizado.'}
                </Text>
                <Text style={styles.permissionText}>Los roles operativos se asignan desde un proceso autorizado en el servidor; no se solicitan desde el perfil.</Text>
              </View>
              <ActionButton label="Ir al inicio" onPress={() => router.replace('/overview')} />
              <AuthButton label="Cerrar sesión" onPress={() => void logout()} disabled={busy} loading={busy} secondary />
            </>
          ) : (
            <>
              <Text style={styles.formKicker}>{mode === 'register' ? 'PARTICIPA COMO CIUDADANO' : mode === 'reset' ? 'RECUPERACIÓN SEGURA' : 'ACCESO SEGURO'}</Text>
              <Text style={styles.formTitle}>{pageTitle}</Text>
              <Text style={styles.formDescription}>
                {mode === 'register'
                  ? 'Crea una cuenta para comunicar posibles incendios y consultar tus reportes.'
                  : mode === 'reset'
                    ? 'Te enviaremos instrucciones al correo asociado a tu cuenta.'
                    : 'Ingresa con la cuenta autorizada para acceder a las herramientas FIREGUARD.'}
              </Text>

              {!configured ? (
                <Notice error>Firebase no está configurado. Copia mobile/.env.example a mobile/.env y configura el proyecto o sus emuladores.</Notice>
              ) : null}

              {mode === 'register' ? (
                <>
                  <AuthField label="Nombre" value={name} onChangeText={setName} placeholder="Tu nombre" autoCapitalize="words" editable={!busy} />
                  <AuthField label="Teléfono de contacto (opcional)" value={phone} onChangeText={setPhone} placeholder="+591…" keyboardType="phone-pad" editable={!busy} />
                </>
              ) : null}

              <AuthField
                label="Correo electrónico"
                value={email}
                onChangeText={setEmail}
                placeholder="nombre@correo.com"
                keyboardType="email-address"
                editable={!busy}
              />
              {mode !== 'reset' ? (
                <AuthField
                  label="Contraseña"
                  value={password}
                  onChangeText={setPassword}
                  placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : 'Tu contraseña'}
                  secureTextEntry={!passwordVisible}
                  editable={!busy}
                  rightAction={{
                    label: passwordVisible ? 'Ocultar' : 'Mostrar',
                    onPress: () => setPasswordVisible((visible) => !visible),
                  }}
                />
              ) : null}

              {mode === 'sign_in' ? (
                <Pressable accessibilityRole="button" onPress={() => setFormMode('reset')} style={styles.forgotLink}>
                  <Text style={styles.forgotLinkText}>¿Olvidaste tu contraseña?</Text>
                </Pressable>
              ) : null}

              <AuthButton
                label={mode === 'register' ? 'Crear cuenta ciudadana' : mode === 'reset' ? 'Enviar enlace de recuperación' : 'Iniciar sesión'}
                onPress={() => void submit()}
                disabled={busy || !configured}
                loading={busy}
              />

              {mode === 'sign_in' ? (
                <View style={styles.registerPrompt}>
                  <Text style={styles.registerPromptText}>¿Aún no tienes cuenta ciudadana?</Text>
                  <Pressable accessibilityRole="button" onPress={() => setFormMode('register')}>
                    <Text style={styles.registerLink}>Crear cuenta</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => setFormMode('sign_in')} style={styles.returnLink}>
                  <Text style={styles.returnLinkText}>← Volver a iniciar sesión</Text>
                </Pressable>
              )}

              {notice ? <Notice error={notice.error}>{notice.text}</Notice> : null}
              <Text style={styles.privacyNote}>No se solicitan datos de identificación ni documentos personales para crear una cuenta ciudadana.</Text>
            </>
          )}
          {user && notice ? <Notice error={notice.error}>{notice.text}</Notice> : null}
        </View>
      </View>

      <View style={styles.pageFooter}>
        <Text style={styles.pageFooterText}>FIREGUARD Cochabamba · Consulta pública disponible sin iniciar sesión</Text>
        <View style={styles.pageFooterLinks}>
          <Pressable accessibilityRole="link" onPress={() => router.push('/map')}><Text style={styles.pageFooterLink}>Mapa</Text></Pressable>
          <Text style={styles.footerDivider}>·</Text>
          <Pressable accessibilityRole="link" onPress={() => router.push('/calendar')}><Text style={styles.pageFooterLink}>Calendario</Text></Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.paper },
  pageContent: { flexGrow: 1, paddingBottom: 20 },
  topBar: { width: '100%', maxWidth: 1180, minHeight: 82, alignSelf: 'center', paddingHorizontal: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: COLORS.white, fontSize: 22, fontWeight: '900' },
  brandName: { color: COLORS.navy, fontSize: 14, fontWeight: '900', letterSpacing: 1.2 },
  brandLocation: { color: COLORS.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 3 },
  backLink: { paddingVertical: 10, paddingHorizontal: 6 },
  backLinkText: { color: COLORS.navy, fontSize: 11, fontWeight: '800' },
  layout: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 16, flexGrow: 1 },
  layoutWide: { flexDirection: 'row', alignItems: 'stretch', gap: 22 },
  visualPanel: { minHeight: 330, padding: 24, borderRadius: 14, backgroundColor: COLORS.navy, overflow: 'hidden', justifyContent: 'space-between' },
  visualPanelWide: { flex: 1.05, minHeight: 600, padding: 36 },
  visualContent: { maxWidth: 490 },
  visualBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  visualBadgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.orange },
  visualBadgeText: { color: '#d9a77f', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  visualTitle: { color: COLORS.white, fontSize: 32, lineHeight: 38, fontWeight: '800', maxWidth: 440 },
  visualTitleCompact: { fontSize: 26, lineHeight: 32 },
  visualDescription: { color: '#b6c6ce', fontSize: 12, lineHeight: 20, marginTop: 12, maxWidth: 420 },
  visualGraphic: { height: 205, marginTop: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  graphicOrbitOuter: { position: 'absolute', width: 190, height: 190, borderRadius: 100, borderWidth: 1, borderColor: '#3e596b' },
  graphicOrbitInner: { position: 'absolute', width: 112, height: 112, borderRadius: 60, borderWidth: 1, borderColor: '#3e596b' },
  graphicCrossHorizontal: { position: 'absolute', left: 40, right: 40, height: 1, backgroundColor: '#304c5d' },
  graphicCrossVertical: { position: 'absolute', top: 10, bottom: 10, width: 1, backgroundColor: '#304c5d' },
  graphicCore: { width: 42, height: 42, borderRadius: 22, borderWidth: 5, borderColor: '#e8a180', backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center' },
  graphicCoreText: { color: COLORS.white, fontSize: 9, fontWeight: '900' },
  graphicPoint: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.orange },
  graphicPointOne: { top: 36, right: '32%' },
  graphicPointTwo: { left: '29%', bottom: 42, backgroundColor: '#65b4ce' },
  graphicPointThree: { right: '28%', bottom: 56, backgroundColor: '#d35b42' },
  visualFoot: { borderTopWidth: 1, borderTopColor: '#2c4556', paddingTop: 13, marginTop: 12 },
  visualFootText: { color: '#8fa3ad', fontSize: 10, lineHeight: 16 },
  formPanel: { flex: 1, maxWidth: 540, width: '100%', alignSelf: 'center', padding: 24, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, gap: 15 },
  formPanelWide: { alignSelf: 'stretch', padding: 38, justifyContent: 'center' },
  formKicker: { color: COLORS.red, fontSize: 9, fontWeight: '900', letterSpacing: 1.3, marginBottom: -8 },
  formTitle: { color: COLORS.navy, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  formDescription: { color: COLORS.muted, fontSize: 12, lineHeight: 19, marginTop: -7, marginBottom: 2 },
  field: { gap: 6 },
  fieldLabel: { color: COLORS.navy, fontSize: 11, fontWeight: '800' },
  inputRow: { position: 'relative', justifyContent: 'center' },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#d6dfe2', borderRadius: 7, paddingHorizontal: 13, paddingVertical: 10, color: COLORS.navy, backgroundColor: COLORS.white, fontSize: 13 },
  inputWithAction: { paddingRight: 76 },
  inputDisabled: { opacity: 0.6 },
  inputAction: { position: 'absolute', right: 11, paddingVertical: 8 },
  inputActionText: { color: COLORS.red, fontSize: 10, fontWeight: '800' },
  forgotLink: { alignSelf: 'flex-end', paddingVertical: 2 },
  forgotLinkText: { color: COLORS.red, fontSize: 10, fontWeight: '800' },
  submitButton: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 7, backgroundColor: COLORS.red, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  submitButtonText: { color: COLORS.white, fontSize: 12, fontWeight: '900' },
  secondaryButton: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#f7f9fa' },
  secondaryButtonText: { color: COLORS.navy },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.78 },
  registerPrompt: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 5, paddingTop: 4 },
  registerPromptText: { color: COLORS.muted, fontSize: 10 },
  registerLink: { color: COLORS.red, fontSize: 10, fontWeight: '900' },
  returnLink: { alignSelf: 'center', paddingVertical: 4 },
  returnLinkText: { color: COLORS.red, fontSize: 10, fontWeight: '800' },
  privacyNote: { color: '#89969b', fontSize: 9, lineHeight: 15, textAlign: 'center', marginTop: 2 },
  loadingState: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 30 },
  loadingText: { color: COLORS.muted, fontSize: 12 },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 9, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fbfcfc' },
  accountAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f9e9e7', alignItems: 'center', justifyContent: 'center' },
  accountAvatarText: { color: COLORS.red, fontSize: 16, fontWeight: '900' },
  accountInfo: { flex: 1, gap: 3 },
  accountName: { color: COLORS.navy, fontSize: 12, fontWeight: '800' },
  accountEmail: { color: COLORS.muted, fontSize: 10 },
  permissionNotice: { padding: 13, backgroundColor: '#f3f7f5', borderRadius: 8, gap: 6 },
  permissionTitle: { color: COLORS.navy, fontSize: 11, fontWeight: '800' },
  permissionText: { color: COLORS.muted, fontSize: 10, lineHeight: 16 },
  pageFooter: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 26, paddingVertical: 14, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  pageFooterText: { color: '#89969b', fontSize: 9 },
  pageFooterLinks: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  pageFooterLink: { color: COLORS.navy, fontSize: 9, fontWeight: '800' },
  footerDivider: { color: '#9eaaae', fontSize: 10 },
});
