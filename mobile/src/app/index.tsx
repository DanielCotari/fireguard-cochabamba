import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Badge, Button, Card, ReadingNote, SensorLegend, useAtlasTheme } from '@/components/atlas-ui';
import { breakpoints, colorScale, dimensions, radii, spacing, typography } from '@/theme/tokens';

const FEATURES = [
  { index: '01', title: 'Mapa', copy: 'Consulta las observaciones satelitales disponibles, con su sensor y alcance visibles.', route: '/map' as const },
  { index: '02', title: 'Calendario', copy: 'Explora la cobertura mensual y distingue lo observado de lo que sigue pendiente.', route: '/calendar' as const },
  { index: '03', title: 'Cuenta', copy: 'Accede a las herramientas ciudadanas u operativas según tu rol.', route: '/profile' as const },
];

function ContourDrawing({ color }: { color: string }) {
  return (
    <View accessibilityLabel="Ilustración topográfica; no representa detecciones" style={[styles.contourCanvas, { backgroundColor: colorScale.bone[200] }]}>
      <View style={[styles.gridLine, styles.gridHorizontalTop, { backgroundColor: color }]} />
      <View style={[styles.gridLine, styles.gridHorizontalBottom, { backgroundColor: color }]} />
      <View style={[styles.gridLine, styles.gridVerticalLeft, { backgroundColor: color }]} />
      <View style={[styles.gridLine, styles.gridVerticalRight, { backgroundColor: color }]} />
      <View style={[styles.contour, styles.contourOne, { borderColor: color }]} />
      <View style={[styles.contour, styles.contourTwo, { borderColor: color }]} />
      <View style={[styles.contour, styles.contourThree, { borderColor: color }]} />
      <View style={[styles.contour, styles.contourFour, { borderColor: color }]} />
      <View style={[styles.contour, styles.contourFive, { borderColor: color }]} />
      <View style={styles.ember}>
        <View style={styles.emberCore} />
      </View>
      <Text style={[styles.contourCoordinate, { color: colorScale.ash[700] }]}>17° 23′ S</Text>
      <Text style={[styles.contourCoordinateEast, { color: colorScale.ash[700] }]}>66° 09′ O</Text>
      <Text style={[styles.contourCaption, { color: colorScale.ash[700] }]}>LÁMINA 01 · VALLE CENTRAL</Text>
    </View>
  );
}

export default function LandingScreen() {
  const { width } = useWindowDimensions();
  const compact = width < breakpoints.compact;
  const { colors } = useAtlasTheme();

  return (
    <ScrollView style={[styles.page, { backgroundColor: colors.canvas }]} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <View style={[styles.header, { borderBottomColor: colors.line, backgroundColor: colors.surface }]}>
        <View style={[styles.headerInner, compact && styles.headerCompact]}>
          <View style={styles.brand}>
            <View style={[styles.brandMark, { backgroundColor: colors.ink }]}><Text style={[styles.brandMarkText, { color: colors.canvas }]}>F</Text></View>
            <View>
              <Text style={[styles.brandName, { color: colors.ink }]}>FIREGUARD</Text>
              <Text style={[styles.brandPlace, { color: colors.inkMuted }]}>COCHABAMBA · BOLIVIA</Text>
            </View>
          </View>
          <View style={styles.nav}>
            <Pressable accessibilityRole="link" accessibilityLabel="Abrir mapa" onPress={() => router.push('/map')} style={styles.navLink}>
              <Text style={[styles.navText, { color: colors.ink }]}>Mapa</Text>
            </Pressable>
            <Pressable accessibilityRole="link" accessibilityLabel="Abrir calendario" onPress={() => router.push('/calendar')} style={styles.navLink}>
              <Text style={[styles.navText, { color: colors.ink }]}>Calendario</Text>
            </Pressable>
            <Button label="Iniciar sesión" variant="secondary" onPress={() => router.push('/profile')} />
          </View>
        </View>
      </View>

      <View style={[styles.hero, compact && styles.heroCompact]}>
        <View style={[styles.heroCopy, compact && styles.heroCopyCompact]}>
          <Badge tone="calm">ATLAS PÚBLICO · OBSERVACIÓN Y COORDINACIÓN</Badge>
          <Text style={[styles.heroTitle, { color: colors.ink }, compact && styles.heroTitleCompact]}>
            Leer el territorio.{'\n'}Con cuidado.
          </Text>
          <Text style={[styles.heroDescription, { color: colors.inkMuted }]}>
            FIREGUARD reúne observaciones satelitales y reportes ciudadanos para apoyar la lectura y el seguimiento de posibles incendios en Cochabamba.
          </Text>
          <View style={styles.heroActions}>
            <Button label="Explorar mapa" onPress={() => router.push('/map')} />
            <Button label="Ver calendario" variant="secondary" onPress={() => router.push('/calendar')} />
          </View>
          <Text style={[styles.scopeLine, { color: colors.inkSubtle }]}>Herramientas públicas de consulta · no es un sistema de predicción</Text>
        </View>
        <View style={[styles.heroArtWrap, compact && styles.heroArtCompact]}>
          <ContourDrawing color={colors.lineStrong} />
        </View>
      </View>

      <View style={[styles.content, { borderTopColor: colors.line }]}>
        <View style={styles.sectionIntro}>
          <Text style={[styles.eyebrow, { color: colors.attention }]}>CUADERNO DE CAMPO / 01</Text>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Una lectura situada, no una alarma.</Text>
          <Text style={[styles.sectionCopy, { color: colors.inkMuted }]}>
            Las capas describen observaciones dentro de un rectángulo piloto. No son límites oficiales de Cochabamba ni una medición directa de incendios.
          </Text>
        </View>
        <View style={[styles.featureGrid, compact && styles.featureGridCompact]}>
          {FEATURES.map((feature) => (
            <Pressable
              key={feature.index}
              accessibilityRole="link"
              accessibilityLabel={`${feature.title}: ${feature.copy}`}
              onPress={() => router.push(feature.route)}
              style={({ pressed }) => [styles.featureLink, pressed && styles.pressed]}
            >
              <Card style={styles.featureCard}>
                <Text style={[styles.featureIndex, { color: colors.attention }]}>{feature.index} / FIREGUARD</Text>
                <Text style={[styles.featureTitle, { color: colors.ink }]}>{feature.title}</Text>
                <Text style={[styles.featureCopy, { color: colors.inkMuted }]}>{feature.copy}</Text>
                <Text style={[styles.featureAction, { color: colors.calm }]}>Abrir herramienta ↗</Text>
              </Card>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.readingSection, compact && styles.readingSectionCompact]}>
        <View style={styles.readingCopy}>
          <Text style={[styles.eyebrow, { color: colors.attention }]}>CÓMO LEER UNA OBSERVACIÓN</Text>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Dos sensores. Una interpretación prudente.</Text>
          <Text style={[styles.sectionCopy, { color: colors.inkMuted }]}>
            MODIS y VIIRS observan focos de calor con resoluciones y horarios distintos. La armonización permite comparaciones mensuales, pero no elimina todas las diferencias entre sensores.
          </Text>
          <SensorLegend />
        </View>
        <View style={styles.readingCard}>
          <ReadingNote />
          <Text style={[styles.readingSmall, { color: colors.inkMuted }]}>
            La ausencia de una marca tampoco permite concluir que no haya ocurrido un incendio. Confirma la información con fuentes locales y evaluación en terreno.
          </Text>
        </View>
      </View>

      <View style={[styles.pendingBand, { backgroundColor: colors.calmSoft, borderColor: colors.line }]}>
        <Text style={[styles.pendingMark, { color: colors.calm }]}>2020—2023 / EN PROCESO</Text>
        <Text style={[styles.pendingText, { color: colors.ink }]}>
          Los archivos históricos están pendientes de descarga y procesamiento. Esos meses se muestran como pendientes, no como cero.
        </Text>
        <Button label="Consultar calendario" variant="secondary" onPress={() => router.push('/calendar')} />
      </View>

      <View style={[styles.footer, { borderTopColor: colors.line }]}>
        <Text style={[styles.footerTitle, { color: colors.ink }]}>FIREGUARD · COCHABAMBA</Text>
        <Text style={[styles.footerText, { color: colors.inkMuted }]}>
          Análisis limitado a un rectángulo piloto; no representa límites oficiales. Una detección no confirma un incendio y su ausencia no lo descarta.
        </Text>
        <Text style={[styles.footerMeta, { color: colors.inkSubtle }]}>NASA FIRMS · MODIS · VIIRS · Sin cifras simuladas</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageContent: { paddingBottom: spacing.xxl },
  header: { borderBottomWidth: dimensions.hairline },
  headerInner: { width: '100%', maxWidth: dimensions.content, minHeight: dimensions.headerHeight, alignSelf: 'center', paddingHorizontal: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  headerCompact: { paddingHorizontal: spacing.md, minHeight: dimensions.compactHeaderHeight },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandMark: { width: dimensions.brandMark, height: dimensions.brandMark, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { fontFamily: typography.family.editorial, fontSize: typography.size.heading },
  brandName: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '800', letterSpacing: 1.5 },
  brandPlace: { fontFamily: typography.family.mono, fontSize: typography.size.caption, marginTop: spacing.xxs },
  nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  navLink: { minHeight: dimensions.touchTarget, justifyContent: 'center', paddingHorizontal: spacing.xs },
  navText: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '700' },
  hero: { width: '100%', maxWidth: dimensions.content, alignSelf: 'center', minHeight: dimensions.landingHeroHeight, paddingHorizontal: spacing.xl, paddingVertical: spacing.section, flexDirection: 'row', alignItems: 'center', gap: spacing.xxl },
  heroCompact: { minHeight: 0, paddingHorizontal: spacing.md, paddingVertical: spacing.xxl, flexDirection: 'column', alignItems: 'stretch', gap: spacing.xl },
  heroCopy: { flex: 1, maxWidth: dimensions.landingHeroCopyWidth, gap: spacing.md },
  heroCopyCompact: { maxWidth: '100%' },
  heroTitle: { fontFamily: typography.family.editorial, fontSize: typography.size.display, lineHeight: typography.lineHeight.display, fontWeight: '400', marginTop: spacing.sm },
  heroTitleCompact: { fontSize: typography.size.heading, lineHeight: typography.lineHeight.heading },
  heroDescription: { maxWidth: dimensions.landingHeroCopyWidth, fontFamily: typography.family.sans, fontSize: typography.size.body, lineHeight: typography.lineHeight.body },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  scopeLine: { fontFamily: typography.family.mono, fontSize: typography.size.caption },
  heroArtWrap: { flex: 1, maxWidth: dimensions.landingHeroArtWidth, alignSelf: 'stretch', minHeight: dimensions.landingHeroArtHeight },
  heroArtCompact: { width: '100%', minHeight: dimensions.landingHeroArtCompactHeight, maxWidth: '100%' },
  contourCanvas: { flex: 1, overflow: 'hidden', borderRadius: radii.large, position: 'relative', minHeight: dimensions.landingContourCanvasHeight },
  gridLine: { position: 'absolute', opacity: 0.42 },
  gridHorizontalTop: { left: 0, right: 0, top: '28%', height: dimensions.hairline },
  gridHorizontalBottom: { left: 0, right: 0, top: '70%', height: dimensions.hairline },
  gridVerticalLeft: { top: 0, bottom: 0, left: '28%', width: dimensions.hairline },
  gridVerticalRight: { top: 0, bottom: 0, left: '70%', width: dimensions.hairline },
  contour: { position: 'absolute', borderWidth: dimensions.hairline, borderRadius: radii.pill, opacity: 0.72 },
  contourOne: { width: '105%', height: '82%', left: '-18%', top: '12%', transform: [{ rotate: '-22deg' }] },
  contourTwo: { width: '90%', height: '70%', left: '-10%', top: '18%', transform: [{ rotate: '-22deg' }] },
  contourThree: { width: '74%', height: '58%', left: '-2%', top: '24%', transform: [{ rotate: '-22deg' }] },
  contourFour: { width: '58%', height: '46%', left: '7%', top: '30%', transform: [{ rotate: '-22deg' }] },
  contourFive: { width: '42%', height: '34%', left: '16%', top: '36%', transform: [{ rotate: '-22deg' }] },
  ember: { position: 'absolute', top: '48%', left: '49%', width: spacing.lg, height: spacing.lg, borderRadius: radii.pill, backgroundColor: colorScale.ember[300], alignItems: 'center', justifyContent: 'center' },
  emberCore: { width: spacing.xs, height: spacing.xs, borderRadius: radii.pill, backgroundColor: colorScale.ember[700] },
  contourCoordinate: { position: 'absolute', top: spacing.md, left: spacing.md, fontFamily: typography.family.mono, fontSize: typography.size.caption },
  contourCoordinateEast: { position: 'absolute', right: spacing.md, bottom: spacing.xl, fontFamily: typography.family.mono, fontSize: typography.size.caption },
  contourCaption: { position: 'absolute', left: spacing.md, bottom: spacing.md, fontFamily: typography.family.mono, fontSize: typography.size.caption, letterSpacing: 1 },
  content: { width: '100%', maxWidth: dimensions.content, alignSelf: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.section, borderTopWidth: dimensions.hairline },
  sectionIntro: { maxWidth: dimensions.landingSectionCopyWidth, gap: spacing.sm, marginBottom: spacing.xl },
  eyebrow: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '700', letterSpacing: 1.2 },
  sectionTitle: { fontFamily: typography.family.editorial, fontSize: typography.size.heading, lineHeight: typography.lineHeight.heading, fontWeight: '400' },
  sectionCopy: { fontFamily: typography.family.sans, fontSize: typography.size.body, lineHeight: typography.lineHeight.body },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  featureGridCompact: { flexDirection: 'column' },
  featureLink: { flexGrow: 1, flexBasis: dimensions.landingFeatureWidth, minHeight: dimensions.touchTarget },
  featureCard: { flex: 1, minHeight: dimensions.landingFeatureHeight, justifyContent: 'space-between' },
  featureIndex: { fontFamily: typography.family.mono, fontSize: typography.size.caption, letterSpacing: 1 },
  featureTitle: { fontFamily: typography.family.editorial, fontSize: typography.size.subheading },
  featureCopy: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
  featureAction: { fontFamily: typography.family.sans, fontSize: typography.size.small, fontWeight: '700' },
  pressed: { opacity: 0.75 },
  readingSection: { width: '100%', maxWidth: dimensions.content, alignSelf: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.section, flexDirection: 'row', alignItems: 'center', gap: spacing.xxl },
  readingSectionCompact: { paddingHorizontal: spacing.md, paddingVertical: spacing.xxl, flexDirection: 'column', alignItems: 'stretch', gap: spacing.xl },
  readingCopy: { flex: 1, gap: spacing.md },
  readingCard: { flex: 1, gap: spacing.md },
  readingSmall: { fontFamily: typography.family.sans, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
  pendingBand: { width: '100%', maxWidth: dimensions.content, alignSelf: 'center', padding: spacing.lg, borderWidth: dimensions.hairline, borderRadius: radii.medium, gap: spacing.sm },
  pendingMark: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '800', letterSpacing: 1 },
  pendingText: { fontFamily: typography.family.editorial, fontSize: typography.size.subheading, lineHeight: typography.lineHeight.body },
  footer: { width: '100%', maxWidth: dimensions.content, alignSelf: 'center', marginTop: spacing.section, paddingTop: spacing.lg, paddingHorizontal: spacing.xl, borderTopWidth: dimensions.hairline, gap: spacing.sm },
  footerTitle: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '800', letterSpacing: 1 },
  footerText: { maxWidth: dimensions.landingSectionCopyWidth, fontFamily: typography.family.sans, fontSize: typography.size.caption, lineHeight: typography.lineHeight.body },
  footerMeta: { fontFamily: typography.family.mono, fontSize: typography.size.caption },
});
