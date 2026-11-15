import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAtlasTheme } from '@/components/atlas-ui';
import type { SatelliteMonth } from '@/lib/satellite-data-service';
import { dimensions, radii, spacing, typography } from '@/theme/tokens';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function adjustedValue(record: SatelliteMonth | undefined) {
  if (!record) return null;
  if (record.viirs_adjusted != null) return record.viirs_adjusted;
  if (record.final_kind === 'estimado') return record.final_value;
  return null;
}

export function SensorSeriesChart({
  year,
  monthly,
  selectedMonth,
  showHarmonized,
  transitionMonth,
  units,
  onSelect,
}: {
  year: number;
  monthly: SatelliteMonth[];
  selectedMonth: number;
  showHarmonized: boolean;
  transitionMonth?: string;
  units: string;
  onSelect: (month: number) => void;
}) {
  const { colors } = useAtlasTheme();
  const rows = MONTHS.map((label, index) => {
    const month = index + 1;
    const record = monthly.find((item) => item.year === year && item.month === month);
    return {
      label,
      month,
      record,
      modis: record?.modis_count ?? null,
      viirs: record?.viirs_count ?? null,
      adjusted: adjustedValue(record),
      published: record?.final_value ?? null,
    };
  });
  const numbers = rows.flatMap((row) => [
    row.modis,
    row.viirs,
    showHarmonized ? row.adjusted : null,
    showHarmonized ? row.published : null,
  ]).filter((value): value is number => value != null);
  const maximum = numbers.length ? Math.max(...numbers) : 0;
  const hasSeries = numbers.length > 0;
  const transitionIndex = transitionMonth?.startsWith(`${year}-`)
    ? Number(transitionMonth.slice(5))
    : null;

  return (
    <View accessibilityLabel={`Serie mensual ${year}. Unidad: ${units}`}>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.modisSample, { backgroundColor: colors.modis }]} />
          <Text style={[styles.legendText, { color: colors.ink }]}>MODIS · barra sólida</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.viirsSample, { borderColor: colors.viirs }]} />
          <Text style={[styles.legendText, { color: colors.ink }]}>VIIRS · barra con borde</Text>
        </View>
        {showHarmonized ? (
          <View style={styles.legendItem}>
            <View style={[styles.adjustedSample, { borderColor: colors.ink }]} />
            <Text style={[styles.legendText, { color: colors.ink }]}>Ajustado o serie publicada · marca discontinua</Text>
          </View>
        ) : null}
      </View>
      {hasSeries ? (
        <View style={styles.plot}>
          <Text style={[styles.axisMax, { color: colors.inkSubtle }]}>{maximum}</Text>
          <View style={[styles.columns, { borderColor: colors.line }]}>
            {rows.map((row) => {
              const selected = row.month === selectedMonth;
              const heightFor = (value: number | null) => (
                value == null || maximum <= 0 ? 0 : Math.max(2, Math.round((value / maximum) * dimensions.chartHeight))
              );
              const readout = [
                `MODIS ${row.modis == null ? 'sin dato' : row.modis}`,
                `VIIRS ${row.viirs == null ? 'sin dato' : row.viirs}`,
                showHarmonized ? `ajustado ${row.adjusted == null ? 'sin dato' : row.adjusted}` : null,
                showHarmonized ? `serie publicada ${row.published == null ? 'sin dato' : row.published}` : null,
              ].filter(Boolean).join(', ');
              return (
                <Pressable
                  key={row.label}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.label} ${year}: ${readout}`}
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(row.month)}
                  style={[styles.column, selected && { backgroundColor: colors.accentSoft }]}
                >
                  <View style={styles.bars}>
                    {row.modis != null ? <View style={[styles.modisBar, { height: heightFor(row.modis), backgroundColor: colors.modis }]} /> : <View style={styles.barGap} />}
                    {row.viirs != null ? <View style={[styles.viirsBar, { height: heightFor(row.viirs), borderColor: colors.viirs }]} /> : <View style={styles.barGap} />}
                    {showHarmonized && (row.adjusted != null || row.published != null) ? (
                      <View style={[styles.adjustedMark, { borderColor: colors.ink, bottom: heightFor(row.adjusted ?? row.published) }]} />
                    ) : null}
                  </View>
                  <Text style={[styles.monthLabel, { color: selected ? colors.ink : colors.inkSubtle }]}>{row.label}</Text>
                  {transitionIndex === row.month ? <Text style={[styles.transition, { color: colors.attention }]}>Transición</Text> : null}
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.axisZero, { color: colors.inkSubtle }]}>0</Text>
        </View>
      ) : (
        <View style={[styles.empty, { borderColor: colors.line, backgroundColor: colors.canvas, borderRadius: radii.medium }]}>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>Sin serie publicada para {year}</Text>
          <Text style={[styles.emptyBody, { color: colors.inkMuted }]}>
            No hay conteos MODIS ni VIIRS en los resultados cargados. El gráfico no representa esos meses como cero.
          </Text>
        </View>
      )}
      <Text style={[styles.caption, { color: colors.inkMuted }]}>
        Unidad: {units}. Una barra ausente es un dato no publicado. El cero solo aparece cuando el procesamiento registró 0.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: spacing.lg },
  legendText: { fontFamily: typography.family.sans, fontSize: typography.size.caption },
  modisSample: { width: spacing.sm, height: spacing.sm },
  viirsSample: { width: spacing.sm, height: spacing.sm, borderWidth: dimensions.rule, backgroundColor: 'transparent' },
  adjustedSample: { width: spacing.md, height: 0, borderTopWidth: dimensions.rule, borderStyle: 'dashed' },
  plot: { gap: spacing.xxs },
  axisMax: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontVariant: typography.tabular },
  axisZero: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontVariant: typography.tabular },
  columns: { minHeight: dimensions.chartHeight + spacing.lg, flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: dimensions.hairline, gap: spacing.xxs },
  column: { flex: 1, minWidth: 28, minHeight: dimensions.touchTarget, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: spacing.xxs },
  bars: { position: 'relative', height: dimensions.chartHeight, width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2 },
  modisBar: { width: 6 },
  viirsBar: { width: 6, borderWidth: dimensions.rule, backgroundColor: 'transparent' },
  barGap: { width: 6 },
  adjustedMark: { position: 'absolute', left: 2, right: 2, borderTopWidth: dimensions.rule, borderStyle: 'dashed' },
  monthLabel: { fontFamily: typography.family.sans, fontSize: typography.size.caption, marginTop: spacing.xxs },
  transition: { fontFamily: typography.family.sans, fontSize: 10, fontWeight: '700' },
  empty: { padding: spacing.md, borderWidth: dimensions.hairline, gap: spacing.xs },
  emptyTitle: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '700' },
  emptyBody: { fontFamily: typography.family.sans, fontSize: typography.size.caption, lineHeight: typography.lineHeight.body },
  caption: { fontFamily: typography.family.sans, fontSize: typography.size.caption, lineHeight: typography.lineHeight.body, marginTop: spacing.sm },
});
