import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { useAuth, type AppRole } from '@/lib/auth-context';
import { dimensions, radii, spacing, themeTokens, typography } from '@/theme/tokens';

export function useAtlasTheme() {
  return themeTokens[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useAtlasTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: variant === 'primary' ? colors.ink : variant === 'secondary' ? colors.surface : 'transparent' },
        { borderColor: variant === 'primary' ? colors.ink : colors.lineStrong },
        variant !== 'primary' && styles.buttonBorder,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, { color: variant === 'primary' ? colors.surface : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style, accessibilityLabel }: PropsWithChildren<{ style?: object; accessibilityLabel?: string }>) {
  const { colors } = useAtlasTheme();
  return (
    <View accessibilityLabel={accessibilityLabel} style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }, style]}>
      {children}
    </View>
  );
}

export function Badge({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'attention' | 'calm' }>) {
  const { colors } = useAtlasTheme();
  const foreground = tone === 'attention' ? colors.attention : tone === 'calm' ? colors.calm : colors.inkMuted;
  const background = tone === 'attention' ? colors.attentionSoft : tone === 'calm' ? colors.calmSoft : colors.canvas;
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text style={[styles.badgeText, { color: foreground }]}>{children}</Text>
    </View>
  );
}

export function DetectionMarker({ sensor }: { sensor: 'MODIS' | 'VIIRS' }) {
  const { colors } = useAtlasTheme();
  const modis = sensor === 'MODIS';
  const color = modis ? colors.modis : colors.viirs;
  return (
    <View accessibilityLabel={`Marcador ${sensor}`} style={styles.marker}>
      <View style={[styles.markerShape, { backgroundColor: color, borderColor: color }, !modis && styles.squareMarker]} />
      <Text style={[styles.markerLabel, { color: colors.inkMuted }]}>{sensor}</Text>
    </View>
  );
}

export function SensorLegend() {
  const { colors } = useAtlasTheme();
  return (
    <View accessibilityLabel="Leyenda de sensores" style={styles.sensorLegend}>
      <View style={styles.marker}>
        <View style={[styles.legendCircle, { backgroundColor: colors.modis }]} />
        <Text style={[styles.markerLabel, { color: colors.ink }]}>MODIS</Text>
        <Text style={[styles.legendMeta, { color: colors.inkMuted }]}>círculo · Terra/Aqua</Text>
      </View>
      <View style={styles.marker}>
        <View style={[styles.legendSquare, { backgroundColor: colors.viirs }]} />
        <Text style={[styles.markerLabel, { color: colors.ink }]}>VIIRS</Text>
        <Text style={[styles.legendMeta, { color: colors.inkMuted }]}>cuadrado · Suomi-NPP</Text>
      </View>
    </View>
  );
}

export function MonthScrubber({
  year,
  month,
  onChange,
  minYear,
  maxYear,
}: {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
  minYear?: number;
  maxYear?: number;
}) {
  const { colors } = useAtlasTheme();
  const canMove = (delta: number) => {
    const serial = year * 12 + month - 1 + delta;
    const minSerial = minYear == null ? Number.NEGATIVE_INFINITY : minYear * 12;
    const maxSerial = maxYear == null ? Number.POSITIVE_INFINITY : maxYear * 12 + 11;
    return serial >= minSerial && serial <= maxSerial;
  };
  const move = (delta: number) => {
    if (!canMove(delta)) return;
    const serial = year * 12 + month - 1 + delta;
    onChange(Math.floor(serial / 12), (serial % 12) + 1);
  };
  return (
    <View style={styles.scrubber}>
      <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" accessibilityState={{ disabled: !canMove(-1) }} disabled={!canMove(-1)} onPress={() => move(-1)} style={[styles.scrubberArrow, { borderColor: colors.line }, !canMove(-1) && styles.disabled]}>
        <Text style={[styles.scrubberArrowText, { color: colors.ink }]}>‹</Text>
      </Pressable>
      <View accessibilityRole="text" accessibilityLabel={`Mes seleccionado: ${month}/${year}`} style={styles.scrubberMonth}>
        <Text style={[styles.scrubberName, { color: colors.ink }]}>{new Intl.DateTimeFormat('es', { month: 'long' }).format(new Date(year, month - 1, 1))}</Text>
        <Text style={[styles.scrubberYear, { color: colors.inkMuted }]}>{year}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" accessibilityState={{ disabled: !canMove(1) }} disabled={!canMove(1)} onPress={() => move(1)} style={[styles.scrubberArrow, { borderColor: colors.line }, !canMove(1) && styles.disabled]}>
        <Text style={[styles.scrubberArrowText, { color: colors.ink }]}>›</Text>
      </Pressable>
    </View>
  );
}

export function StatusTimeline({ current }: { current: string }) {
  const { colors } = useAtlasTheme();
  const stages = ['Reporte', 'Evaluación', 'Asignación', 'Desplazamiento', 'Intervención', 'Vigilancia', 'Cierre'];
  return (
    <View accessibilityRole="list" accessibilityLabel="Etapas del seguimiento" style={styles.timeline}>
      {stages.map((stage, index) => {
        const selected = stage === current;
        return (
          <View key={stage} accessibilityRole="listitem" style={styles.timelineItem}>
            <View style={[styles.timelineDot, { backgroundColor: selected ? colors.attention : colors.surface, borderColor: selected ? colors.attention : colors.lineStrong }]} />
            <Text style={[styles.timelineText, { color: selected ? colors.ink : colors.inkMuted }]}>{stage}</Text>
            {index === 2 ? <Text style={[styles.timelineClarifier, { color: colors.inkSubtle }]}>Asignado ≠ en desplazamiento</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

export function EmptyState({
  variant,
  title,
  children,
}: PropsWithChildren<{ variant: 'pending' | 'noData' | 'noPermissions' | 'noFirebase'; title: string }>) {
  const { colors } = useAtlasTheme();
  const icon = variant === 'pending' ? '···' : variant === 'noPermissions' ? '—' : variant === 'noFirebase' ? '!' : '○';
  return (
    <View accessibilityRole="text" style={[styles.emptyState, { borderColor: colors.line, backgroundColor: colors.canvas }]}>
      <Text style={[styles.emptyIcon, { color: variant === 'pending' ? colors.attention : colors.calm }]}>{icon}</Text>
      <Text style={[styles.emptyTitle, { color: colors.ink }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.inkMuted }]}>{children}</Text>
    </View>
  );
}

export function FormField({
  label,
  value,
  onChangeText,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  placeholder?: string;
}) {
  const { colors } = useAtlasTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.ink }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSubtle}
        style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: error ? colors.attention : colors.lineStrong, color: colors.ink }]}
      />
      {error ? <Text accessibilityRole="alert" style={[styles.fieldError, { color: colors.attention }]}>{error}</Text> : null}
    </View>
  );
}

export function ReadingNote() {
  const { colors } = useAtlasTheme();
  return (
    <View accessibilityRole="text" accessibilityLabel="Nota de interpretación: una detección no confirma un incendio y su ausencia no lo descarta" style={[styles.readingNote, { backgroundColor: colors.attentionSoft, borderColor: colors.attention }]}>
      <Text style={[styles.readingMark, { color: colors.attention }]}>LECTURA DE CAMPO</Text>
      <Text style={[styles.readingText, { color: colors.ink }]}>Una detección no confirma un incendio. Su ausencia tampoco lo descarta.</Text>
    </View>
  );
}

export function RoleGate({ allow, children, fallback = null }: PropsWithChildren<{ allow: AppRole[]; fallback?: ReactNode }>) {
  const { role } = useAuth();
  return allow.includes(role) ? children : fallback;
}

const styles = StyleSheet.create({
  button: { minHeight: dimensions.touchTarget, minWidth: dimensions.touchTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.small },
  buttonBorder: { borderWidth: dimensions.hairline },
  buttonText: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.75 },
  card: { padding: spacing.lg, borderWidth: dimensions.hairline, borderRadius: radii.medium, gap: spacing.md },
  badge: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  badgeText: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '700' },
  marker: { minHeight: dimensions.touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  markerShape: { width: spacing.sm, height: spacing.sm, borderRadius: radii.pill, borderWidth: dimensions.hairline },
  squareMarker: { borderRadius: radii.small },
  markerLabel: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '800' },
  sensorLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  legendCircle: { width: spacing.sm, height: spacing.sm, borderRadius: radii.pill },
  legendSquare: { width: spacing.sm, height: spacing.sm, borderRadius: radii.small },
  legendMeta: { fontFamily: typography.family.sans, fontSize: typography.size.caption },
  scrubber: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  scrubberArrow: { width: dimensions.touchTarget, height: dimensions.touchTarget, alignItems: 'center', justifyContent: 'center', borderWidth: dimensions.hairline, borderRadius: radii.small },
  scrubberArrowText: { fontFamily: typography.family.editorial, fontSize: typography.size.heading },
  scrubberMonth: { flex: 1, alignItems: 'center' },
  scrubberName: { fontFamily: typography.family.editorial, fontSize: typography.size.subheading, textTransform: 'capitalize' },
  scrubberYear: { fontFamily: typography.family.mono, fontSize: typography.size.caption },
  timeline: { gap: spacing.md },
  timelineItem: { minHeight: dimensions.touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  timelineDot: { width: spacing.sm, height: spacing.sm, borderWidth: dimensions.rule, borderRadius: radii.pill },
  timelineText: { fontFamily: typography.family.sans, fontSize: typography.size.small },
  timelineClarifier: { flexBasis: '100%', marginLeft: spacing.xl, fontFamily: typography.family.mono, fontSize: typography.size.caption },
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, borderWidth: dimensions.hairline, borderRadius: radii.medium, gap: spacing.sm, overflow: 'hidden' },
  emptyIcon: { fontFamily: typography.family.editorial, fontSize: typography.size.display },
  emptyTitle: { fontFamily: typography.family.editorial, fontSize: typography.size.subheading, textAlign: 'center' },
  emptyBody: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body, textAlign: 'center', maxWidth: dimensions.emptyStateWidth },
  field: { gap: spacing.xs },
  fieldLabel: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '700' },
  input: { minHeight: dimensions.touchTarget, borderWidth: dimensions.hairline, borderRadius: radii.small, paddingHorizontal: spacing.sm, fontFamily: typography.family.sans, fontSize: typography.size.body },
  fieldError: { fontFamily: typography.family.sans, fontSize: typography.size.caption },
  readingNote: { padding: spacing.md, borderLeftWidth: spacing.xxs, borderRadius: radii.small, gap: spacing.xs },
  readingMark: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '800', letterSpacing: 1 },
  readingText: { fontFamily: typography.family.editorial, fontSize: typography.size.body, lineHeight: typography.lineHeight.body },
});
