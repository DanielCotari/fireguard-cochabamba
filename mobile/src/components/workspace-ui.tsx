import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAtlasTheme } from '@/components/atlas-ui';
import { dimensions, radii, spacing, typography } from '@/theme/tokens';

export function WorkspacePage({
  title,
  description,
  children,
}: PropsWithChildren<{ title: string; description?: string }>) {
  const { colors } = useAtlasTheme();
  return (
    <ScrollView style={[styles.page, { backgroundColor: colors.canvas }]} contentContainerStyle={styles.content}>
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
}) {
  const { colors } = useAtlasTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
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
          { borderColor: colors.lineStrong, color: colors.ink, backgroundColor: colors.surfaceRaised },
          multiline && styles.multiline,
          disabled && styles.disabledInput,
        ]}
      />
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: secondary ? colors.surface : colors.ink, borderColor: secondary ? colors.lineStrong : colors.ink },
        secondary && styles.secondaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, { color: secondary ? colors.ink : colors.surface }]}>{label}</Text>
    </Pressable>
  );
}

export function Notice({ children, error = false }: PropsWithChildren<{ error?: boolean }>) {
  const { colors } = useAtlasTheme();
  return (
    <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: error ? colors.attentionSoft : colors.calmSoft, borderColor: error ? colors.attention : colors.calm }]}>
      <Text style={[styles.noticeText, { color: error ? colors.attention : colors.calm }]}>{children}</Text>
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
  header: { gap: spacing.xxs, marginBottom: spacing.xxs },
  title: { fontFamily: typography.family.editorial, fontSize: typography.size.heading, fontWeight: '400' },
  description: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body, maxWidth: dimensions.workspaceDescription },
  panel: { padding: spacing.md, borderRadius: radii.medium, borderWidth: dimensions.hairline, gap: spacing.md },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  panelTitle: { fontFamily: typography.family.editorial, fontSize: typography.size.subheading, flexShrink: 1 },
  field: { gap: spacing.xs },
  label: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '700' },
  input: { minHeight: dimensions.touchTarget, borderWidth: dimensions.hairline, borderRadius: radii.small, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, fontFamily: typography.family.sans, fontSize: typography.size.body },
  disabledInput: { opacity: 0.6 },
  multiline: { minHeight: dimensions.multilineFieldHeight, textAlignVertical: 'top' },
  button: { minHeight: dimensions.touchTarget, borderRadius: radii.small, borderWidth: dimensions.hairline, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  secondaryButton: { borderWidth: dimensions.hairline },
  disabledButton: { opacity: 0.5 },
  buttonText: { fontFamily: typography.family.sans, fontSize: typography.size.caption, fontWeight: '800', textAlign: 'center' },
  notice: { borderWidth: dimensions.hairline, borderRadius: radii.small, padding: spacing.sm },
  noticeText: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
  muted: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
  pressed: { opacity: 0.75 },
});
