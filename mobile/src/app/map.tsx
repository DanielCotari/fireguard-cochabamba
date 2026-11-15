import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DetectionMap } from '@/components/map-surface';
import type { DetectionCollection } from '@/components/detection-map-types';
import { ActionButton, MutedText, Panel, WorkspacePage } from '@/components/workspace-ui';
import { useSatelliteSelection } from '@/lib/satellite-selection';

type MonthSources = {
  year: number;
  month: number;
  modis_geojson: string | null;
  viirs_geojson: string | null;
};

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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

export default function MapScreen() {
  const { year, month, setSelection } = useSatelliteSelection();
  const [monthly, setMonthly] = useState<MonthSources[]>([]);
  const [detections, setDetections] = useState<DetectionCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/data/fire-calendar.json')
      .then(async (response) => {
        if (!response.ok) throw new Error(`No se pudo consultar la cobertura satelital (${response.status}).`);
        const data = await response.json() as { monthly?: MonthSources[] };
        if (!Array.isArray(data.monthly)) throw new Error('El calendario satelital no contiene meses válidos.');
        if (active) setMonthly(data.monthly);
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : 'No se pudo consultar el calendario satelital.');
      });
    return () => { active = false; };
  }, []);

  const selected = useMemo(
    () => monthly.find((item) => item.year === year && item.month === month) ?? null,
    [month, monthly, year],
  );

  useEffect(() => {
    let active = true;
    const loadSelectedMonth = async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true);
      setMessage(null);
      setDetections(null);
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

  const changeMonth = (delta: number) => {
    const index = year * 12 + month - 1 + delta;
    setSelection(Math.floor(index / 12), (index % 12) + 1);
  };
  const available = selected?.modis_geojson != null || selected?.viirs_geojson != null;

  return (
    <WorkspacePage
      title="Mapa de detecciones"
      description="Puntos geográficos originales MODIS y VIIRS del mes seleccionado. Los valores armonizados agregados nunca se convierten en puntos."
    >
      <Panel title="Mes seleccionado">
        <View style={styles.controls}>
          <ActionButton label="Mes anterior" secondary onPress={() => changeMonth(-1)} />
          <Text style={styles.selected}>{MONTH_LABELS[month - 1]} {year}</Text>
          <ActionButton label="Mes siguiente" secondary onPress={() => changeMonth(1)} />
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#f08c3d' }]} /><Text style={styles.legendText}>MODIS original</Text></View>
          <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#4795b8' }]} /><Text style={styles.legendText}>VIIRS original</Text></View>
        </View>
        <MutedText>La selección del mes se comparte con el calendario. La consulta descarga únicamente las capas originales de ese mes.</MutedText>
      </Panel>
      <DetectionMap height={480} detections={detections} />
      {message ? <Panel title="No se pudo actualizar el mapa"><Text style={styles.error}>{message}</Text></Panel> : null}
      {!message && !loading && !available ? (
        <Panel title="Datos satelitales pendientes">
          <MutedText>No existe cobertura mensual confirmada para mostrar puntos. La falta de datos no indica que no haya ocurrido un incendio.</MutedText>
        </Panel>
      ) : null}
      {!message && !loading && available && !detections ? (
        <Panel title="Sin detecciones originales para mostrar">
          <MutedText>La cobertura de al menos un sensor está completa, pero no hay detecciones que dibujar en este mes. Los datos faltantes de otros sensores no se interpretan como cero.</MutedText>
        </Panel>
      ) : null}
      {loading ? <Text style={styles.loading}>Cargando capas del mes…</Text> : null}
    </WorkspacePage>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  selected: { color: '#172c27', fontSize: 16, fontWeight: '800' },
  legend: { flexDirection: 'row', gap: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendText: { color: '#52665a', fontSize: 11 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  error: { color: '#8b342c', fontSize: 12 },
  loading: { color: '#64756e', fontSize: 12 },
});
