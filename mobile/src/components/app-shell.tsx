import { router, Slot, usePathname } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { PropsWithChildren } from 'react';
import { useAuth, type AppRole } from '@/lib/auth-context';
import { useAtlasTheme } from '@/components/atlas-ui';
import { breakpoints, dimensions, radii, spacing, typography } from '@/theme/tokens';

type NavigationItem = {
  label: string;
  href: '/overview' | '/map' | '/calendar' | '/report' | '/my-reports' | '/incidents' | '/brigade' | '/admin' | '/profile';
  allowed: (role: AppRole, technicalAdmin: boolean) => boolean;
};

const NAVIGATION: NavigationItem[] = [
  { label: 'Inicio', href: '/overview', allowed: () => true },
  { label: 'Mapa', href: '/map', allowed: () => true },
  { label: 'Calendario', href: '/calendar', allowed: () => true },
  { label: 'Reportar', href: '/report', allowed: (role) => role === 'citizen' },
  { label: 'Mis reportes', href: '/my-reports', allowed: (role) => role === 'citizen' },
  { label: 'Incidentes', href: '/incidents', allowed: (role) => ['firefighter', 'brigade_leader', 'incident_commander'].includes(role) },
  { label: 'Brigada', href: '/brigade', allowed: (role) => ['firefighter', 'brigade_leader'].includes(role) },
  { label: 'Administración', href: '/admin', allowed: (_role, technicalAdmin) => technicalAdmin },
  { label: 'Perfil', href: '/profile', allowed: () => true },
];

const ROLE_LABELS: Record<AppRole, string> = {
  visitor: 'Visitante',
  citizen: 'Ciudadano',
  firefighter: 'Bombero',
  brigade_leader: 'Encargado de brigada',
  incident_commander: 'Mando operativo',
  super_admin: 'Administrador técnico',
};

export function AppShell({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions();
  const compact = width < breakpoints.desktopNavigation;
  const pathname = usePathname();
  const { user, role, technicalAdmin, configured, loading } = useAuth();
  const { colors } = useAtlasTheme();
  const standalone = pathname === '/' || (pathname === '/profile' && !user);
  const items = NAVIGATION.filter((item) => item.allowed(role, technicalAdmin));

  const navigationItem = (item: NavigationItem, compactMode: boolean) => {
    const active = pathname === item.href || (item.href === '/calendar' && pathname === '/');
    return (
      <Pressable
        key={item.href}
        accessibilityRole="link"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: active }}
        onPress={() => router.push(item.href)}
        style={({ pressed }) => [
          compactMode ? styles.mobileItem : styles.desktopItem,
          active && { backgroundColor: colors.calmSoft },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[compactMode ? styles.mobileLabel : styles.desktopLabel, { color: active ? colors.calm : colors.inkMuted }]}>
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.shell, { backgroundColor: colors.canvas }, !compact && styles.desktopShell]}>
      {!compact && !standalone ? (
        <View style={[styles.sidebar, { backgroundColor: colors.surface, borderRightColor: colors.line }]}>
          <View style={styles.brand}>
            <View style={[styles.brandMark, { backgroundColor: colors.ink }]}><Text style={[styles.brandMarkText, { color: colors.surface }]}>F</Text></View>
            <View>
              <Text style={[styles.brandName, { color: colors.ink }]}>FIREGUARD</Text>
              <Text style={[styles.brandLocation, { color: colors.inkMuted }]}>COCHABAMBA · BOLIVIA</Text>
            </View>
          </View>
          <Text style={[styles.navHeading, { color: colors.inkSubtle }]}>PLATAFORMA</Text>
          <ScrollView contentContainerStyle={styles.navList}>{items.map((item) => navigationItem(item, false))}</ScrollView>
          <View style={[styles.accountBlock, { borderTopColor: colors.line }]}>
            <Text style={[styles.accountName, { color: colors.ink }]} numberOfLines={1}>{user?.displayName || user?.email || 'Acceso público'}</Text>
            <Text style={[styles.accountRole, { color: colors.inkMuted }]}>{loading ? 'Cargando cuenta…' : !configured ? 'Servicios sin configurar' : ROLE_LABELS[role]}</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.page}>{children ?? <Slot />}</View>
      {compact && !standalone ? (
      <View style={[styles.mobileNav, { borderTopColor: colors.line, backgroundColor: colors.surface }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileNavContent}>
            {items.map((item) => navigationItem(item, true))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  desktopShell: { flexDirection: 'row' },
  sidebar: { width: dimensions.sidebar, borderRightWidth: dimensions.hairline, padding: spacing.md },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs, marginBottom: spacing.xl },
  brandMark: { width: dimensions.brandMark, height: dimensions.brandMark, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { fontFamily: typography.family.editorial, fontSize: typography.size.heading },
  brandName: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '800', letterSpacing: 1.4 },
  brandLocation: { fontFamily: typography.family.mono, fontSize: typography.size.caption, letterSpacing: 0.6, marginTop: spacing.xxs },
  navHeading: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '800', letterSpacing: 1, marginBottom: spacing.xs },
  navList: { gap: spacing.xxs },
  desktopItem: { minHeight: dimensions.touchTarget, justifyContent: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.small },
  desktopLabel: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '600' },
  accountBlock: { borderTopWidth: dimensions.hairline, paddingTop: spacing.md, marginTop: 'auto' },
  accountName: { fontFamily: typography.family.sans, fontSize: typography.size.caption, fontWeight: '700' },
  accountRole: { fontFamily: typography.family.sans, fontSize: typography.size.caption, marginTop: spacing.xxs },
  page: { flex: 1, minWidth: 0 },
  mobileNav: { borderTopWidth: dimensions.hairline, paddingVertical: spacing.xxs },
  mobileNavContent: { flexDirection: 'row', gap: spacing.xxs, paddingHorizontal: spacing.xs },
  mobileItem: { minWidth: dimensions.navigationTabWidth, minHeight: dimensions.touchTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.small },
  mobileLabel: { fontFamily: typography.family.sans, fontSize: typography.size.caption, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
