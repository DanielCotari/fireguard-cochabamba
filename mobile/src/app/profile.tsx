import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Badge, Button, Card, EmptyState, useAtlasTheme } from '@/components/atlas-ui';
import { useAuth, type AppRole } from '@/lib/auth-context';
import { requestPasswordReset, registerCitizen, signIn, signOutCurrentUser } from '@/lib/auth-service';
import { breakpoints, dimensions, radii, spacing, typography } from '@/theme/tokens';

type FormMode = 'sign_in' | 'register' | 'reset';
type AuthPath = '/overview' | '/incidents' | '/admin';
const OPERATIONAL_ROLES: AppRole[] = ['firefighter', 'brigade_leader', 'incident_commander'];

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

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  colors,
  secureTextEntry,
  keyboardType = 'default',
  autoCapitalize = 'none',
  rightAction,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  colors: ReturnType<typeof useAtlasTheme>['colors'];
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'words';
  rightAction?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.ink }]}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel={label}
          autoCapitalize={autoCapitalize}
          autoComplete={keyboardType === 'email-address' ? 'email' : secureTextEntry ? 'password' : 'off'}
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.inkSubtle}
          secureTextEntry={secureTextEntry}
          style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.lineStrong, color: colors.ink }, rightAction && styles.inputWithAction]}
          value={value}
        />
        {rightAction ? (
          <Pressable accessibilityRole="button" onPress={rightAction.onPress} style={styles.inputAction}>
            <Text style={[styles.inputActionText, { color: colors.calm }]}>{rightAction.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ContourPanel({ compact }: { compact: boolean }) {
  const { colors } = useAtlasTheme();
  return (
    <View style={[styles.visualPanel, { backgroundColor: colors.ink }, compact && styles.visualPanelCompact]}>
      <Badge tone="calm">ACCESO POR ROL AUTORIZADO</Badge>
      <Text style={[styles.visualTitle, { color: colors.surface }]}>Información compartida. Responsabilidades claras.</Text>
      <Text style={[styles.visualCopy, { color: colors.inkMuted }]}>
        La cuenta ciudadana permite enviar reportes. Los permisos operativos dependen de autorización externa; no se solicitan desde el perfil.
      </Text>
      <View accessibilityLabel="Motivo topográfico decorativo, sin representar incidentes" style={[styles.visualMap, { backgroundColor: colors.surface }]}>
        <View style={[styles.visualGridHorizontal, { backgroundColor: colors.line }]} />
        <View style={[styles.visualGridVertical, { backgroundColor: colors.line }]} />
        <View style={[styles.visualContour, styles.visualContourOuter, { borderColor: colors.lineStrong }]} />
        <View style={[styles.visualContour, styles.visualContourInner, { borderColor: colors.lineStrong }]} />
        <Text style={[styles.visualCoordinate, { color: colors.inkMuted }]}>17.55°–17.15° S</Text>
        <Text style={[styles.visualMapLabel, { color: colors.inkSubtle }]}>RECTÁNGULO PILOTO · COCHABAMBA</Text>
      </View>
      <Text style={[styles.visualFoot, { color: colors.inkSubtle }]}>Mapa y calendario públicos · Sin datos de muestra</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= breakpoints.desktopNavigation;
  const compact = width < breakpoints.compact;
  const { colors } = useAtlasTheme();
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

  const pageTitle = mode === 'register' ? 'Crear cuenta ciudadana' : mode === 'reset' ? 'Recuperar contraseña' : 'Iniciar sesión';
  const roleLabel = technicalAdmin ? 'Administrador técnico' : role === 'citizen' ? 'Ciudadano' : role === 'visitor' ? 'Visitante' : 'Operador autorizado';

  return (
    <ScrollView style={[styles.page, { backgroundColor: colors.canvas }]} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
      <View style={[styles.topBar, { borderBottomColor: colors.line }, compact && styles.topBarCompact]}>
        <Pressable accessibilityRole="link" accessibilityLabel="Volver a FIREGUARD" onPress={() => router.replace('/')} style={styles.brand}>
          <View style={[styles.brandMark, { backgroundColor: colors.ink }]}><Text style={[styles.brandInitial, { color: colors.surface }]}>F</Text></View>
          <View>
            <Text style={[styles.brandTitle, { color: colors.ink }]}>FIREGUARD</Text>
            <Text style={[styles.brandMeta, { color: colors.inkMuted }]}>COCHABAMBA · BOLIVIA</Text>
          </View>
        </Pressable>
        <Badge tone="calm">ACCESO CIUDADANO Y OPERATIVO</Badge>
      </View>

      <View style={[styles.layout, wide && styles.layoutWide]}>
        <View style={[styles.visualColumn, wide && styles.visualColumnWide]}>
          <ContourPanel compact={!wide} />
        </View>

        <Card style={[styles.formPanel, wide && styles.formPanelWide]}>
          {authLoading && !user ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.attention} />
              <Text style={[styles.body, { color: colors.inkMuted }]}>Comprobando sesión…</Text>
            </View>
          ) : user ? (
            <>
              <Text style={[styles.kicker, { color: colors.attention }]}>TU ESPACIO FIREGUARD</Text>
              <Text style={[styles.formTitle, { color: colors.ink }]}>Cuenta activa</Text>
              <Text style={[styles.body, { color: colors.inkMuted }]}>Accede a las herramientas que corresponden a tus permisos confirmados.</Text>
              <View style={[styles.accountCard, { backgroundColor: colors.canvas, borderColor: colors.line }]}>
                <View style={[styles.accountAvatar, { backgroundColor: colors.calmSoft }]}><Text style={[styles.accountInitial, { color: colors.calm }]}>{(user.displayName || user.email || 'F').slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.accountInfo}>
                  <Text style={[styles.accountName, { color: colors.ink }]}>{user.displayName || user.email}</Text>
                  {user.displayName ? <Text style={[styles.body, { color: colors.inkMuted }]}>{user.email}</Text> : null}
                </View>
              </View>
              <Badge tone="calm">{roleLabel}</Badge>
              <Text style={[styles.body, { color: colors.inkMuted }]}>Los roles operativos se asignan mediante un proceso autorizado y no se pueden autoasignar desde el perfil.</Text>
              <Button label="Ir al inicio" onPress={() => router.replace('/overview')} />
              <Button label={busy ? 'Cerrando sesión…' : 'Cerrar sesión'} variant="secondary" disabled={busy} onPress={() => void logout()} />
            </>
          ) : (
            <>
              <Text style={[styles.kicker, { color: colors.attention }]}>{mode === 'register' ? 'PARTICIPA COMO CIUDADANO' : mode === 'reset' ? 'RECUPERACIÓN SEGURA' : 'ACCESO SEGURO'}</Text>
              <Text style={[styles.formTitle, { color: colors.ink }]}>{pageTitle}</Text>
              <Text style={[styles.body, { color: colors.inkMuted }]}>
                {mode === 'register'
                  ? 'Crea una cuenta para comunicar posibles incendios y consultar tus reportes.'
                  : mode === 'reset'
                    ? 'Te enviaremos instrucciones al correo asociado a tu cuenta.'
                    : 'Ingresa con la cuenta autorizada para acceder a las herramientas FIREGUARD.'}
              </Text>

              {!configured ? (
                <EmptyState variant="noFirebase" title="Servicios de cuenta no configurados">
                  No se pueden confirmar ni guardar reportes. El acceso a autenticación y operaciones requiere Firebase configurado.
                </EmptyState>
              ) : null}

              {mode === 'register' ? (
                <>
                  <Field label="Nombre" value={name} onChangeText={setName} placeholder="Tu nombre" colors={colors} autoCapitalize="words" />
                  <Field label="Teléfono de contacto (opcional)" value={phone} onChangeText={setPhone} placeholder="+591…" colors={colors} keyboardType="phone-pad" autoCapitalize="none" />
                </>
              ) : null}

              <Field label="Correo electrónico" value={email} onChangeText={setEmail} placeholder="nombre@correo.com" colors={colors} keyboardType="email-address" />
              {mode !== 'reset' ? (
                <Field
                  label="Contraseña"
                  value={password}
                  onChangeText={setPassword}
                  placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : 'Tu contraseña'}
                  colors={colors}
                  secureTextEntry={!passwordVisible}
                  rightAction={{ label: passwordVisible ? 'Ocultar' : 'Mostrar', onPress: () => setPasswordVisible((visible) => !visible) }}
                />
              ) : null}

              {mode === 'sign_in' ? (
                <Pressable accessibilityRole="button" onPress={() => setFormMode('reset')} style={styles.link}>
                  <Text style={[styles.linkText, { color: colors.calm }]}>¿Olvidaste tu contraseña?</Text>
                </Pressable>
              ) : null}

              <Button
                label={busy ? 'Procesando…' : mode === 'register' ? 'Crear cuenta ciudadana' : mode === 'reset' ? 'Enviar enlace de recuperación' : 'Iniciar sesión'}
                onPress={() => void submit()}
                disabled={busy || !configured}
              />
              {notice ? (
                <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: notice.error ? colors.attentionSoft : colors.calmSoft }]}>
                  <Text style={[styles.body, { color: notice.error ? colors.attention : colors.calm }]}>{notice.text}</Text>
                </View>
              ) : null}
              {mode === 'sign_in' ? (
                <View style={styles.registerPrompt}>
                  <Text style={[styles.body, { color: colors.inkMuted }]}>¿Aún no tienes cuenta ciudadana?</Text>
                  <Pressable accessibilityRole="button" onPress={() => setFormMode('register')} style={styles.link}>
                    <Text style={[styles.linkText, { color: colors.calm }]}>Crear cuenta</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => setFormMode('sign_in')} style={styles.link}>
                  <Text style={[styles.linkText, { color: colors.calm }]}>← Volver a iniciar sesión</Text>
                </Pressable>
              )}
              <Text style={[styles.privacyNote, { color: colors.inkSubtle }]}>No se solicitan documentos de identidad para crear una cuenta ciudadana.</Text>
            </>
          )}
          {user && notice ? (
            <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: notice.error ? colors.attentionSoft : colors.calmSoft }]}>
              <Text style={[styles.body, { color: notice.error ? colors.attention : colors.calm }]}>{notice.text}</Text>
            </View>
          ) : null}
        </Card>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.privacyNote, { color: colors.inkSubtle }]}>La consulta pública está disponible sin iniciar sesión.</Text>
        <View style={styles.footerLinks}>
          <Pressable accessibilityRole="link" onPress={() => router.push('/map')} style={styles.footerLink}><Text style={[styles.linkText, { color: colors.ink }]}>Mapa</Text></Pressable>
          <Pressable accessibilityRole="link" onPress={() => router.push('/calendar')} style={styles.footerLink}><Text style={[styles.linkText, { color: colors.ink }]}>Calendario</Text></Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageContent: { flexGrow: 1, paddingBottom: spacing.lg },
  topBar: { width: '100%', maxWidth: dimensions.profileContent, minHeight: dimensions.headerHeight, alignSelf: 'center', paddingHorizontal: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderBottomWidth: dimensions.hairline },
  topBarCompact: { paddingHorizontal: spacing.md, flexWrap: 'wrap' },
  brand: { minHeight: dimensions.touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandMark: { width: dimensions.brandMark, height: dimensions.brandMark, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center' },
  brandInitial: { fontFamily: typography.family.editorial, fontSize: typography.size.heading },
  brandTitle: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '800', letterSpacing: 1.2 },
  brandMeta: { fontFamily: typography.family.mono, fontSize: typography.size.caption, marginTop: spacing.xxs },
  layout: { width: '100%', maxWidth: dimensions.profileContent, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, gap: spacing.lg, flexGrow: 1 },
  layoutWide: { flexDirection: 'row', alignItems: 'stretch' },
  visualColumn: { minHeight: dimensions.profileVisualHeight },
  visualColumnWide: { flex: 1, minHeight: dimensions.profileVisualWideHeight },
  visualPanel: { flex: 1, minHeight: dimensions.profileVisualHeight, padding: spacing.lg, borderRadius: radii.large, overflow: 'hidden', justifyContent: 'space-between', gap: spacing.md },
  visualPanelCompact: { minHeight: dimensions.profileVisualCompactHeight },
  visualTitle: { maxWidth: dimensions.profileCopyWidth, fontFamily: typography.family.editorial, fontSize: typography.size.heading, lineHeight: typography.lineHeight.heading, fontWeight: '400' },
  visualCopy: { maxWidth: dimensions.profileCopyWidth, fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
  visualMap: { flex: 1, minHeight: dimensions.profileMapHeight, marginVertical: spacing.md, borderRadius: radii.medium, overflow: 'hidden', position: 'relative' },
  visualGridHorizontal: { position: 'absolute', top: '50%', left: 0, right: 0, height: dimensions.hairline },
  visualGridVertical: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: dimensions.hairline },
  visualContour: { position: 'absolute', borderWidth: dimensions.hairline, borderRadius: radii.pill, transform: [{ rotate: '-24deg' }] },
  visualContourOuter: { width: '90%', height: '85%', top: '8%', left: '4%' },
  visualContourInner: { width: '62%', height: '58%', top: '22%', left: '18%' },
  visualCoordinate: { position: 'absolute', top: spacing.sm, left: spacing.sm, fontFamily: typography.family.mono, fontSize: typography.size.caption },
  visualMapLabel: { position: 'absolute', bottom: spacing.sm, left: spacing.sm, fontFamily: typography.family.mono, fontSize: typography.size.caption, letterSpacing: 0.6 },
  visualFoot: { fontFamily: typography.family.mono, fontSize: typography.size.caption },
  formPanel: { flex: 1, maxWidth: dimensions.profileFormWidth, width: '100%', alignSelf: 'center', gap: spacing.md },
  formPanelWide: { maxWidth: dimensions.profilePanelWidth, alignSelf: 'stretch', justifyContent: 'center', padding: spacing.xl },
  kicker: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '800', letterSpacing: 1.1 },
  formTitle: { fontFamily: typography.family.editorial, fontSize: typography.size.heading, lineHeight: typography.lineHeight.heading, fontWeight: '400' },
  body: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
  field: { gap: spacing.xs },
  fieldLabel: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '700' },
  inputRow: { position: 'relative', justifyContent: 'center' },
  input: { minHeight: dimensions.profileInputHeight, borderWidth: dimensions.hairline, borderRadius: radii.small, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, fontFamily: typography.family.sans, fontSize: typography.size.small },
  inputWithAction: { paddingRight: spacing.xxl },
  inputAction: { position: 'absolute', right: spacing.sm, minHeight: dimensions.touchTarget, justifyContent: 'center', paddingVertical: spacing.xs },
  inputActionText: { fontFamily: typography.family.sans, fontSize: typography.size.caption, fontWeight: '800' },
  link: { minHeight: dimensions.touchTarget, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontFamily: typography.family.sans, fontSize: typography.size.caption, fontWeight: '700' },
  notice: { padding: spacing.sm, borderRadius: radii.small },
  registerPrompt: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  privacyNote: { fontFamily: typography.family.sans, fontSize: typography.size.caption, lineHeight: typography.lineHeight.body },
  loadingState: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.small, borderWidth: dimensions.hairline },
  accountAvatar: { width: dimensions.brandMark, height: dimensions.brandMark, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  accountInitial: { fontFamily: typography.family.sans, fontSize: typography.size.subheading, fontWeight: '800' },
  accountInfo: { flex: 1, gap: spacing.xxs },
  accountName: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '800' },
  footer: { width: '100%', maxWidth: dimensions.profileContent, alignSelf: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  footerLinks: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footerLink: { minWidth: dimensions.touchTarget, minHeight: dimensions.touchTarget, justifyContent: 'center' },
});
