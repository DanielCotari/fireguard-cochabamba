import { useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSatelliteSelection } from '@/lib/satellite-selection';

type FireMonth = {
  year: number;
  month: number;
  modis_count: number | null;
  viirs_count: number | null;
  viirs_adjusted: number | null;
  final_value: number | null;
  final_source: 'MODIS' | 'VIIRS ajustado' | null;
  final_kind: 'observado' | 'estimado' | null;
  coverage: 'complete' | 'incomplete' | 'missing';
  reference_median: number | null;
  reference_years: number;
  reference_delta: number | null;
  frp_modis_sum: number | null;
  frp_viirs_sum: number | null;
};

type Metric = { mae: number | null; bias: number | null };

type FireData = {
  schemaVersion: number;
  status: 'awaiting_data' | 'ready' | 'insufficient';
  statusMessage: string;
  metadata: {
    areaName: string;
    bbox: { west: number; south: number; east: number; north: number };
    period: { startYear: number; endYear: number };
    calibration: { startYear: number; endYear: number };
    evaluation: { startYear: number; endYear: number };
    transitionMonth: string;
    units: string;
    referenceMinimumYears: number;
    sources: {
      sensor: string;
      product: string;
      version: string;
      satellites: string;
      url: string;
    }[];
  };
  harmonization: { factor: number | null; calibrationMonths: number };
  evaluation: {
    sampleCount: number;
    minimumSamples: number;
    before: Metric;
    after: Metric;
    quarterly: { quarter: string; beforeMae: number | null; afterMae: number | null; samples: number }[];
  };
  monthly: FireMonth[];
};

const EMPTY_MONTHS: FireMonth[] = [];
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const COLORS = {
  ink: '#172c27',
  muted: '#64756e',
  forest: '#144b3a',
  green: '#2d8a5a',
  lightGreen: '#eaf4ed',
  orange: '#f08c3d',
  blue: '#4795b8',
  border: '#e2e9e4',
  paper: '#f4f7f4',
  white: '#ffffff',
  missing: '#edf0ed',
};

const numberFormat = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 });
const sourceUrl = 'https://firms.modaps.eosdis.nasa.gov/download/';

function formatNumber(value: number | null | undefined) {
  return value == null ? '—' : numberFormat.format(value);
}

function openUrl(url: string) {
  void Linking.openURL(url);
}

function exportMonthlyCsv(monthly: FireMonth[]) {
  if (Platform.OS !== 'web' || !globalThis.document) return;
  const rows = [
    ['year', 'month', 'coverage', 'modis_count', 'viirs_count', 'viirs_adjusted', 'final_value', 'final_source', 'final_kind', 'frp_modis_sum_mw', 'frp_viirs_sum_mw'],
    ...monthly.map((item) => [
      item.year,
      item.month,
      item.coverage,
      item.modis_count ?? '',
      item.viirs_count ?? '',
      item.viirs_adjusted ?? '',
      item.final_value ?? '',
      item.final_source ?? '',
      item.final_kind ?? '',
      item.frp_modis_sum ?? '',
      item.frp_viirs_sum ?? '',
    ]),
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'fireguard-calendario-satelital.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function SectionTitle({ eyebrow, title, caption }: { eyebrow: string; title: string; caption?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionHeading}>{title}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

export default function CalendarScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 800;
  const [data, setData] = useState<FireData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [startYear, setStartYear] = useState(2020);
  const [endYear, setEndYear] = useState(2023);
  const { year: selectedYear, month: selectedMonth, setSelection } = useSatelliteSelection();
  const [chartMode, setChartMode] = useState<'original' | 'harmonized'>('original');

  useEffect(() => {
    let active = true;
    fetch('/data/fire-calendar.json')
      .then((response) => {
        if (!response.ok) throw new Error(`No se pudo leer el archivo de resultados (${response.status}).`);
        return response.json() as Promise<FireData>;
      })
      .then((result) => {
        if (!active) return;
        setData(result);
        setStartYear(result.metadata.period.startYear);
        setEndYear(result.metadata.period.endYear);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Error desconocido al cargar los resultados.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const monthly = data?.monthly ?? EMPTY_MONTHS;
  const selected = monthly.find((item) => item.year === selectedYear && item.month === selectedMonth) ?? null;
  const selectedYearData = useMemo(
    () => monthly.filter((item) => item.year === selectedYear).sort((a, b) => a.month - b.month),
    [monthly, selectedYear],
  );
  const years = useMemo(() => {
    if (!data) return [];
    return Array.from(
      { length: Math.max(0, endYear - startYear + 1) },
      (_, index) => startYear + index,
    );
  }, [data, endYear, startYear]);
  const calendarMax = useMemo(
    () =>
      Math.max(
        0,
        ...monthly
          .filter((item) => item.year >= startYear && item.year <= endYear)
          .map((item) => item.final_value ?? 0),
      ),
    [endYear, monthly, startYear],
  );
  const chartMax = Math.max(
    1,
    ...selectedYearData.flatMap((item) => [
      item.modis_count ?? 0,
      item.viirs_count ?? 0,
      item.viirs_adjusted ?? 0,
    ]),
  );

  const setRange = (nextStart: number, nextEnd: number) => {
    setStartYear(nextStart);
    setEndYear(nextEnd);
    if (selectedYear < nextStart || selectedYear > nextEnd) setSelection(nextEnd, selectedMonth);
  };
  const changeStartYear = (delta: number) => {
    const min = data?.metadata.period.startYear ?? 2020;
    setRange(Math.max(min, Math.min(endYear, startYear + delta)), endYear);
  };
  const changeEndYear = (delta: number) => {
    const max = data?.metadata.period.endYear ?? 2023;
    setRange(startYear, Math.min(max, Math.max(startYear, endYear + delta)));
  };

  const isReady = data?.status === 'ready';
  const hasEvaluationSamples =
    data != null && data.evaluation.sampleCount >= data.evaluation.minimumSamples;
  const evaluationHasEnoughSamples =
    hasEvaluationSamples &&
    data.evaluation.before.mae != null &&
    data.evaluation.after.mae != null;
  const calibrationRange = data
    ? `${data.metadata.calibration.startYear}–${data.metadata.calibration.endYear}`
    : '2020–2021';
  const evaluationRange = data
    ? `${data.metadata.evaluation.startYear}–${data.metadata.evaluation.endYear}`
    : '2022–2023';
  const transitionText = data
    ? `TRANSICIÓN · ${MONTHS[Number(data.metadata.transitionMonth.slice(5)) - 1].toUpperCase()} ${data.metadata.transitionMonth.slice(0, 4)}`
    : 'TRANSICIÓN · ENE 2022';
  const pendingDecemberCoverage = data?.statusMessage.includes('Diciembre de 2023 permanece') ?? false;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>F</Text></View>
            <View>
              <Text style={styles.brandName}>FIREGUARD</Text>
              <Text style={styles.brandLocation}>COCHABAMBA · BOLIVIA</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Exportar calendario satelital como CSV"
              disabled={!monthly.length || Platform.OS !== 'web'}
              onPress={() => exportMonthlyCsv(monthly)}
              style={({ pressed }) => [styles.exportButton, (!monthly.length || Platform.OS !== 'web') && styles.disabled, pressed && styles.pressed]}
            >
              <Text style={styles.exportButtonText}>Exportar CSV</Text>
            </Pressable>
            <View style={styles.headerTag}><Text style={styles.headerTagText}>ANÁLISIS HISTÓRICO</Text></View>
          </View>
        </View>

        <View style={[styles.hero, compact && styles.heroCompact]}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroOverline}>OBSERVACIÓN SATELITAL · {data?.metadata.period.startYear ?? 2020}—{data?.metadata.period.endYear ?? 2023}</Text>
            <Text style={styles.heroTitle}>Entender el fuego,{'\n'}más allá del sensor.</Text>
            <Text style={styles.heroText}>
              Comparamos detecciones MODIS y VIIRS para explorar cómo cambia la actividad observada y qué
              diferencias pueden deberse al sensor.
            </Text>
          </View>
          <View style={styles.heroCallout}>
            <Text style={styles.heroCalloutLabel}>ALCANCE DE SOLICITUD</Text>
            <Text style={styles.heroCalloutTitle}>Bolivia</Text>
            <Text style={styles.heroCalloutMeta}>Análisis filtrado al rectángulo piloto de Cochabamba</Text>
            <Text style={styles.heroCoordinates}>17.55°–17.15° S   ·   66.35°–65.95° O</Text>
          </View>
        </View>

        <View style={[styles.filterRow, compact && styles.filterRowCompact]}>
          <View style={styles.zoneFilter}>
            <Text style={styles.filterLabel}>ZONA DE ESTUDIO</Text>
            <Text style={styles.filterValue}>Bolivia · recorte piloto de Cochabamba</Text>
          </View>
          <View style={styles.yearFilter}>
            <Text style={styles.filterLabel}>RANGO DE AÑOS</Text>
            <View style={styles.rangeControls}>
              <View style={styles.rangeControl}>
                <Text style={styles.rangeLabel}>Desde</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Año inicial anterior"
                  disabled={startYear <= (data?.metadata.period.startYear ?? 2020)}
                  onPress={() => changeStartYear(-1)}
                  style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed, startYear <= (data?.metadata.period.startYear ?? 2020) && styles.disabled]}
                >
                  <Text style={styles.stepperText}>−</Text>
                </Pressable>
                <Text style={styles.rangeValue}>{startYear}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Año inicial siguiente"
                  disabled={startYear >= endYear}
                  onPress={() => changeStartYear(1)}
                  style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed, startYear >= endYear && styles.disabled]}
                >
                  <Text style={styles.stepperText}>+</Text>
                </Pressable>
              </View>
              <View style={styles.rangeControl}>
                <Text style={styles.rangeLabel}>Hasta</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Año final anterior"
                  disabled={endYear <= startYear}
                  onPress={() => changeEndYear(-1)}
                  style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed, endYear <= startYear && styles.disabled]}
                >
                  <Text style={styles.stepperText}>−</Text>
                </Pressable>
                <Text style={styles.rangeValue}>{endYear}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Año final siguiente"
                  disabled={endYear >= (data?.metadata.period.endYear ?? 2023)}
                  onPress={() => changeEndYear(1)}
                  style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed, endYear >= (data?.metadata.period.endYear ?? 2023) && styles.disabled]}
                >
                  <Text style={styles.stepperText}>+</Text>
                </Pressable>
              </View>
            </View>
          </View>
          <View style={styles.periodPill}><Text style={styles.periodPillText}>{transitionText}</Text></View>
        </View>

        {(loading || loadError || !isReady || pendingDecemberCoverage) && (
          <View style={[styles.notice, loadError ? styles.noticeError : styles.noticePending]}>
            <View style={styles.noticeIcon}><Text style={styles.noticeIconText}>{loading ? '…' : loadError ? '!' : 'i'}</Text></View>
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>
                {loading
                  ? 'Cargando resultados…'
                  : loadError
                    ? 'No se pudieron cargar los resultados'
                    : pendingDecemberCoverage && isReady
                      ? 'Diciembre de 2023 aún no está completo'
                    : data?.status === 'insufficient'
                      ? 'Datos disponibles, muestra insuficiente'
                      : 'Datos históricos pendientes de descarga'}
              </Text>
              <Text style={styles.noticeText}>
                {loading
                  ? 'Leyendo el archivo de resultados locales.'
                  : loadError
                    ? loadError
                    : data?.statusMessage ?? 'No se han cargado observaciones reales. El archivo histórico de NASA FIRMS requiere autenticación.'}
              </Text>
            </View>
            {!loading && data?.status === 'awaiting_data' ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => openUrl(sourceUrl)}
                style={({ pressed }) => [styles.noticeLink, pressed && styles.pressed]}
              >
                <Text style={styles.noticeLinkText}>Abrir archivo FIRMS ↗</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        <View style={[styles.mainGrid, compact && styles.mainGridCompact]}>
          <View style={styles.primaryColumn}>
            <View style={styles.card}>
              <View style={[styles.cardHeader, compact && styles.cardHeaderCompact]}>
                <SectionTitle
                  eyebrow="CALENDARIO HISTÓRICO"
                  title="Actividad del fuego"
                  caption="Años por fila · meses por columna · detecciones mensuales equivalentes a MODIS"
                />
                <View style={styles.scaleLegend}>
                  <Text style={styles.scaleLabel}>MENOS</Text>
                  {[0.2, 0.4, 0.6, 0.8, 1].map((step) => (
                    <View key={step} style={[styles.scaleChip, { backgroundColor: calendarMax ? activityColor(step) : COLORS.missing }]} />
                  ))}
                  <Text style={styles.scaleLabel}>MÁS</Text>
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View style={styles.calendar}>
                  <View style={styles.calendarRow}>
                    <Text style={styles.yearLabel}>AÑO</Text>
                    {MONTHS.map((month) => <Text key={month} style={styles.monthLabel}>{month}</Text>)}
                  </View>
                  {years.map((year) => (
                    <View key={year} style={styles.calendarRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Seleccionar año ${year}`}
                        onPress={() => setSelection(year, selectedMonth)}
                        style={[styles.yearCell, selectedYear === year && styles.yearCellSelected]}
                      >
                        <Text style={[styles.yearCellText, selectedYear === year && styles.yearCellTextSelected]}>{year}</Text>
                      </Pressable>
                      {MONTHS.map((monthName, index) => {
                        const month = index + 1;
                        const value = monthly.find((item) => item.year === year && item.month === month) ?? null;
                        const available = value?.final_value != null;
                        const ratio = available && calendarMax ? value.final_value! / calendarMax : 0;
                        const backgroundColor = available ? activityColor(ratio) : COLORS.missing;
                        const selectedCell = selectedYear === year && selectedMonth === month;
                        return (
                          <Pressable
                            key={monthName}
                            accessibilityRole="button"
                            accessibilityLabel={`${monthName} ${year}: ${available ? `${formatNumber(value.final_value)} detecciones equivalentes` : 'datos faltantes'}`}
                            onPress={() => setSelection(year, month)}
                            style={({ pressed }) => [
                              styles.calendarCell,
                              { backgroundColor },
                              selectedCell && styles.calendarCellSelected,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={[styles.cellValue, available && ratio > 0.72 && styles.cellValueLight]}>
                              {available ? formatNumber(value.final_value) : '·'}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                  {!years.length ? <Text style={styles.emptyText}>No hay años disponibles para mostrar.</Text> : null}
                </View>
              </ScrollView>

              <View style={styles.calendarFoot}>
                <Text style={styles.footnote}>Cada valor requiere cobertura mensual confirmada. “·” indica datos faltantes, no actividad cero.</Text>
                <Text style={styles.footnote}>Mes seleccionado: {MONTHS[selectedMonth - 1]} {selectedYear}</Text>
              </View>
            </View>

            <View style={styles.card}>
              <View style={[styles.chartHeader, compact && styles.chartHeaderCompact]}>
                <SectionTitle
                  eyebrow={`COMPARACIÓN MENSUAL · ${selectedYear}`}
                  title="Ver efecto de la armonización"
                  caption="Comparación durante los mismos meses disponibles"
                />
                <View style={styles.segmented}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: chartMode === 'original' }}
                    onPress={() => setChartMode('original')}
                    style={[styles.segment, chartMode === 'original' && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, chartMode === 'original' && styles.segmentTextActive]}>Originales</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: chartMode === 'harmonized' }}
                    onPress={() => setChartMode('harmonized')}
                    style={[styles.segment, chartMode === 'harmonized' && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, chartMode === 'harmonized' && styles.segmentTextActive]}>Armonizada</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.chartLegend}>
                <LegendItem color={COLORS.orange} label="MODIS · Terra + Aqua" />
                <LegendItem color={COLORS.blue} label="VIIRS · S-NPP" />
                {chartMode === 'harmonized' && <LegendItem color={COLORS.green} label="VIIRS ajustado a MODIS" />}
              </View>
              <View style={styles.chart}>
                {MONTHS.map((monthName, index) => {
                  const record = selectedYearData.find((item) => item.month === index + 1);
                  const series = [
                    { key: 'modis', value: record?.modis_count ?? null, color: COLORS.orange },
                    { key: 'viirs', value: record?.viirs_count ?? null, color: COLORS.blue },
                    ...(chartMode === 'harmonized' ? [{ key: 'adjusted', value: record?.viirs_adjusted ?? null, color: COLORS.green }] : []),
                  ];
                  return (
                    <View key={monthName} style={styles.chartMonth}>
                      <View style={styles.bars}>
                        {series.map((item) => (
                          <View key={item.key} style={styles.barSlot}>
                            <View
                              accessibilityLabel={`${monthName}, ${item.key}: ${formatNumber(item.value)}`}
                              style={[
                                styles.bar,
                                { backgroundColor: item.value == null ? COLORS.missing : item.color },
                                item.value == null ? styles.barMissing : { height: `${Math.max(3, (item.value / chartMax) * 100)}%` },
                              ]}
                            />
                          </View>
                        ))}
                      </View>
                      <Text style={styles.chartMonthLabel}>{monthName}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.footnote}>
                {chartMode === 'original'
                  ? 'Conteos originales tras filtros de calidad; las alturas no implican equivalencia entre sensores.'
                  : 'El ajuste solo se calcula con meses coincidentes del período de calibración; no elimina diferencias de detección.'}
              </Text>
            </View>
          </View>

          <View style={[styles.sideColumn, compact && styles.sideColumnCompact]}>
            <View style={styles.card}>
              <SectionTitle eyebrow="DETALLE DEL MES" title={`${MONTHS[selectedMonth - 1]} ${selectedYear}`} />
              {selected?.final_value != null ? (
                <>
                  <Text style={styles.detailValue}>{formatNumber(selected.final_value)}</Text>
                  <Text style={styles.detailUnit}>detecciones / mes · equivalente a MODIS · tras filtros de calidad</Text>
                  <View style={styles.detailDivider} />
                  <DetailRow label="Fuente del valor" value={`${selected.final_source ?? '—'} · ${selected.final_kind ?? ''}`} />
                  <DetailRow label="MODIS original" value={formatNumber(selected.modis_count)} />
                  <DetailRow label="VIIRS S-NPP original" value={formatNumber(selected.viirs_count)} />
                  <DetailRow label="Suma FRP MODIS (MW)" value={formatNumber(selected.frp_modis_sum)} />
                  <DetailRow label="Suma FRP VIIRS (MW)" value={formatNumber(selected.frp_viirs_sum)} />
                  <DetailRow label="Mediana histórica" value={selected.reference_median == null ? 'Insuficientes años' : `${formatNumber(selected.reference_median)} (${selected.reference_years} años)`} />
                  <DetailRow label="Diferencia vs. mediana" value={formatNumber(selected.reference_delta)} />
                  <View style={styles.qualityTag}><Text style={styles.qualityTagText}>{selected.coverage === 'complete' ? 'COBERTURA COMPLETA' : 'COBERTURA INCOMPLETA'}</Text></View>
                </>
              ) : (
                <View style={styles.noDataPanel}>
                  <Text style={styles.noDataTitle}>Sin observaciones verificadas</Text>
                  <Text style={styles.noDataText}>
                    {selected?.coverage === 'incomplete'
                      ? 'La cobertura de este mes está incompleta; no se puede interpretar como cero.'
                      : selected?.coverage === 'complete'
                        ? 'La cobertura está completa, pero falta un factor válido para estimar la serie armonizada.'
                        : selected
                          ? 'No hay cobertura confirmada para este mes. Se mantiene faltante, no como cero.'
                          : 'El archivo fuente aún no está disponible. Este mes se mantiene como faltante, no como cero.'}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.card}>
              <SectionTitle eyebrow="EVALUACIÓN RESERVADA" title="¿Qué aporta el ajuste?" />
              <Text style={styles.evaluationIntro}>MODIS observado frente a VIIRS en años no usados para calibrar.</Text>
              <View style={styles.errorRow}>
                <View style={styles.errorCell}>
                  <Text style={styles.errorLabel}>ANTES · VIIRS ORIGINAL</Text>
                  <Text style={styles.errorValue}>{formatMetric(data?.evaluation.before.mae, hasEvaluationSamples)}</Text>
                  <Text style={styles.errorBias}>
                    Sesgo: {formatMetric(data?.evaluation.before.bias, hasEvaluationSamples)}
                  </Text>
                </View>
                <View style={styles.errorCell}>
                  <Text style={styles.errorLabel}>DESPUÉS · VIIRS AJUSTADO</Text>
                  <Text style={styles.errorValue}>{formatMetric(data?.evaluation.after.mae, evaluationHasEnoughSamples)}</Text>
                  <Text style={styles.errorBias}>
                    Sesgo: {formatMetric(data?.evaluation.after.bias, evaluationHasEnoughSamples)}
                  </Text>
                </View>
              </View>
              <Text style={styles.metricDefinition}>Error absoluto medio (MAE), en detecciones por mes.</Text>
              <View style={styles.factorRow}>
                <Text style={styles.factorLabel}>Factor calibrado</Text>
                <Text style={styles.factorValue}>
                  {data?.harmonization.factor == null ? 'No disponible' : `${formatNumber(data.harmonization.factor)} · ${data.harmonization.calibrationMonths} meses`}
                </Text>
              </View>
              <View style={styles.evaluationMeta}>
                <Text style={styles.evaluationMetaText}>Evaluación: {evaluationRange}</Text>
                <Text style={styles.evaluationMetaText}>
                  {data ? `${data.evaluation.sampleCount} meses coincidentes` : 'Sin meses evaluados'}
                </Text>
              </View>
              {evaluationHasEnoughSamples ? (
                <View style={styles.quarterlyList}>
                  {data.evaluation.quarterly.map((quarter) => (
                    <View key={quarter.quarter} style={styles.quarterlyRow}>
                      <Text style={styles.quarterlyLabel}>{quarter.quarter}</Text>
                      <Text style={styles.quarterlyValue}>
                        MAE {formatNumber(quarter.beforeMae)} → {formatNumber(quarter.afterMae)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {!evaluationHasEnoughSamples ? (
                <Text style={styles.insufficientNote}>
                  {hasEvaluationSamples
                    ? 'No se pudo calcular una métrica ajustada válida; revise el factor y la cobertura. No se afirma una mejora.'
                    : 'Métricas no disponibles hasta contar con suficientes meses completos. No se afirma una mejora.'}
                </Text>
              ) : null}
            </View>

            <View style={styles.methodCard}>
              <Text style={styles.methodEyebrow}>MÉTODO, SIN CAJA NEGRA</Text>
              <Text style={styles.methodTitle}>Una referencia, no la verdad absoluta.</Text>
              <Text style={styles.methodText}>
                VIIRS ajustado = conteos VIIRS × factor calibrado con MODIS durante {calibrationRange}. La serie usa MODIS hasta diciembre de 2021 y VIIRS ajustado desde enero de 2022; la evaluación reservada es {evaluationRange}. Nunca suma ambos sensores.
              </Text>
              <Text style={styles.methodText}>
                Un foco satelital no equivale a un incendio independiente ni a superficie quemada. Diferencias de resolución, horario y detección persisten. Esto no es una predicción de riesgo.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerTextBlock}>
            <Text style={styles.footerTitle}>Fuentes y reconocimiento</Text>
            <Text style={styles.footerText}>
              Datos y/o imágenes de NASA FIRMS, parte de NASA LANCE y NASA ESDIS. Productos solicitados: MODIS Collection 6.1 (Terra + Aqua) y VIIRS S-NPP Collection 2; el código exacto de VIIRS se confirmará con los archivos.
            </Text>
          </View>
          <Pressable accessibilityRole="link" onPress={() => openUrl('https://www.earthdata.nasa.gov/data/tools/firms')} style={styles.footerLink}>
            <Text style={styles.footerLinkText}>NASA FIRMS ↗</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function activityColor(ratio: number) {
  if (ratio > 0.8) return '#185b40';
  if (ratio > 0.6) return '#3f875d';
  if (ratio > 0.4) return '#75ab7e';
  if (ratio > 0.2) return '#b9d5bd';
  return '#e4f0e5';
}

function formatMetric(value: number | null | undefined, ready: boolean) {
  if (!ready || value == null) return '—';
  return formatNumber(value);
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailRowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.paper },
  pageContent: { paddingBottom: 48 },
  container: { width: '100%', maxWidth: 1200, alignSelf: 'center', paddingHorizontal: 24 },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandMark: { width: 40, height: 40, borderRadius: 13, backgroundColor: COLORS.forest, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: COLORS.white, fontSize: 24, fontWeight: '800' },
  brandName: { color: COLORS.ink, fontSize: 15, fontWeight: '800', letterSpacing: 1.5 },
  brandLocation: { color: COLORS.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginTop: 3 },
  headerTag: { backgroundColor: '#e8eee8', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20 },
  headerTagText: { color: COLORS.forest, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exportButton: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  exportButtonText: { color: COLORS.forest, fontSize: 9, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  hero: { backgroundColor: COLORS.forest, borderRadius: 22, padding: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 26 },
  heroCompact: { flexDirection: 'column', alignItems: 'stretch', padding: 24 },
  heroCopy: { flex: 1 },
  heroOverline: { color: '#b5d7c1', fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 13 },
  heroTitle: { color: COLORS.white, fontSize: 34, lineHeight: 39, fontWeight: '800', letterSpacing: -0.7 },
  heroText: { color: '#d3e2d9', fontSize: 14, lineHeight: 21, maxWidth: 520, marginTop: 13 },
  heroCallout: { width: 260, backgroundColor: '#ffffff16', borderColor: '#ffffff2b', borderWidth: 1, borderRadius: 16, padding: 18 },
  heroCalloutLabel: { color: '#b5d7c1', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  heroCalloutTitle: { color: COLORS.white, fontSize: 21, fontWeight: '700', marginTop: 7 },
  heroCalloutMeta: { color: '#d3e2d9', fontSize: 11, lineHeight: 17, marginTop: 5 },
  heroCoordinates: { color: '#ffffff', fontSize: 10, fontWeight: '700', marginTop: 13 },
  filterRow: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 22 },
  filterRowCompact: { alignItems: 'flex-start', flexDirection: 'column', paddingVertical: 16, gap: 14 },
  zoneFilter: { flex: 1 },
  filterLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginBottom: 7 },
  filterValue: { color: COLORS.ink, fontSize: 14, fontWeight: '700' },
  yearFilter: { alignItems: 'flex-start' },
  rangeControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  rangeControl: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rangeLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  stepperButton: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  stepperText: { color: COLORS.forest, fontSize: 18, lineHeight: 20, fontWeight: '600' },
  rangeValue: { color: COLORS.ink, fontSize: 13, fontWeight: '700', minWidth: 34, textAlign: 'center' },
  periodPill: { backgroundColor: '#f9eee2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  periodPillText: { color: '#96551e', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  notice: { borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 22, borderWidth: 1 },
  noticePending: { backgroundColor: '#fff8ee', borderColor: '#f2d9bb' },
  noticeError: { backgroundColor: '#fff0ef', borderColor: '#f1cbc8' },
  noticeIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f3dfc5', alignItems: 'center', justifyContent: 'center' },
  noticeIconText: { color: '#84501f', fontSize: 15, fontWeight: '800' },
  noticeCopy: { flex: 1 },
  noticeTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '800', marginBottom: 3 },
  noticeText: { color: COLORS.muted, fontSize: 11, lineHeight: 16 },
  noticeLink: { paddingHorizontal: 13, paddingVertical: 10, backgroundColor: COLORS.white, borderRadius: 9 },
  noticeLinkText: { color: COLORS.forest, fontSize: 11, fontWeight: '800' },
  mainGrid: { flexDirection: 'row', alignItems: 'flex-start', gap: 18 },
  mainGridCompact: { flexDirection: 'column' },
  primaryColumn: { flex: 1.8, gap: 18, minWidth: 0 },
  sideColumn: { flex: 1, gap: 18, minWidth: 280 },
  sideColumnCompact: { width: '100%', minWidth: 0 },
  card: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 20 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 15, marginBottom: 18 },
  cardHeaderCompact: { flexDirection: 'column' },
  sectionTitle: { flex: 1 },
  eyebrow: { color: COLORS.green, fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
  sectionHeading: { color: COLORS.ink, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  caption: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 5 },
  scaleLegend: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 4 },
  scaleLabel: { color: COLORS.muted, fontSize: 8, fontWeight: '700', marginHorizontal: 3 },
  scaleChip: { width: 13, height: 13, borderRadius: 4 },
  calendar: { minWidth: 610 },
  calendarRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  yearLabel: { width: 48, color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.7, textAlign: 'center' },
  monthLabel: { width: 42, color: COLORS.muted, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  yearCell: { width: 48, height: 36, borderRadius: 7, justifyContent: 'center', alignItems: 'center' },
  yearCellSelected: { backgroundColor: COLORS.lightGreen },
  yearCellText: { color: COLORS.ink, fontSize: 11, fontWeight: '700' },
  yearCellTextSelected: { color: COLORS.forest, fontWeight: '900' },
  calendarCell: { width: 42, height: 36, borderRadius: 7, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#ffffff' },
  calendarCellSelected: { borderColor: COLORS.forest, borderWidth: 2 },
  cellValue: { color: '#52665a', fontSize: 9, fontWeight: '700' },
  cellValueLight: { color: COLORS.white },
  calendarFoot: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 12, paddingTop: 11, gap: 5 },
  footnote: { color: COLORS.muted, fontSize: 10, lineHeight: 15 },
  emptyText: { color: COLORS.muted, fontSize: 12, paddingVertical: 20 },
  chartHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  chartHeaderCompact: { flexDirection: 'column' },
  segmented: { flexDirection: 'row', backgroundColor: '#f0f3f0', borderRadius: 9, padding: 3 },
  segment: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7 },
  segmentActive: { backgroundColor: COLORS.white, shadowColor: '#102d1f', shadowOpacity: 0.1, shadowRadius: 4, elevation: 1 },
  segmentText: { color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  segmentTextActive: { color: COLORS.forest },
  chartLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 13, marginTop: 17, marginBottom: 13 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: COLORS.muted, fontSize: 9 },
  chart: { height: 142, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border, marginTop: 3, marginBottom: 11 },
  chartMonth: { flex: 1, alignItems: 'center', minWidth: 18 },
  bars: { flex: 1, width: '100%', flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 2, paddingHorizontal: 1 },
  barSlot: { height: '100%', width: 7, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: 6, minHeight: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  barMissing: { height: '3%', borderRadius: 3 },
  chartMonthLabel: { color: COLORS.muted, fontSize: 8, marginTop: 6, marginBottom: 5 },
  factorRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: COLORS.border },
  factorLabel: { color: COLORS.muted, fontSize: 9 },
  factorValue: { color: COLORS.ink, fontSize: 9, fontWeight: '800', textAlign: 'right' },
  detailValue: { color: COLORS.forest, fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginTop: 15 },
  detailUnit: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  detailDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 15 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  detailLabel: { color: COLORS.muted, fontSize: 10, flex: 1 },
  detailRowValue: { color: COLORS.ink, fontSize: 10, fontWeight: '700', textAlign: 'right', flex: 1.15 },
  qualityTag: { alignSelf: 'flex-start', backgroundColor: COLORS.lightGreen, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, marginTop: 2 },
  qualityTagText: { color: COLORS.forest, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  noDataPanel: { backgroundColor: '#f7f8f6', borderRadius: 12, padding: 16, marginTop: 16 },
  noDataTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '800' },
  noDataText: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 6 },
  evaluationIntro: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 10 },
  errorRow: { flexDirection: 'row', gap: 10, marginTop: 17 },
  errorCell: { flex: 1, backgroundColor: '#f6f8f6', borderRadius: 10, padding: 11 },
  errorLabel: { color: COLORS.muted, fontSize: 8, fontWeight: '800', lineHeight: 12 },
  errorValue: { color: COLORS.ink, fontSize: 19, fontWeight: '800', marginTop: 7 },
  errorBias: { color: COLORS.muted, fontSize: 9, marginTop: 4 },
  metricDefinition: { color: COLORS.muted, fontSize: 9, lineHeight: 14, marginTop: 10 },
  evaluationMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 13, paddingTop: 11, borderTopWidth: 1, borderTopColor: COLORS.border },
  evaluationMetaText: { color: COLORS.ink, fontSize: 9, fontWeight: '700' },
  quarterlyList: { marginTop: 8, gap: 5 },
  quarterlyRow: { flexDirection: 'row', justifyContent: 'space-between' },
  quarterlyLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '700' },
  quarterlyValue: { color: COLORS.muted, fontSize: 9 },
  insufficientNote: { color: '#8a5b2b', backgroundColor: '#fff8ee', borderRadius: 8, padding: 9, fontSize: 9, lineHeight: 14, marginTop: 10 },
  methodCard: { backgroundColor: '#eaf1ec', borderRadius: 16, padding: 19 },
  methodEyebrow: { color: COLORS.green, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  methodTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '800', marginTop: 8 },
  methodText: { color: '#4e6258', fontSize: 10, lineHeight: 16, marginTop: 9 },
  footer: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 24, paddingTop: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18 },
  footerTextBlock: { flex: 1 },
  footerTitle: { color: COLORS.ink, fontSize: 11, fontWeight: '800', marginBottom: 5 },
  footerText: { color: COLORS.muted, fontSize: 9, lineHeight: 14 },
  footerLink: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: COLORS.white, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  footerLinkText: { color: COLORS.forest, fontSize: 10, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
