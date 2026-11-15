import { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Badge, Button, Card, EmptyState, MonthScrubber, ReadingNote, SensorLegend, useAtlasTheme } from '@/components/atlas-ui';
import { useSatelliteSelection } from '@/lib/satellite-selection';
import { breakpoints, dimensions, radii, spacing, typography } from '@/theme/tokens';
import { pilotArea, formatPilotExtent } from '@/constants/pilot-area';
import fireCalendar from '../../public/data/fire-calendar.json';

type FireMonth = {
  year: number;
  month: number;
  modis_count: number | null;
  viirs_count: number | null;
  final_value: number | null;
  final_source: string | null;
  final_kind: string | null;
  coverage: 'complete' | 'incomplete' | 'missing';
};

type FireData = {
  status: 'awaiting_data' | 'ready' | 'insufficient';
  statusMessage: string;
  metadata: {
    period: { startYear: number; endYear: number };
    bbox: { west: number; south: number; east: number; north: number };
    areaName: string;
    sources: { sensor: string; product: string; satellites: string }[];
  };
  monthly: FireMonth[];
};

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const FIRMS_URL = 'https://firms.modaps.eosdis.nasa.gov/download/';
const formatNumber = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 });

async function exportMonthlyCsv(data: FireData) {
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
  const data = fireCalendar as FireData;
  const [exportError, setExportError] = useState<string | null>(null);

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

  return (
    <ScrollView style={[styles.page, { backgroundColor: colors.canvas }]} contentContainerStyle={styles.pageContent}>
      <View style={[styles.container, compact && styles.containerCompact]}>
        <View style={[styles.topline, compact && styles.toplineCompact]}>
          <View>
            <Text style={[styles.brand, { color: colors.ink }]}>FIREGUARD <Text style={[styles.brandLocation, { color: colors.inkMuted }]}>/ COCHABAMBA</Text></Text>
            <Text style={[styles.kicker, { color: colors.inkSubtle }]}>CUADERNO DE OBSERVACIÓN · 02</Text>
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
            <Text style={[styles.title, { color: colors.ink }, compact && styles.titleCompact]}>El año también se lee mes a mes.</Text>
            <Text style={[styles.lede, { color: colors.inkMuted }]}>
              Compara las observaciones reportadas por MODIS y VIIRS. Los espacios sin cobertura son estados pendientes o faltantes, nunca ceros implícitos.
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
        {data.status === 'awaiting_data' ? (
          <View style={styles.pending}>
            <EmptyState variant="pending" title="2020—2023 · pendiente de descarga y procesamiento">{data.statusMessage}</EmptyState>
            <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(FIRMS_URL); }} style={styles.externalLink}>
              <Text style={[styles.externalLinkText, { color: colors.calm }]}>Consultar NASA FIRMS ↗</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={[styles.mainGrid, compact && styles.mainGridCompact]}>
          <View style={styles.primary}>
            <Card>
              <SectionHeading
                index="01 / CALENDARIO HISTÓRICO"
                title="Meses observados y pendientes"
                copy="Selecciona una celda para consultar el detalle. El patrón punteado indica que el periodo aún no está procesado."
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
                        const selectedCell = selectedYear === year && selectedMonth === month;
                        const accessibleStatus = pending ? 'pendiente de descarga y procesamiento' : record?.final_value == null ? 'sin valor disponible' : `valor reportado ${formatNumber.format(record.final_value)}`;
                        return (
                          <Pressable
                            key={name}
                            accessibilityRole="button"
                            accessibilityLabel={`${name} ${year}: ${accessibleStatus}`}
                            accessibilityState={{ selected: selectedCell }}
                            onPress={() => setSelection(year, month)}
                            style={({ pressed }) => [
                              styles.monthCell,
                              { backgroundColor: pending ? colors.canvas : record?.final_value == null ? colors.surface : colors.calmSoft, borderColor: selectedCell ? colors.attention : colors.line },
                              pending && styles.pendingCell,
                              selectedCell && styles.selectedCell,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={[styles.cellValue, { color: pending ? colors.inkSubtle : colors.inkMuted }]}>
                              {pending ? '··' : record?.final_value == null ? '—' : formatNumber.format(record.final_value)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
              <View style={[styles.keyRow, { borderTopColor: colors.line }]}>
                <View style={[styles.keyPattern, { borderColor: colors.lineStrong }]} />
                <Text style={[styles.keyText, { color: colors.inkMuted }]}>Pendiente</Text>
                <View style={[styles.keyAvailable, { backgroundColor: colors.calmSoft, borderColor: colors.line }]} />
                <Text style={[styles.keyText, { color: colors.inkMuted }]}>Valor observado</Text>
                <Text style={[styles.keyText, { color: colors.inkSubtle }]}>— Sin valor reportado</Text>
              </View>
            </Card>

            <Card>
              <SectionHeading
                index={`02 / COMPARACIÓN · ${selectedYear}`}
                title="Dos registros, lado a lado."
                copy="Los valores se muestran solo si están disponibles en los resultados procesados."
                colors={colors}
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
  intro: { minHeight: dimensions.calendarIntroHeight, flexDirection: 'row', alignItems: 'center', gap: spacing.xxl, paddingVertical: spacing.xl },
  introCompact: { minHeight: 0, flexDirection: 'column', alignItems: 'stretch', gap: spacing.lg },
  introCopy: { flex: 1, gap: spacing.md },
  title: { maxWidth: dimensions.calendarTitleWidth, fontFamily: typography.family.editorial, fontSize: typography.size.display, lineHeight: typography.lineHeight.display, fontWeight: '400' },
  titleCompact: { fontSize: typography.size.heading, lineHeight: typography.lineHeight.heading },
  lede: { maxWidth: dimensions.calendarLedeWidth, fontFamily: typography.family.sans, fontSize: typography.size.body, lineHeight: typography.lineHeight.body },
  scopeCard: { flex: 1, minWidth: dimensions.calendarScopeWidth, padding: spacing.lg, borderWidth: dimensions.hairline, borderRadius: radii.medium, gap: spacing.sm },
  scopeLabel: { fontFamily: typography.family.mono, fontSize: typography.size.caption, letterSpacing: 1 },
  scopeName: { fontFamily: typography.family.editorial, fontSize: typography.size.subheading },
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
  sectionTitle: { fontFamily: typography.family.editorial, fontSize: typography.size.subheading, fontWeight: '400' },
  sectionCopy: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
  calendarGrid: { minWidth: dimensions.calendarGridWidth, gap: spacing.xs },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  yearHeader: { width: dimensions.calendarYearCellWidth, fontFamily: typography.family.mono, fontSize: typography.size.caption, textAlign: 'center' },
  monthHeader: { width: dimensions.calendarMonthCellWidth, fontFamily: typography.family.mono, fontSize: typography.size.caption, textAlign: 'center' },
  yearLabel: { width: dimensions.calendarYearCellWidth, fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '700', textAlign: 'center' },
  monthCell: { width: dimensions.calendarMonthCellWidth, minHeight: dimensions.touchTarget, alignItems: 'center', justifyContent: 'center', borderWidth: dimensions.hairline, borderRadius: radii.small },
  pendingCell: { borderStyle: 'dashed' },
  selectedCell: { borderWidth: dimensions.rule },
  cellValue: { fontFamily: typography.family.mono, fontSize: typography.size.caption },
  pressed: { opacity: 0.7 },
  keyRow: { minHeight: dimensions.touchTarget, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, borderTopWidth: dimensions.hairline, paddingTop: spacing.sm },
  keyPattern: { width: spacing.md, height: spacing.md, borderWidth: dimensions.hairline, borderStyle: 'dashed', borderRadius: radii.small },
  keyAvailable: { width: spacing.md, height: spacing.md, borderWidth: dimensions.hairline, borderRadius: radii.small, marginLeft: spacing.sm },
  keyText: { fontFamily: typography.family.sans, fontSize: typography.size.caption },
  sensorRowsHeader: { minHeight: dimensions.touchTarget, flexDirection: 'row', alignItems: 'center', borderBottomWidth: dimensions.hairline },
  sensorRow: { minHeight: dimensions.touchTarget, flexDirection: 'row', alignItems: 'center', borderBottomWidth: dimensions.hairline },
  sensorRowMonth: { flex: 1, fontFamily: typography.family.mono, fontSize: typography.size.caption },
  sensorRowValue: { flex: 1, fontFamily: typography.family.mono, fontSize: typography.size.caption, textAlign: 'right' },
  chartFootnote: { fontFamily: typography.family.sans, fontSize: typography.size.caption, lineHeight: typography.lineHeight.body, marginTop: spacing.md },
  detailKicker: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '700', letterSpacing: 1 },
  detailBlock: { borderTopWidth: dimensions.hairline, paddingTop: spacing.md, gap: spacing.sm },
  detailMonth: { fontFamily: typography.family.editorial, fontSize: typography.size.subheading },
  detailValue: { fontFamily: typography.family.mono, fontSize: typography.size.heading, fontWeight: '700' },
  detailLabel: { fontFamily: typography.family.sans, fontSize: typography.size.caption },
  detailSensors: { gap: spacing.xs, paddingTop: spacing.sm },
  detailSensorLine: { fontFamily: typography.family.mono, fontSize: typography.size.caption },
  methodTitle: { fontFamily: typography.family.editorial, fontSize: typography.size.subheading },
  methodText: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
  footer: { fontFamily: typography.family.mono, fontSize: typography.size.caption, paddingTop: spacing.md },
});
