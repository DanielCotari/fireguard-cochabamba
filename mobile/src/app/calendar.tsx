import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Badge, Button, Card, EmptyState, MonthScrubber, ReadingNote, SensorLegend, useAtlasTheme } from '@/components/atlas-ui';
import { SensorSeriesChart } from '@/components/series-chart';
import { useSatelliteSelection } from '@/lib/satellite-selection';
import { activityColor, activityInk, activityScale, breakpoints, dimensions, radii, spacing, typography } from '@/theme/tokens';
import { pilotArea, formatPilotExtent } from '@/constants/pilot-area';
import { loadPublishedCalendar, type SatelliteCalendar } from '@/lib/satellite-data-service';
import fireCalendar from '../../public/data/fire-calendar.json';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const FIRMS_URL = 'https://firms.modaps.eosdis.nasa.gov/download/';
const formatNumber = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 });

async function exportMonthlyCsv(data: SatelliteCalendar) {
  const rows = [
    ['year', 'month', 'coverage_status', 'modis_count', 'viirs_count', 'final_value', 'final_source', 'final_kind'],
    ...Array.from({ length: (data.metadata.period.endYear - data.metadata.period.startYear + 1) * 12 }, (_, index) => {
      const year = data.metadata.period.startYear + Math.floor(index / 12);
      const month = (index % 12) + 1;
      const record = data.monthly.find((item) => item.year === year && item.month === month);
      return [
        year,
        month,
        record?.coverage ?? (data.status === 'awaiting_data' ? 'pending' : 'missing'),
        record?.modis_count ?? '',
        record?.viirs_count ?? '',
        record?.final_value ?? '',
        record?.final_source ?? '',
        record?.final_kind ?? '',
      ];
    }),
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  if (Platform.OS !== 'web') {
    await Share.share({ title: 'Calendario satelital FIREGUARD', message: csv });
    return;
  }
  if (!globalThis.document) throw new Error('La descarga CSV no está disponible en este navegador.');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'fireguard-calendario-satelital.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function SectionHeading({ index, title, copy, colors }: { index: string; title: string; copy: string; colors: ReturnType<typeof useAtlasTheme>['colors'] }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={[styles.eyebrow, { color: colors.attention }]}>{index}</Text>
      <Text style={[styles.sectionTitle, { color: colors.ink }]}>{title}</Text>
      <Text style={[styles.sectionCopy, { color: colors.inkMuted }]}>{copy}</Text>
    </View>
  );
}

export default function CalendarScreen() {
  const { width } = useWindowDimensions();
  const compact = width < breakpoints.compact;
  const { colors } = useAtlasTheme();
  const { year: selectedYear, month: selectedMonth, setSelection } = useSatelliteSelection();
  const fallback = fireCalendar as unknown as SatelliteCalendar;
  const [data, setData] = useState<SatelliteCalendar>(fallback);
  const [dataError, setDataError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showHarmonized, setShowHarmonized] = useState(false);
  useEffect(() => {
    let active = true;
    loadPublishedCalendar(fallback).then((published) => {
      if (active) setData(published.calendar);
    }).catch((error: unknown) => {
      if (active) setDataError(error instanceof Error ? error.message : 'No se pudo consultar la publicación satelital.');
    });
    return () => { active = false; };
  }, [fallback]);

  const exportCsv = async () => {
    setExportError(null);
    try {
      await exportMonthlyCsv(data);
    } catch (error: unknown) {
      setExportError(error instanceof Error ? error.message : 'No se pudo exportar el calendario.');
    }
  };

  const startYear = data.metadata.period.startYear;
  const endYear = data.metadata.period.endYear;
  const years = useMemo(
    () => Array.from({ length: Math.max(0, endYear - startYear + 1) }, (_, index) => startYear + index),
    [endYear, startYear],
  );
  const selected = data.monthly.find((item) => item.year === selectedYear && item.month === selectedMonth) ?? null;
  const activityMaximum = useMemo(() => {
    const values = data.monthly.flatMap((item) => (item.final_value != null && item.final_value > 0 ? [item.final_value] : []));
    return values.length ? Math.max(...values) : 0;
  }, [data.monthly]);
  const units = data.metadata.units ?? 'detecciones mensuales equivalentes a MODIS';

  return (
    <ScrollView style={[styles.page, { backgroundColor: colors.canvas }]} contentContainerStyle={styles.pageContent}>
      <View style={[styles.container, compact && styles.containerCompact]}>
        <View style={[styles.topline, compact && styles.toplineCompact]}>
          <View>
            <Text style={[styles.brand, { color: colors.ink }]}>Calendario histórico</Text>
            <Text style={[styles.kicker, { color: colors.inkSubtle }]}>Actividad mensual publicada · no es una predicción</Text>
          </View>
          <Button
            label="Exportar CSV"
            variant="secondary"
            accessibilityLabel="Exportar calendario y estados de cobertura como CSV"
            onPress={() => void exportCsv()}
          />
        </View>

        <View style={[styles.intro, compact && styles.introCompact]}>
          <View style={styles.introCopy}>
            <Badge tone={data.status === 'ready' ? 'calm' : 'attention'}>
              {data.status === 'ready' ? 'SERIE DISPONIBLE' : 'SERIE PENDIENTE'}
            </Badge>
            <Text style={[styles.title, { color: colors.ink }, compact && styles.titleCompact]}>Cobertura mensual del rectángulo piloto</Text>
            <Text style={[styles.lede, { color: colors.inkMuted }]}>
              La escala usa el máximo publicado de la serie para comparar meses. Cero, dato faltante y periodo pendiente se leen con estilos distintos.
            </Text>
          </View>
          <View style={[styles.scopeCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.scopeLabel, { color: colors.inkSubtle }]}>ZONA DE ANÁLISIS</Text>
            <Text style={[styles.scopeName, { color: colors.ink }]}>Rectángulo piloto · Cochabamba</Text>
            <Text style={[styles.coordinates, { color: colors.inkMuted }]}>{formatPilotExtent(data.metadata.bbox ?? pilotArea)}</Text>
            <Text style={[styles.scopeFootnote, { color: colors.inkMuted }]}>No representa límites administrativos oficiales.</Text>
          </View>
        </View>

        {exportError ? <EmptyState variant="noData" title="No se pudo exportar el calendario">{exportError}</EmptyState> : null}
        {dataError ? <EmptyState variant="noData" title="No se pudo actualizar el calendario">{dataError}</EmptyState> : null}
        {data.status === 'awaiting_data' ? (
          <View style={styles.pending}>
            <EmptyState variant="pending" title="2020—2023 · pendiente de descarga y procesamiento">{data.statusMessage}</EmptyState>
            <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(FIRMS_URL); }} style={styles.externalLink}>
              <Text style={[styles.externalLinkText, { color: colors.calm }]}>Consultar NASA FIRMS ↗</Text>
            </Pressable>
          </View>
        ) : null}
        {data.status === 'insufficient' ? (
          <EmptyState variant="pending" title="Conteos observados · cobertura incompleta y armonización pendiente">
            {data.statusMessage} Se muestran detecciones filtradas por sensor; no equivalen a cobertura mensual completa ni se suman entre sensores.
          </EmptyState>
        ) : null}
        <View style={[styles.mainGrid, compact && styles.mainGridCompact]}>
          <View style={styles.primary}>
            <Card>
              <SectionHeading
                index="CALENDARIO"
                title="Meses observados y pendientes"
                copy="Selecciona una celda. El borde discontinuo indica un periodo pendiente o con cobertura incompleta."
                colors={colors}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View style={styles.calendarGrid}>
                  <View style={styles.monthRow}>
                    <Text style={[styles.yearHeader, { color: colors.inkSubtle }]}>AÑO</Text>
                    {MONTHS.map((month) => <Text key={month} style={[styles.monthHeader, { color: colors.inkSubtle }]}>{month}</Text>)}
                  </View>
                  {years.map((year) => (
                    <View key={year} style={styles.monthRow}>
                      <Text style={[styles.yearLabel, { color: colors.ink }]}>{year}</Text>
                      {MONTHS.map((name, index) => {
                        const month = index + 1;
                        const record = data.monthly.find((item) => item.year === year && item.month === month);
                        const pending = !record && data.status === 'awaiting_data';
                        const missing = !pending && record?.final_value == null;
                        const value = record?.final_value;
                        const incomplete = record?.coverage === 'incomplete';
                        const selectedCell = selectedYear === year && selectedMonth === month;
                        const fill = value == null ? colors.surface : activityColor(value, activityMaximum);
                        const ink = value == null ? colors.inkSubtle : activityInk(value, activityMaximum);
                        const accessibleStatus = pending
                          ? 'pendiente de descarga y procesamiento'
                          : missing
                            ? 'sin valor disponible'
                            : `${value === 0 ? 'cero actividad publicada' : `valor reportado ${formatNumber.format(value ?? 0)}`}${incomplete ? ', cobertura incompleta' : ''}`;
                        return (
                          <Pressable
                            key={name}
                            accessibilityRole="button"
                            accessibilityLabel={`${name} ${year}: ${accessibleStatus}`}
                            accessibilityState={{ selected: selectedCell }}
                            onPress={() => setSelection(year, month)}
                            style={({ pressed }) => [
                              styles.monthCell,
                              {
                                backgroundColor: pending ? colors.canvas : missing ? colors.surface : fill,
                                borderColor: selectedCell ? colors.accent : colors.line,
                              },
                              (pending || incomplete) && styles.pendingCell,
                              selectedCell && styles.selectedCell,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={[styles.cellValue, { color: pending || missing ? colors.inkSubtle : ink }]}>
                              {pending ? '··' : missing ? '—' : formatNumber.format(value ?? 0)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
              <View style={[styles.keyRow, { borderTopColor: colors.line }]}>
                <View style={[styles.keySwatch, { backgroundColor: activityScale.zero, borderColor: colors.line }]} />
                <Text style={[styles.keyText, { color: colors.inkMuted }]}>Cero publicado</Text>
                {activityScale.steps.map((swatch) => <View key={swatch} style={[styles.keySwatch, { backgroundColor: swatch, borderColor: swatch }]} />)}
                <Text style={[styles.keyText, { color: colors.inkMuted }]}>
                  {activityMaximum > 0 ? `Escala hasta ${formatNumber.format(activityMaximum)}` : 'Sin valores positivos publicados'}
                </Text>
                <View style={[styles.keyPattern, { borderColor: colors.lineStrong }]} />
                <Text style={[styles.keyText, { color: colors.inkMuted }]}>Pendiente o incompleto</Text>
                <Text style={[styles.keyText, { color: colors.inkSubtle }]}>— Sin valor</Text>
              </View>
            </Card>

            <Card>
              <SectionHeading
                index={`SERIE · ${selectedYear}`}
                title="MODIS, VIIRS y serie armonizada"
                copy="Los conteos originales y el valor publicado se leen solo cuando existen en los resultados. El control no recalcula el factor."
                colors={colors}
              />
              {data.harmonization?.factor != null ? (
                <Button
                  label={showHarmonized ? 'Ocultar efecto de la armonización' : 'Ver efecto de la armonización'}
                  variant={showHarmonized ? 'primary' : 'secondary'}
                  accessibilityLabel="Ver efecto de la armonización"
                  onPress={() => setShowHarmonized((current) => !current)}
                />
              ) : (
                <Text style={[styles.chartFootnote, { color: colors.attention }]}>Armonización pendiente: el factor no está disponible.</Text>
              )}
              <Text style={[styles.chartFootnote, { color: colors.inkMuted }]}>
                Calibración {data.metadata.calibration ? `${data.metadata.calibration.startYear}–${data.metadata.calibration.endYear}` : 'no indicada'}.
                Evaluación {data.metadata.evaluation ? `${data.metadata.evaluation.startYear}–${data.metadata.evaluation.endYear}` : 'no indicada'}.
                Transición {data.metadata.transitionMonth ?? 'no indicada'}.
                Factor {data.harmonization?.factor == null ? 'no calculado' : formatNumber.format(data.harmonization.factor)}.
                {data.evaluation?.after?.mae == null ? ' MAE posterior no publicado.' : ` MAE posterior ${formatNumber.format(data.evaluation.after.mae)}.`}
              </Text>
              <SensorSeriesChart
                year={selectedYear}
                monthly={data.monthly}
                selectedMonth={selectedMonth}
                showHarmonized={showHarmonized}
                transitionMonth={data.metadata.transitionMonth}
                units={units}
                onSelect={(month) => setSelection(selectedYear, month)}
              />
              <SensorLegend />
              <View style={[styles.sensorRowsHeader, { borderBottomColor: colors.line }]}>
                <Text style={[styles.sensorRowMonth, { color: colors.inkSubtle }]}>MES</Text>
                <Text style={[styles.sensorRowValue, { color: colors.modis }]}>MODIS · CONTEO</Text>
                <Text style={[styles.sensorRowValue, { color: colors.viirs }]}>VIIRS · CONTEO</Text>
              </View>
              {MONTHS.map((month, index) => {
                const item = data.monthly.find((record) => record.year === selectedYear && record.month === index + 1);
                return (
                  <Pressable
                    key={month}
                    accessibilityRole="button"
                    accessibilityLabel={`Seleccionar ${month} ${selectedYear}`}
                    onPress={() => setSelection(selectedYear, index + 1)}
                    style={[styles.sensorRow, { borderBottomColor: colors.line }]}
                  >
                    <Text style={[styles.sensorRowMonth, { color: colors.ink }]}>{month}</Text>
                    <Text style={[styles.sensorRowValue, { color: colors.inkMuted }]}>{item?.modis_count == null ? '—' : formatNumber.format(item.modis_count)}</Text>
                    <Text style={[styles.sensorRowValue, { color: colors.inkMuted }]}>{item?.viirs_count == null ? '—' : formatNumber.format(item.viirs_count)}</Text>
                  </Pressable>
                );
              })}
              <Text style={[styles.chartFootnote, { color: colors.inkMuted }]}>— significa que no hay un valor publicado para ese sensor y mes; no equivale a cero.</Text>
            </Card>
          </View>

          <View style={[styles.side, compact && styles.sideCompact]}>
            <Card>
              <Text style={[styles.detailKicker, { color: colors.attention }]}>DETALLE DEL MES</Text>
              <MonthScrubber year={selectedYear} month={selectedMonth} minYear={startYear} maxYear={endYear} onChange={setSelection} />
              <View style={[styles.detailBlock, { borderTopColor: colors.line }]}>
                <Text style={[styles.detailMonth, { color: colors.ink }]}>{MONTHS[selectedMonth - 1]} {selectedYear}</Text>
                {selected?.final_value != null ? (
                  <>
                    <Text style={[styles.detailValue, { color: colors.ink }]}>{formatNumber.format(selected.final_value)}</Text>
                    <Text style={[styles.detailLabel, { color: colors.inkMuted }]}>detecciones mensuales equivalentes a MODIS</Text>
                    <Badge tone="calm">{selected.coverage === 'complete' ? 'COBERTURA COMPLETA' : 'COBERTURA INCOMPLETA'}</Badge>
                  </>
                ) : (
                  <EmptyState
                    variant={data.status === 'awaiting_data' ? 'pending' : 'noData'}
                    title={data.status === 'awaiting_data' ? 'Pendiente de procesamiento' : 'Sin valor publicado'}
                  >
                    {data.status === 'awaiting_data'
                      ? 'Los datos de este mes aún no están disponibles. No se representa como cero.'
                      : selected?.coverage === 'incomplete'
                        ? 'La cobertura es incompleta y no permite concluir que hubo cero actividad.'
                        : 'No hay un valor observado para este mes. La falta de datos no descarta un incendio.'}
                  </EmptyState>
                )}
              </View>
              <View style={styles.detailSensors}>
                <Text style={[styles.detailSensorLine, { color: colors.inkMuted }]}>MODIS original: {selected?.modis_count == null ? 'sin dato' : formatNumber.format(selected.modis_count)}</Text>
                <Text style={[styles.detailSensorLine, { color: colors.inkMuted }]}>VIIRS original: {selected?.viirs_count == null ? 'sin dato' : formatNumber.format(selected.viirs_count)}</Text>
                <Text style={[styles.detailSensorLine, { color: colors.inkMuted }]}>Fuente del valor: {selected?.final_source ?? 'pendiente'}</Text>
              </View>
            </Card>
            <ReadingNote />
            <Card>
              <Text style={[styles.methodTitle, { color: colors.ink }]}>Sobre la comparación</Text>
              <Text style={[styles.methodText, { color: colors.inkMuted }]}>
                La armonización no elimina todas las diferencias entre sensores. Este recorte es un rectángulo piloto de análisis y no representa límites oficiales de Cochabamba.
              </Text>
              <Text style={[styles.methodText, { color: colors.inkMuted }]}>
                No se predice el riesgo de incendio. Un foco satelital no equivale a un incendio independiente ni a superficie quemada.
              </Text>
            </Card>
          </View>
        </View>
        <Text style={[styles.footer, { color: colors.inkSubtle }]}>
          Fuentes solicitadas: MODIS · Terra/Aqua y VIIRS · Suomi-NPP · NASA FIRMS. En móvil se comparte el contenido CSV como texto.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageContent: { paddingBottom: spacing.xxl },
  container: { width: '100%', maxWidth: dimensions.content, alignSelf: 'center', paddingHorizontal: spacing.xl, gap: spacing.lg },
  containerCompact: { paddingHorizontal: spacing.md },
  topline: { minHeight: dimensions.headerHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  toplineCompact: { flexWrap: 'wrap', paddingVertical: spacing.sm },
  brand: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '800', letterSpacing: 1 },
  brandLocation: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '500' },
  kicker: { fontFamily: typography.family.mono, fontSize: typography.size.caption, marginTop: spacing.xxs },
  intro: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg, paddingVertical: spacing.sm },
  introCompact: { minHeight: 0, flexDirection: 'column', alignItems: 'stretch', gap: spacing.lg },
  introCopy: { flex: 1, gap: spacing.md },
  title: { maxWidth: dimensions.calendarTitleWidth, fontFamily: typography.family.sans, fontSize: typography.size.heading, lineHeight: typography.lineHeight.heading, fontWeight: '700' },
  titleCompact: { fontSize: typography.size.heading, lineHeight: typography.lineHeight.heading },
  lede: { maxWidth: dimensions.calendarLedeWidth, fontFamily: typography.family.sans, fontSize: typography.size.body, lineHeight: typography.lineHeight.body },
  scopeCard: { flex: 1, minWidth: dimensions.calendarScopeWidth, padding: spacing.lg, borderWidth: dimensions.hairline, borderRadius: radii.medium, gap: spacing.sm },
  scopeLabel: { fontFamily: typography.family.mono, fontSize: typography.size.caption, letterSpacing: 1 },
  scopeName: { fontFamily: typography.family.sans, fontSize: typography.size.body, fontWeight: '700' },
  coordinates: { fontFamily: typography.family.mono, fontSize: typography.size.caption },
  scopeFootnote: { fontFamily: typography.family.sans, fontSize: typography.size.caption, lineHeight: typography.lineHeight.body },
  pending: { gap: spacing.xs },
  externalLink: { minHeight: dimensions.touchTarget, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: spacing.sm },
  externalLinkText: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '700' },
  mainGrid: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  mainGridCompact: { flexDirection: 'column' },
  primary: { flex: 1.65, minWidth: 0, gap: spacing.lg },
  side: { flex: 1, minWidth: dimensions.sidebar, gap: spacing.lg },
  sideCompact: { width: '100%', minWidth: 0 },
  sectionHeading: { gap: spacing.xs },
  eyebrow: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '700', letterSpacing: 1 },
  sectionTitle: { fontFamily: typography.family.sans, fontSize: typography.size.body, fontWeight: '700' },
  sectionCopy: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
  calendarGrid: { minWidth: dimensions.calendarGridWidth, gap: spacing.xs },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  yearHeader: { width: dimensions.calendarYearCellWidth, fontFamily: typography.family.mono, fontSize: typography.size.caption, textAlign: 'center' },
  monthHeader: { width: dimensions.calendarMonthCellWidth, fontFamily: typography.family.mono, fontSize: typography.size.caption, textAlign: 'center' },
  yearLabel: { width: dimensions.calendarYearCellWidth, fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '700', textAlign: 'center', fontVariant: typography.tabular },
  monthCell: { width: dimensions.calendarMonthCellWidth, minHeight: dimensions.touchTarget, alignItems: 'center', justifyContent: 'center', borderWidth: dimensions.hairline, borderRadius: radii.small },
  pendingCell: { borderStyle: 'dashed' },
  selectedCell: { borderWidth: dimensions.rule },
  cellValue: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontVariant: typography.tabular },
  pressed: { opacity: 0.7 },
  keyRow: { minHeight: dimensions.touchTarget, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, borderTopWidth: dimensions.hairline, paddingTop: spacing.sm },
  keyPattern: { width: spacing.md, height: spacing.md, borderWidth: dimensions.hairline, borderStyle: 'dashed', borderRadius: radii.small },
  keySwatch: { width: spacing.md, height: spacing.md, borderWidth: dimensions.hairline, borderRadius: radii.small },
  keyText: { fontFamily: typography.family.sans, fontSize: typography.size.caption },
  sensorRowsHeader: { minHeight: dimensions.touchTarget, flexDirection: 'row', alignItems: 'center', borderBottomWidth: dimensions.hairline },
  sensorRow: { minHeight: dimensions.touchTarget, flexDirection: 'row', alignItems: 'center', borderBottomWidth: dimensions.hairline },
  sensorRowMonth: { flex: 1, fontFamily: typography.family.mono, fontSize: typography.size.caption },
  sensorRowValue: { flex: 1, fontFamily: typography.family.mono, fontSize: typography.size.caption, textAlign: 'right' },
  chartFootnote: { fontFamily: typography.family.sans, fontSize: typography.size.caption, lineHeight: typography.lineHeight.body, marginTop: spacing.md },
  detailKicker: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '700', letterSpacing: 1 },
  detailBlock: { borderTopWidth: dimensions.hairline, paddingTop: spacing.md, gap: spacing.sm },
  detailMonth: { fontFamily: typography.family.sans, fontSize: typography.size.body, fontWeight: '700' },
  detailValue: { fontFamily: typography.family.mono, fontSize: typography.size.heading, fontWeight: '700', fontVariant: typography.tabular },
  detailLabel: { fontFamily: typography.family.sans, fontSize: typography.size.caption },
  detailSensors: { gap: spacing.xs, paddingTop: spacing.sm },
  detailSensorLine: { fontFamily: typography.family.mono, fontSize: typography.size.caption },
  methodTitle: { fontFamily: typography.family.sans, fontSize: typography.size.body, fontWeight: '700' },
  methodText: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
  footer: { fontFamily: typography.family.mono, fontSize: typography.size.caption, paddingTop: spacing.md },
});
