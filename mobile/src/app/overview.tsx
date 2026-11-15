import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WorkspacePage, Panel } from '@/components/workspace-ui';
import { useAuth } from '@/lib/auth-context';

export default function OverviewScreen() {
  const { role, configured } = useAuth();
  const links = [
    { title: 'Mapa satelital', description: 'Consulta detecciones originales del mes seleccionado.', href: '/map' as const },
    { title: 'Calendario histórico', description: 'Explora MODIS, VIIRS y la serie armonizada.', href: '/calendar' as const },
    ...(role === 'citizen'
      ? [{ title: 'Reportar un posible incendio', description: 'Comparte una fotografía y señala la ubicación aproximada del fuego.', href: '/report' as const }]
      : []),
  ];
  return (
    <WorkspacePage
      title="FIREGUARD Cochabamba"
      description="Consulta pública de observaciones satelitales y gestión responsable de reportes e incidentes."
    >
      {!configured ? (
        <Panel title="Servicios de cuenta pendientes">
          <Text style={styles.copy}>
            La consulta satelital pública está disponible. Autenticación y operaciones requieren Firebase configurado.
          </Text>
        </Panel>
      ) : null}
      <View style={styles.grid}>
        {links.map((item) => (
          <Pressable key={item.href} onPress={() => router.push(item.href)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.copy}>{item.description}</Text>
            <Text style={styles.open}>Abrir →</Text>
          </Pressable>
        ))}
      </View>
      <Panel title="Estado de la plataforma">
        <Text style={styles.copy}>
          Rol actual: {role === 'visitor' ? 'Visitante' : role === 'citizen' ? 'Ciudadano' : 'Operador autorizado'}.
          {' '}Los focos satelitales son observaciones, no confirmaciones de incendios.
        </Text>
      </Panel>
    </WorkspacePage>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flexGrow: 1, flexBasis: 250, minHeight: 140, padding: 18, borderRadius: 14, borderWidth: 1, borderColor: '#e2e9e4', backgroundColor: '#fff', justifyContent: 'space-between', gap: 12 },
  cardTitle: { color: '#172c27', fontSize: 17, fontWeight: '800' },
  copy: { color: '#64756e', fontSize: 12, lineHeight: 18 },
  open: { color: '#144b3a', fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.75 },
});
