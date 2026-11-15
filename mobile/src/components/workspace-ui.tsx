import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme, useWindowDimensions } from 'react-native';
import { useAtlasTheme } from '@/components/atlas-ui';
import { breakpoints, dimensions, radii, spacing, typography } from '@/theme/tokens';

export function WorkspacePage({
  title,
  description,
  children,
}: PropsWithChildren<{ title: string; description?: string }>) {
  const { colors } = useAtlasTheme();
  const { width } = useWindowDimensions();
  const compact = width < breakpoints.compact;
  return (
    <ScrollView style={[styles.page, { backgroundColor: colors.canvas }]} contentContainerStyle={[styles.content, compact && styles.contentCompact]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
        {description ? <Text style={[styles.description, { color: colors.inkMuted }]}>{description}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );
}

export function Panel({ title, children, action }: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  const { colors } = useAtlasTheme();
  return (
    <View style={[styles.panel, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}>
      <View style={styles.panelHeader}>
        <Text style={[styles.panelTitle, { color: colors.ink }]}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  secureTextEntry,
  autoCapitalize,
  disabled = false,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'decimal-pad';
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  disabled?: boolean;
  error?: string;
}) {
  const { colors } = useAtlasTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSubtle}
        multiline={multiline}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        editable={!disabled}
        style={[
          styles.input,
          { borderColor: error ? colors.danger : colors.lineStrong, color: colors.ink, backgroundColor: colors.surfaceRaised },
          multiline && styles.multiline,
          disabled && styles.disabledInput,
        ]}
      />
      {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  disabled,
  secondary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const { colors } = useAtlasTheme();
  const onAccent = useColorScheme() === 'dark' ? '#1A120C' : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: secondary ? colors.surface : colors.accent, borderColor: secondary ? colors.lineStrong : colors.accent },
        secondary && styles.secondaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, { color: secondary ? colors.ink : onAccent }]}>{label}</Text>
    </Pressable>
  );
}

export function Notice({ children, error = false }: PropsWithChildren<{ error?: boolean }>) {
  const { colors } = useAtlasTheme();
  return (
    <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: error ? colors.dangerSoft : colors.calmSoft, borderColor: error ? colors.danger : colors.calm }]}>
      <Text style={[styles.noticeText, { color: error ? colors.danger : colors.calm }]}>{children}</Text>
    </View>
  );
}

export function MutedText({ children }: PropsWithChildren) {
  const { colors } = useAtlasTheme();
  return <Text style={[styles.muted, { color: colors.inkMuted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { width: '100%', maxWidth: dimensions.workspaceContent, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.section, gap: spacing.md },
  contentCompact: { paddingHorizontal: spacing.md },
  header: { gap: spacing.xxs, marginBottom: spacing.xxs },
  title: { fontFamily: typography.family.sans, fontSize: typography.size.heading, fontWeight: '700' },
  description: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body, maxWidth: dimensions.workspaceDescription },
  panel: { padding: spacing.md, borderRadius: radii.medium, borderWidth: dimensions.hairline, gap: spacing.md },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  panelTitle: { fontFamily: typography.family.sans, fontSize: typography.size.body, fontWeight: '700', flexShrink: 1 },
  field: { gap: spacing.xs },
  label: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '700' },
  input: { minHeight: dimensions.touchTarget, borderWidth: dimensions.hairline, borderRadius: radii.small, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, fontFamily: typography.family.sans, fontSize: typography.size.body },
  disabledInput: { opacity: 0.6 },
  multiline: { minHeight: dimensions.multilineFieldHeight, textAlignVertical: 'top' },
  error: { fontFamily: typography.family.sans, fontSize: typography.size.caption, lineHeight: typography.lineHeight.body },
  button: { minHeight: dimensions.touchTarget, borderRadius: radii.small, borderWidth: dimensions.hairline, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  secondaryButton: { borderWidth: dimensions.hairline },
  disabledButton: { opacity: 0.5 },
  buttonText: { fontFamily: typography.family.sans, fontSize: typography.size.caption, fontWeight: '800', textAlign: 'center' },
  notice: { borderWidth: dimensions.hairline, borderRadius: radii.small, padding: spacing.sm },
  noticeText: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
  muted: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
  pressed: { opacity: 0.75 },
});
