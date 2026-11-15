import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Card, useAtlasTheme } from '@/components/atlas-ui';
import { WorkspacePage, Panel } from '@/components/workspace-ui';
import { useAuth } from '@/lib/auth-context';
import { dimensions, radii, spacing, typography } from '@/theme/tokens';

const ROLE_LABELS = {
  visitor: 'Visitante',
  citizen: 'Ciudadano',
  firefighter: 'Bombero',
  brigade_leader: 'Encargado de brigada',
  incident_commander: 'Mando operativo',
  super_admin: 'Administrador técnico',
} as const;

export default function OverviewScreen() {
  const { role, configured, technicalAdmin } = useAuth();
  const { colors } = useAtlasTheme();
  const operational = ['firefighter', 'brigade_leader', 'incident_commander'].includes(role);
  const links = [
    { title: 'Mapa satelital', description: 'Consulta las observaciones originales del mes seleccionado.', href: '/map' as const },
    { title: 'Calendario histórico', description: 'Explora MODIS, VIIRS y los periodos aún pendientes.', href: '/calendar' as const },
    ...(role === 'citizen'
      ? [
          { title: 'Reportar una observación', description: 'Comparte una fotografía y señala la ubicación aproximada.', href: '/report' as const },
          { title: 'Mis reportes', description: 'Sigue las actualizaciones confirmadas de tus reportes.', href: '/my-reports' as const },
        ]
      : []),
    ...(operational
      ? [{ title: 'Incidentes', description: 'Evalúa reportes y consulta las acciones autorizadas para tu función.', href: '/incidents' as const }]
      : []),
    ...(role === 'firefighter' || role === 'brigade_leader'
      ? [{ title: 'Brigada', description: 'Consulta disponibilidad, integrantes y pertenencia autorizada.', href: '/brigade' as const }]
      : []),
    ...(technicalAdmin
      ? [{ title: 'Administración técnica', description: 'Gestiona permisos autorizados sin asumir mando operativo.', href: '/admin' as const }]
      : []),
  ];

  return (
    <WorkspacePage
      title="FIREGUARD Cochabamba"
      description="Consulta pública de observaciones satelitales y gestión responsable de reportes e incidentes."
    >
      {!configured ? (
        <Panel title="Servicios de cuenta pendientes">
          <Text style={[styles.copy, { color: colors.inkMuted }]}>
            La consulta satelital pública está disponible. Autenticación y operaciones requieren Firebase configurado.
          </Text>
        </Panel>
      ) : null}
      <View style={styles.grid}>
        {links.map((item) => (
          <Pressable
            key={item.href}
            accessibilityRole="link"
            accessibilityLabel={`${item.title}. ${item.description}`}
            onPress={() => router.push(item.href)}
            style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}
          >
            <Card style={styles.card}>
              <Text style={[styles.cardTitle, { color: colors.ink }]}>{item.title}</Text>
              <Text style={[styles.copy, { color: colors.inkMuted }]}>{item.description}</Text>
              <Text style={[styles.open, { color: colors.calm }]}>Abrir →</Text>
            </Card>
          </Pressable>
        ))}
      </View>
      <Panel title="Estado de la plataforma" action={<Badge tone="calm">{ROLE_LABELS[role]}</Badge>}>
        <Text style={[styles.copy, { color: colors.inkMuted }]}>
          Una detección satelital es una observación para evaluar: no confirma un incendio y su ausencia tampoco lo descarta.
        </Text>
        {technicalAdmin ? (
          <Text style={[styles.copy, { color: colors.inkMuted }]}>
            El permiso técnico no concede mando operativo ni acceso automático a funciones de incidentes.
          </Text>
        ) : null}
      </Panel>
    </WorkspacePage>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cardPressable: { flexGrow: 1, flexBasis: dimensions.overviewCardWidth, borderRadius: radii.medium },
  card: { minHeight: dimensions.overviewCardHeight, justifyContent: 'space-between', flex: 1 },
  cardTitle: { fontFamily: typography.family.editorial, fontSize: typography.size.subheading },
  copy: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
  open: { fontFamily: typography.family.sans, fontSize: typography.size.caption, fontWeight: '800' },
  pressed: { opacity: 0.75 },
});
