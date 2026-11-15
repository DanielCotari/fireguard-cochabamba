import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Badge, Button, Card, DetectionMarker, EmptyState, MonthScrubber, ReadingNote, SensorLegend, useAtlasTheme } from '@/components/atlas-ui';
import { DetectionMap } from '@/components/map-surface';
import type { DetectionCollection } from '@/components/detection-map-types';
import { useSatelliteSelection } from '@/lib/satellite-selection';
import { breakpoints, dimensions, radii, spacing, typography } from '@/theme/tokens';
import { pilotArea, formatPilotExtent } from '@/constants/pilot-area';
import fireCalendar from '../../public/data/fire-calendar.json';

type MonthSources = {
  year: number;
  month: number;
  modis_geojson: string | null;
  viirs_geojson: string | null;
};

type FireCalendar = {
  metadata: { period: { startYear: number; endYear: number } };
  monthly: MonthSources[];
};

type Sensor = 'MODIS' | 'VIIRS';
type DetectionFeature = DetectionCollection['features'][number];
function isPilotFeature(feature: DetectionFeature) {
  if (feature.geometry.type !== 'Point') return false;
  const [longitude, latitude] = feature.geometry.coordinates;
  return longitude >= pilotArea.west && longitude <= pilotArea.east &&
    latitude >= pilotArea.south && latitude <= pilotArea.north;
}

async function loadCollection(path: string | null): Promise<DetectionCollection | null> {
  if (!path) return null;
  const response = await fetch(path);
  if (!response.ok) throw new Error(`No se pudo cargar la capa satelital (${response.status}).`);
  const value: unknown = await response.json();
  if (
    typeof value !== 'object' ||
    value === null ||
    !('type' in value) ||
    value.type !== 'FeatureCollection' ||
    !('features' in value) ||
    !Array.isArray(value.features)
  ) {
    throw new Error('El archivo de puntos satelitales no tiene un formato GeoJSON válido.');
  }
  return value as DetectionCollection;
}

function getDate(feature: DetectionFeature) {
  const value = feature.properties.acq_date ?? feature.properties.date;
  return typeof value === 'string' ? value : 'La fecha no está incluida en esta capa.';
}

function formatCoordinate(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(5)}° ${value < 0 ? negative : positive}`;
}

export default function MapScreen() {
  const { width } = useWindowDimensions();
  const compact = width < breakpoints.compact;
  const { colors } = useAtlasTheme();
  const { year, month, setSelection } = useSatelliteSelection();
  const data = fireCalendar as FireCalendar;
  const { startYear, endYear } = data.metadata.period;
  const monthly = data.monthly;
  const [detections, setDetections] = useState<DetectionCollection | null>(null);
  const [selectedDetection, setSelectedDetection] = useState<DetectionFeature | null>(null);
  const [visibleSensors, setVisibleSensors] = useState<Sensor[]>(['MODIS', 'VIIRS']);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const selected = useMemo(
    () => monthly.find((item) => item.year === year && item.month === month) ?? null,
    [month, monthly, year],
  );
  const hasCoverage = selected?.modis_geojson != null || selected?.viirs_geojson != null;

  useEffect(() => {
    let active = true;
    const loadSelectedMonth = async () => {
      setLoading(true);
      setMessage(null);
      setDetections(null);
      setSelectedDetection(null);
      if (!selected) {
        setLoading(false);
        return;
      }
      try {
        const [modis, viirs] = await Promise.all([
          loadCollection(selected.modis_geojson),
          loadCollection(selected.viirs_geojson),
        ]);
        if (!active) return;
        const features = [...(modis?.features ?? []), ...(viirs?.features ?? [])];
        setDetections(features.length ? { type: 'FeatureCollection', features } : null);
      } catch (error: unknown) {
        if (active) setMessage(error instanceof Error ? error.message : 'No se pudieron cargar las detecciones originales.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadSelectedMonth();
    return () => { active = false; };
  }, [selected]);

  const displayedDetections = useMemo(() => {
    if (!detections) return null;
    const features = detections.features.filter((feature) => {
      const sensor = feature.properties.sensor;
      return isPilotFeature(feature) && (sensor === 'MODIS' || sensor === 'VIIRS') && visibleSensors.includes(sensor);
    });
    return features.length ? { type: 'FeatureCollection' as const, features } : null;
  }, [detections, visibleSensors]);

  const toggleSensor = (sensor: Sensor) => {
    setVisibleSensors((current) => current.includes(sensor) ? current.filter((value) => value !== sensor) : [...current, sensor]);
    setSelectedDetection(null);
  };

  return (
    <ScrollView style={[styles.page, { backgroundColor: colors.canvas }]} contentContainerStyle={styles.pageContent}>
      <View style={styles.container}>
        <View style={[styles.header, compact && styles.headerCompact]}>
          <View style={styles.heading}>
            <Text style={[styles.kicker, { color: colors.attention }]}>ATLAS DE CAMPO / 01</Text>
            <Text style={[styles.title, { color: colors.ink }]}>Mapa de observaciones</Text>
            <Text style={[styles.description, { color: colors.inkMuted }]}>
              Capas originales de focos de calor. No equivalen a incendios confirmados ni a una estimación de superficie quemada.
            </Text>
          </View>
          <Badge tone={hasCoverage ? 'calm' : 'attention'}>{hasCoverage ? 'CAPA DISPONIBLE' : 'COBERTURA PENDIENTE'}</Badge>
        </View>

        <View style={[styles.controls, compact && styles.controlsCompact]}>
          <Card style={styles.monthCard}>
            <Text style={[styles.controlLabel, { color: colors.inkSubtle }]}>MES DE OBSERVACIÓN</Text>
            <MonthScrubber year={year} month={month} minYear={startYear} maxYear={endYear} onChange={(nextYear, nextMonth) => { setSelection(nextYear, nextMonth); setSelectedDetection(null); }} />
          </Card>
          <Card style={styles.sensorCard}>
            <Text style={[styles.controlLabel, { color: colors.inkSubtle }]}>CAPAS VISIBLES · TOCA PARA FILTRAR</Text>
            <View style={styles.sensorButtons}>
              {(['MODIS', 'VIIRS'] as const).map((sensor) => {
                const active = visibleSensors.includes(sensor);
                return (
                  <Pressable
                    key={sensor}
                    accessibilityRole="button"
                    accessibilityLabel={`${active ? 'Ocultar' : 'Mostrar'} sensor ${sensor}`}
                    accessibilityState={{ selected: active }}
                    onPress={() => toggleSensor(sensor)}
                    style={({ pressed }) => [styles.sensorToggle, { borderColor: active ? colors.lineStrong : colors.line, backgroundColor: active ? colors.surface : colors.canvas }, pressed && styles.pressed]}
                  >
                    <DetectionMarker sensor={sensor} />
                    <Text style={[styles.toggleState, { color: active ? colors.ink : colors.inkSubtle }]}>{active ? 'Visible' : 'Oculto'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        </View>

        <View style={[styles.mapGrid, compact && styles.mapGridCompact]}>
          <View style={styles.mapColumn}>
            <View style={[styles.mapFrame, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <DetectionMap height={compact ? dimensions.mapHeightCompact : dimensions.mapHeightWide} detections={displayedDetections} onDetectionSelect={setSelectedDetection} />
              <View style={[styles.mapStamp, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}>
                <Text style={[styles.stampText, { color: colors.calm }]}>RECTÁNGULO PILOTO</Text>
                <Text style={[styles.stampCoordinates, { color: colors.inkMuted }]}>{formatPilotExtent()}</Text>
              </View>
            </View>
            <Card>
              <SensorLegend />
              <Text style={[styles.mapCaption, { color: colors.inkMuted }]}>
                El borde señala el rectángulo de análisis piloto de Cochabamba; no representa límites oficiales. La armonización no elimina todas las diferencias entre sensores.
              </Text>
            </Card>
            {message ? <EmptyState variant="noData" title="No se pudo actualizar el mapa">{message}</EmptyState> : null}
            {!message && !loading && !hasCoverage ? (
              <EmptyState variant="pending" title="Este mes está pendiente">
                No hay capas procesadas para {new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))}. La falta de datos no significa cero detecciones ni descarta un incendio.
              </EmptyState>
            ) : null}
            {!message && !loading && hasCoverage && !displayedDetections ? (
              <EmptyState variant="noData" title={detections ? 'Sensores ocultos' : 'Sin puntos para mostrar'}>
                {detections
                  ? 'Activa al menos un sensor para volver a ver sus observaciones.'
                  : 'La capa disponible no contiene puntos en este mes; esto no permite confirmar ni descartar un incendio.'}
              </EmptyState>
            ) : null}
            {loading ? <Text style={[styles.loading, { color: colors.inkMuted }]}>Cargando capas del mes…</Text> : null}
          </View>

          <View style={[styles.detailColumn, compact && styles.detailColumnCompact]}>
            <Card>
              <Text style={[styles.detailKicker, { color: colors.attention }]}>FICHA DE OBSERVACIÓN</Text>
              {selectedDetection ? (
                <>
                  <Text style={[styles.detailTitle, { color: colors.ink }]}>Punto seleccionado</Text>
                  <DetectionMarker sensor={selectedDetection.properties.sensor === 'MODIS' ? 'MODIS' : 'VIIRS'} />
                  <View style={[styles.detailRule, { backgroundColor: colors.line }]} />
                  <Text style={[styles.detailLabel, { color: colors.inkSubtle }]}>FECHA REGISTRADA</Text>
                  <Text style={[styles.detailValue, { color: colors.ink }]}>{getDate(selectedDetection)}</Text>
                  <Text style={[styles.detailLabel, { color: colors.inkSubtle }]}>COORDENADAS</Text>
                  <Text style={[styles.detailValue, { color: colors.ink }]}>
                    {formatCoordinate(selectedDetection.geometry.coordinates[1], 'N', 'S')} · {formatCoordinate(selectedDetection.geometry.coordinates[0], 'E', 'O')}
                  </Text>
                  <Text style={[styles.detailLabel, { color: colors.inkSubtle }]}>PRODUCTO</Text>
                  <Text style={[styles.detailValue, { color: colors.ink }]}>Observación satelital original</Text>
                </>
              ) : (
                <EmptyState variant="noData" title="Sin punto seleccionado">
                  Selecciona un marcador cuando haya una capa disponible. La ficha describe una observación; no confirma un incendio.
                </EmptyState>
              )}
            </Card>
            <ReadingNote />
            <Card>
              <Text style={[styles.methodTitle, { color: colors.ink }]}>Alcance de lectura</Text>
              <Text style={[styles.methodText, { color: colors.inkMuted }]}>
                Este mapa muestra puntos de origen MODIS y VIIRS dentro de un rectángulo piloto. Las escalas de observación y horarios de los sensores difieren.
              </Text>
              <Text style={[styles.methodText, { color: colors.inkMuted }]}>
                Las detecciones requieren evaluación independiente. La ausencia de puntos en la capa tampoco descarta una situación en terreno.
              </Text>
              <Button label="Ver calendario" variant="secondary" onPress={() => router.push('/calendar')} />
            </Card>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageContent: { paddingBottom: spacing.xxl },
  container: { width: '100%', maxWidth: dimensions.wideContent, alignSelf: 'center', paddingHorizontal: spacing.xl, gap: spacing.lg },
  header: { minHeight: dimensions.mapHeaderHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headerCompact: { flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', paddingVertical: spacing.lg },
  heading: { flex: 1, gap: spacing.xs },
  kicker: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '700', letterSpacing: 1 },
  title: { fontFamily: typography.family.editorial, fontSize: typography.size.heading, fontWeight: '400' },
  description: { maxWidth: dimensions.mapDescriptionWidth, fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
  controls: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },
  controlsCompact: { flexDirection: 'column' },
  monthCard: { flex: 1 },
  sensorCard: { flex: 1 },
  controlLabel: { fontFamily: typography.family.mono, fontSize: typography.size.caption, letterSpacing: 1 },
  sensorButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sensorToggle: { minHeight: dimensions.touchTarget, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, borderWidth: dimensions.hairline, borderRadius: radii.small },
  toggleState: { fontFamily: typography.family.sans, fontSize: typography.size.caption },
  pressed: { opacity: 0.7 },
  mapGrid: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  mapGridCompact: { flexDirection: 'column' },
  mapColumn: { flex: 1.8, minWidth: 0, gap: spacing.md },
  detailColumn: { flex: 1, minWidth: dimensions.sidebar, gap: spacing.md },
  detailColumnCompact: { width: '100%', minWidth: 0 },
  mapFrame: { position: 'relative', overflow: 'hidden', borderWidth: dimensions.hairline, borderRadius: radii.medium, padding: spacing.xs },
  mapStamp: { position: 'absolute', top: spacing.md, left: spacing.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: dimensions.hairline, borderRadius: radii.small },
  stampText: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '800', letterSpacing: 1 },
  stampCoordinates: { fontFamily: typography.family.mono, fontSize: typography.size.caption },
  mapCaption: { fontFamily: typography.family.sans, fontSize: typography.size.caption, lineHeight: typography.lineHeight.body },
  loading: { fontFamily: typography.family.sans, fontSize: typography.size.small },
  detailKicker: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '800', letterSpacing: 1 },
  detailTitle: { fontFamily: typography.family.editorial, fontSize: typography.size.subheading },
  detailRule: { height: dimensions.hairline, marginVertical: spacing.xs },
  detailLabel: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '700', letterSpacing: 0.6 },
  detailValue: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
  methodTitle: { fontFamily: typography.family.editorial, fontSize: typography.size.subheading },
  methodText: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
});
