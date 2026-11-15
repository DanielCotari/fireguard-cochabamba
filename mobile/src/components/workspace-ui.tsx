import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

const colors = {
  ink: '#172c27',
  muted: '#64756e',
  forest: '#144b3a',
  border: '#e2e9e4',
  paper: '#f4f7f4',
  white: '#ffffff',
  error: '#8b342c',
};

export function WorkspacePage({
  title,
  description,
  children,
}: PropsWithChildren<{ title: string; description?: string }>) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );
}

export function Panel({ title, children, action }: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>{title}</Text>
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
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8b9890"
        multiline={multiline}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        editable={!disabled}
        style={[styles.input, multiline && styles.multiline, disabled && styles.disabledInput]}
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
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

export function Notice({ children, error = false }: PropsWithChildren<{ error?: boolean }>) {
  return (
    <View style={[styles.notice, error && styles.errorNotice]}>
      <Text style={[styles.noticeText, error && styles.errorText]}>{children}</Text>
    </View>
  );
}

export function MutedText({ children }: PropsWithChildren) {
  return <Text style={styles.muted}>{children}</Text>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: 20, paddingBottom: 52, gap: 16 },
  header: { gap: 5, marginBottom: 2 },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800' },
  description: { color: colors.muted, fontSize: 13, lineHeight: 19, maxWidth: 760 },
  panel: { padding: 17, backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.border, gap: 12 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  panelTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', flexShrink: 1 },
  field: { gap: 6 },
  label: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  input: { minHeight: 43, borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, color: colors.ink, backgroundColor: colors.white, fontSize: 14 },
  disabledInput: { opacity: 0.6 },
  multiline: { minHeight: 98, textAlignVertical: 'top' },
  button: { minHeight: 42, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  secondaryButton: { backgroundColor: '#eaf2ec', borderWidth: 1, borderColor: colors.border },
  disabledButton: { opacity: 0.5 },
  buttonText: { color: colors.white, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  secondaryButtonText: { color: colors.forest },
  notice: { borderRadius: 9, backgroundColor: '#eef5ef', padding: 11 },
  errorNotice: { backgroundColor: '#fff0ef' },
  noticeText: { color: colors.forest, fontSize: 12, lineHeight: 18 },
  errorText: { color: colors.error },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  pressed: { opacity: 0.75 },
});
