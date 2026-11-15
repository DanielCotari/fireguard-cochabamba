import { router, Slot, usePathname } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { PropsWithChildren } from 'react';
import { useAuth, type AppRole } from '@/lib/auth-context';

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
  const compact = width < 900;
  const pathname = usePathname();
  const { user, role, technicalAdmin, configured, loading } = useAuth();
  const items = NAVIGATION.filter((item) => item.allowed(role, technicalAdmin));

  const navigationItem = (item: NavigationItem, compactMode: boolean) => {
    const active = pathname === item.href || (item.href === '/calendar' && pathname === '/');
    return (
      <Pressable
        key={item.href}
        accessibilityRole="link"
        accessibilityState={{ selected: active }}
        onPress={() => router.push(item.href)}
        style={({ pressed }) => [
          compactMode ? styles.mobileItem : styles.desktopItem,
          active && (compactMode ? styles.mobileItemActive : styles.desktopItemActive),
          pressed && styles.pressed,
        ]}
      >
        <Text style={[compactMode ? styles.mobileLabel : styles.desktopLabel, active && styles.activeLabel]}>
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.shell, !compact && styles.desktopShell]}>
      {!compact ? (
        <View style={styles.sidebar}>
          <View style={styles.brand}>
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>F</Text></View>
            <View>
              <Text style={styles.brandName}>FIREGUARD</Text>
              <Text style={styles.brandLocation}>BOLIVIA</Text>
            </View>
          </View>
          <Text style={styles.navHeading}>PLATAFORMA</Text>
          <ScrollView contentContainerStyle={styles.navList}>{items.map((item) => navigationItem(item, false))}</ScrollView>
          <View style={styles.accountBlock}>
            <Text style={styles.accountName} numberOfLines={1}>{user?.displayName || user?.email || 'Acceso público'}</Text>
            <Text style={styles.accountRole}>{loading ? 'Cargando cuenta…' : !configured ? 'Servicios sin configurar' : ROLE_LABELS[role]}</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.page}>{children ?? <Slot />}</View>
      {compact ? (
        <View style={styles.mobileNav}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileNavContent}>
            {items.map((item) => navigationItem(item, true))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#f4f7f4' },
  desktopShell: { flexDirection: 'row' },
  sidebar: { width: 224, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: '#e2e9e4', padding: 18 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, marginBottom: 26 },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#144b3a', alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  brandName: { color: '#172c27', fontSize: 13, fontWeight: '900', letterSpacing: 1.4 },
  brandLocation: { color: '#64756e', fontSize: 9, fontWeight: '700', letterSpacing: 1.3, marginTop: 3 },
  navHeading: { color: '#7c8b83', fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 9 },
  navList: { gap: 5 },
  desktopItem: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 9 },
  desktopItemActive: { backgroundColor: '#eaf4ed' },
  desktopLabel: { color: '#52665a', fontSize: 13, fontWeight: '600' },
  activeLabel: { color: '#144b3a', fontWeight: '800' },
  accountBlock: { borderTopWidth: 1, borderTopColor: '#e2e9e4', paddingTop: 14, marginTop: 'auto' },
  accountName: { color: '#172c27', fontSize: 11, fontWeight: '700' },
  accountRole: { color: '#64756e', fontSize: 10, marginTop: 4 },
  page: { flex: 1, minWidth: 0 },
  mobileNav: { borderTopWidth: 1, borderTopColor: '#e2e9e4', backgroundColor: '#fff', paddingVertical: 7 },
  mobileNavContent: { flexDirection: 'row', gap: 5, paddingHorizontal: 8 },
  mobileItem: { minWidth: 70, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9 },
  mobileItemActive: { backgroundColor: '#eaf4ed' },
  mobileLabel: { color: '#52665a', fontSize: 10, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
