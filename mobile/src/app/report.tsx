import { useRef, useState } from 'react';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAtlasTheme } from '@/components/atlas-ui';
import { DetectionMap } from '@/components/map-surface';
import { ActionButton, Field, MutedText, Notice, Panel, WorkspacePage } from '@/components/workspace-ui';
import { useAuth } from '@/lib/auth-context';
import { dimensions, radii, spacing, typography } from '@/theme/tokens';
import {
  newReportId,
  submitCitizenReport,
  validatePhoto,
  type Coordinate,
} from '@/lib/report-service';

function parseCoordinates(latitude: string, longitude: string): Coordinate | null {
  if (!latitude.trim() || !longitude.trim()) return null;
  const point = { latitude: Number(latitude), longitude: Number(longitude) };
  if (
    !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) ||
    point.latitude < -90 || point.latitude > 90 ||
    point.longitude < -180 || point.longitude > 180
  ) return null;
  return point;
}

function localDateTimeInput() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function ReportScreen() {
  const { user, role, configured } = useAuth();
  const { colors } = useAtlasTheme();
  const reportId = useRef(newReportId());
  const [step, setStep] = useState(0);
  const [description, setDescription] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [observedAt, setObservedAt] = useState(localDateTimeInput);
  const [observerLocation, setObserverLocation] = useState<Coordinate | null>(null);
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [submissionStarted, setSubmissionStarted] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const fireLocation = parseCoordinates(latitude, longitude);
  const canSubmit = Boolean(user && role === 'citizen' && configured && !busy);

  const continueStep = () => {
    let error = '';
    if (step === 0 && (description.trim().length < 10 || description.trim().length > 2000)) {
      error = 'La descripción debe tener entre 10 y 2000 caracteres.';
    } else if (step === 1 && !fireLocation) {
      error = 'Señala en el mapa o ingresa coordenadas válidas del posible incendio.';
    } else if (step === 2 && Number.isNaN(new Date(observedAt).getTime())) {
      error = 'Ingresa una fecha y hora de observación válidas.';
    } else if (step === 3 && !photo) {
      error = 'Adjunta una fotografía JPG, PNG o WebP de hasta 5 MB.';
    }
    if (error) {
      setNotice({ text: error, error: true });
      return;
    }
    setNotice(null);
    setStep((current) => Math.min(current + 1, 3));
  };

  const choosePhoto = async (camera: boolean) => {
    setNotice(null);
    try {
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error('No se recibió una fotografía.');
      validatePhoto(asset);
      setPhoto(asset);
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'No se pudo seleccionar la fotografía.', error: true });
    }
  };

  const requestObserverLocation = async () => {
    setLocationBusy(true);
    setNotice(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('No se otorgó permiso de ubicación. Puedes continuar sin compartirla.');
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setObserverLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'No se pudo obtener la ubicación del observador.', error: true });
    } finally {
      setLocationBusy(false);
    }
  };

  const submit = async () => {
    if (!user || role !== 'citizen') {
      setNotice({ text: 'Inicia sesión con una cuenta ciudadana para enviar un reporte.', error: true });
      return;
    }
    if (!description.trim() || description.trim().length < 10 || description.trim().length > 2000) {
      setNotice({ text: 'La descripción debe tener entre 10 y 2000 caracteres.', error: true });
      return;
    }
    if (!fireLocation) {
      setNotice({ text: 'Señala en el mapa o ingresa coordenadas válidas del posible incendio. No se usará la ubicación de tu teléfono como ubicación del fuego.', error: true });
      return;
    }
    if (!photo) {
      setNotice({ text: 'Adjunta una fotografía JPG, PNG o WebP de hasta 5 MB.', error: true });
      return;
    }
    const observedDate = new Date(observedAt);
    if (Number.isNaN(observedDate.getTime())) {
      setNotice({ text: 'Ingresa una fecha y hora de observación válidas.', error: true });
      return;
    }

    setBusy(true);
    setSubmissionStarted(true);
    setNotice(null);
    try {
      await submitCitizenReport({
        uid: user.uid,
        reportId: reportId.current,
        description,
        fireLocation,
        observerLocation,
        observedAt: observedDate.toISOString(),
        photo,
      });
      setNotice({ text: 'Reporte recibido por el servidor. Puedes consultar su evaluación y actualizaciones en Mis reportes.', error: false });
      reportId.current = newReportId();
      setDescription('');
      setPhoto(null);
      setSubmissionStarted(false);
      setStep(0);
    } catch (error) {
      setNotice({ text: error instanceof Error ? `${error.message} Puedes reintentar sin crear un reporte duplicado.` : 'No se pudo enviar el reporte. Puedes reintentarlo.', error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkspacePage title="Reportar un posible incendio" description="La posición del observador es opcional y distinta de la ubicación aproximada del posible incendio.">
      {!configured ? (
        <Panel title="Servicios de reporte no configurados">
          <Notice error>No se pueden confirmar ni guardar reportes porque Firebase no está configurado.</Notice>
          <ActionButton label="Ir a Perfil" onPress={() => router.push('/profile')} />
        </Panel>
      ) : !user ? (
        <Panel title="Inicia sesión para reportar">
          <MutedText>Los reportes se guardan en la cuenta ciudadana y requieren una conexión con Firebase.</MutedText>
          <ActionButton label="Ir a Perfil" onPress={() => router.push('/profile')} />
        </Panel>
      ) : role !== 'citizen' ? (
        <Panel title="Cuenta no ciudadana">
          <MutedText>Esta cuenta no puede crear reportes ciudadanos. Los permisos operativos no se pueden cambiar desde la aplicación.</MutedText>
        </Panel>
      ) : (
        <>
          <View style={[styles.stepIndicator, { borderColor: colors.line, backgroundColor: colors.surface }]}>
            <Text style={[styles.stepNumber, { color: colors.attention }]}>PASO {step + 1} / 4</Text>
            <Text style={[styles.stepTitle, { color: colors.ink }]}>{['Descripción', 'Ubicación', 'Fecha y hora', 'Fotografía'][step]}</Text>
          </View>
          {step === 0 ? (
            <Panel title="Describe lo observado">
              <Field label="Descripción (10–2000 caracteres)" value={description} onChangeText={setDescription} multiline placeholder="Describe lo observado, referencias y condiciones visibles." disabled={submissionStarted} />
            </Panel>
          ) : null}
          {step === 1 ? (
            <>
              <Panel title="Ubicación aproximada del posible incendio">
                <MutedText>Marca el lugar observado en el mapa o introduce sus coordenadas aproximadas. El marcador del fuego se representa por separado de tu teléfono.</MutedText>
                <DetectionMap height={dimensions.reportMapHeight} detections={null} selectedLocation={fireLocation} onLocationSelect={submissionStarted ? undefined : (point) => { setLatitude(String(point.latitude.toFixed(6))); setLongitude(String(point.longitude.toFixed(6))); }} />
                <View style={styles.coordinateFields}>
                  <View style={styles.coordinateField}><Field label="Latitud del fuego" value={latitude} onChangeText={setLatitude} placeholder="-17.3" keyboardType="decimal-pad" disabled={submissionStarted} /></View>
                  <View style={styles.coordinateField}><Field label="Longitud del fuego" value={longitude} onChangeText={setLongitude} placeholder="-66.1" keyboardType="decimal-pad" disabled={submissionStarted} /></View>
                </View>
                {latitude || longitude ? <MutedText>{fireLocation ? 'Coordenadas del posible incendio válidas.' : 'Las coordenadas ingresadas no son válidas.'}</MutedText> : null}
              </Panel>
              <Panel title="Ubicación del observador (opcional)">
                <MutedText>Solo se comparte si otorgas permiso. No reemplaza ni modifica la ubicación del posible incendio.</MutedText>
                {observerLocation ? (
                  <>
                    <Text style={[styles.locationValue, { color: colors.ink }]}>{observerLocation.latitude.toFixed(5)}, {observerLocation.longitude.toFixed(5)}</Text>
                    <ActionButton label="Quitar ubicación del observador" onPress={() => setObserverLocation(null)} secondary disabled={submissionStarted} />
                  </>
                ) : (
                    <ActionButton label={locationBusy ? 'Solicitando permiso…' : 'Compartir mi ubicación'} onPress={() => void requestObserverLocation()} disabled={locationBusy || submissionStarted} secondary />
                )}
              </Panel>
            </>
          ) : null}
          {step === 2 ? (
            <Panel title="¿Cuándo fue observada la situación?">
              <Field label="Fecha y hora local de observación" value={observedAt} onChangeText={setObservedAt} placeholder="AAAA-MM-DD HH:mm" disabled={submissionStarted} />
            </Panel>
          ) : null}
          {step === 3 ? (
            <Panel title="Adjunta una fotografía">
              <View style={styles.actions}>
                <ActionButton label="Adjuntar fotografía" onPress={() => void choosePhoto(false)} secondary disabled={submissionStarted} />
                <ActionButton label="Tomar fotografía" onPress={() => void choosePhoto(true)} secondary disabled={submissionStarted} />
              </View>
              {photo ? (
                <View style={styles.photoPreview}>
                  <Image source={{ uri: photo.uri }} contentFit="cover" style={[styles.photo, { backgroundColor: colors.canvas }]} />
                  <View style={styles.photoMeta}>
                    <Text style={[styles.photoName, { color: colors.ink }]}>{photo.fileName || 'Fotografía adjunta'}</Text>
                    <MutedText>{photo.mimeType || 'Tipo pendiente de validar'} · {photo.fileSize ? `${(photo.fileSize / 1024 / 1024).toFixed(1)} MB` : 'tamaño verificado al enviar'}</MutedText>
                    <Pressable accessibilityRole="button" accessibilityLabel="Quitar fotografía" disabled={submissionStarted} onPress={() => setPhoto(null)}><Text style={[styles.remove, { color: colors.attention }]}>Quitar fotografía</Text></Pressable>
                  </View>
                </View>
              ) : <MutedText>La fotografía es obligatoria. Máximo 5 MB; JPG, PNG o WebP.</MutedText>}
            </Panel>
          ) : null}
          <View style={styles.actions}>
            {step > 0 ? <ActionButton label="Volver" secondary disabled={submissionStarted} onPress={() => { setNotice(null); setStep((current) => Math.max(current - 1, 0)); }} /> : null}
            {step < 3
              ? <ActionButton label="Continuar" disabled={submissionStarted} onPress={continueStep} />
              : <ActionButton label={busy ? 'Enviando…' : submissionStarted ? 'Reintentar envío' : 'Enviar reporte'} onPress={() => void submit()} disabled={!canSubmit} />}
          </View>
          {submissionStarted ? <MutedText>El contenido se mantiene fijo durante los reintentos para conservar la clave ant duplicados. Si persiste el error, conserva el mensaje y vuelve a intentar con conexión.</MutedText> : null}
        </>
      )}
      {notice ? <Notice error={notice.error}>{notice.text}</Notice> : null}
    </WorkspacePage>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  stepIndicator: { borderWidth: dimensions.hairline, borderRadius: radii.medium, padding: spacing.md, gap: spacing.xxs },
  stepNumber: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '700', letterSpacing: 1 },
  stepTitle: { fontFamily: typography.family.editorial, fontSize: typography.size.subheading },
  photoPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'center' },
  photo: { width: dimensions.photoPreviewSize, height: dimensions.photoPreviewSize, borderRadius: radii.small },
  photoMeta: { flex: 1, gap: spacing.xxs },
  photoName: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '700' },
  remove: { fontFamily: typography.family.sans, fontSize: typography.size.caption, fontWeight: '700', marginTop: spacing.xxs },
  coordinateFields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  coordinateField: { flexGrow: 1, flexBasis: dimensions.coordinateFieldWidth },
  locationValue: { fontFamily: typography.family.mono, fontSize: typography.size.small, fontWeight: '700' },
});
