import { useRef, useState } from 'react';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DetectionMap } from '@/components/map-surface';
import { ActionButton, Field, MutedText, Notice, Panel, WorkspacePage } from '@/components/workspace-ui';
import { useAuth } from '@/lib/auth-context';
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
  const reportId = useRef(newReportId());
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
    } catch (error) {
      setNotice({ text: error instanceof Error ? `${error.message} Puedes reintentar sin crear un reporte duplicado.` : 'No se pudo enviar el reporte. Puedes reintentarlo.', error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkspacePage title="Reportar un posible incendio" description="La posición del observador es opcional y distinta de la ubicación aproximada del posible incendio.">
      {!user ? (
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
          {!configured ? <Notice error>Firebase no está configurado. El reporte no se guardará ni se confirmará.</Notice> : null}
          <Panel title="Detalles del reporte">
            <Field label="Descripción (10–2000 caracteres)" value={description} onChangeText={setDescription} multiline placeholder="Describe lo observado, referencias y condiciones visibles." disabled={submissionStarted} />
            <Field label="Fecha y hora local de observación" value={observedAt} onChangeText={setObservedAt} placeholder="AAAA-MM-DD HH:mm" disabled={submissionStarted} />
            <View style={styles.actions}>
              <ActionButton label="Adjuntar fotografía" onPress={() => void choosePhoto(false)} secondary disabled={submissionStarted} />
              <ActionButton label="Tomar fotografía" onPress={() => void choosePhoto(true)} secondary disabled={submissionStarted} />
            </View>
            {photo ? (
              <View style={styles.photoPreview}>
                <Image source={{ uri: photo.uri }} contentFit="cover" style={styles.photo} />
                <View style={styles.photoMeta}>
                  <Text style={styles.photoName}>{photo.fileName || 'Fotografía adjunta'}</Text>
                  <MutedText>{photo.mimeType || 'Tipo pendiente de validar'} · {photo.fileSize ? `${(photo.fileSize / 1024 / 1024).toFixed(1)} MB` : 'tamaño verificado al enviar'}</MutedText>
                  <Pressable disabled={submissionStarted} onPress={() => setPhoto(null)}><Text style={styles.remove}>Quitar fotografía</Text></Pressable>
                </View>
              </View>
            ) : <MutedText>La fotografía es obligatoria. Máximo 5 MB; JPG, PNG o WebP.</MutedText>}
          </Panel>
          <Panel title="Ubicación aproximada del posible incendio">
            <MutedText>Marca el lugar observado en el mapa o introduce sus coordenadas aproximadas. El marcador del fuego se representa por separado de tu teléfono.</MutedText>
            <DetectionMap height={300} detections={null} selectedLocation={fireLocation} onLocationSelect={submissionStarted ? undefined : (point) => { setLatitude(String(point.latitude.toFixed(6))); setLongitude(String(point.longitude.toFixed(6))); }} />
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
                <Text style={styles.locationValue}>{observerLocation.latitude.toFixed(5)}, {observerLocation.longitude.toFixed(5)}</Text>
                <ActionButton label="Quitar ubicación del observador" onPress={() => setObserverLocation(null)} secondary disabled={submissionStarted} />
              </>
            ) : (
                <ActionButton label={locationBusy ? 'Solicitando permiso…' : 'Compartir mi ubicación'} onPress={() => void requestObserverLocation()} disabled={locationBusy || submissionStarted} secondary />
            )}
          </Panel>
          <ActionButton label={busy ? 'Enviando…' : submissionStarted ? 'Reintentar envío' : 'Enviar reporte'} onPress={() => void submit()} disabled={!canSubmit} />
          {submissionStarted ? <MutedText>El contenido se mantiene fijo durante los reintentos para conservar la clave ant duplicados. Si persiste el error, conserva el mensaje y vuelve a intentar con conexión.</MutedText> : null}
        </>
      )}
      {notice ? <Notice error={notice.error}>{notice.text}</Notice> : null}
    </WorkspacePage>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoPreview: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  photo: { width: 82, height: 82, borderRadius: 9, backgroundColor: '#e8eee8' },
  photoMeta: { flex: 1, gap: 4 },
  photoName: { color: '#172c27', fontSize: 12, fontWeight: '700' },
  remove: { color: '#8b342c', fontSize: 11, fontWeight: '700', marginTop: 4 },
  coordinateFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  coordinateField: { flexGrow: 1, flexBasis: 180 },
  locationValue: { color: '#172c27', fontSize: 12, fontWeight: '700' },
});
