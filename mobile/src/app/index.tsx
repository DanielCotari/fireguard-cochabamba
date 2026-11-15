import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
} from 'react-native';

const COLORS = {
  navy: '#10283b',
  navyDeep: '#0b1c2a',
  blue: '#183d56',
  red: '#a3312c',
  orange: '#f08c3d',
  green: '#2d8a5a',
  paper: '#f5f7f8',
  white: '#ffffff',
  ink: '#172c27',
  muted: '#64756e',
  border: '#e0e6e8',
};

const FEATURES = [
  {
    number: '01',
    title: 'Monitoreo satelital',
    description: 'Consulta detecciones de focos de calor provenientes de los sensores MODIS y VIIRS.',
    action: 'Explorar mapa',
    href: '/map' as const,
    tone: 'orange' as const,
  },
  {
    number: '02',
    title: 'Calendario histórico',
    description: 'Explora la actividad mensual disponible y compara los registros de los sensores.',
    action: 'Consultar calendario',
    href: '/calendar' as const,
    tone: 'blue' as const,
  },
  {
    number: '03',
    title: 'Reportes ciudadanos',
    description: 'Comunica una posible situación de incendio con una fotografía y ubicación aproximada.',
    action: 'Acceder al sistema',
    href: '/profile' as const,
    tone: 'red' as const,
  },
  {
    number: '04',
    title: 'Gestión de incidentes',
    description: 'Apoya la evaluación, asignación de brigadas y registro de actuaciones operativas.',
    action: 'Iniciar sesión',
    href: '/profile' as const,
    tone: 'green' as const,
  },
];

const STEPS = [
  ['01', 'Detección', 'Consulta las observaciones satelitales disponibles.'],
  ['02', 'Reporte', 'La ciudadanía comunica posibles incendios.'],
  ['03', 'Evaluación', 'Los responsables revisan cada reporte.'],
  ['04', 'Coordinación', 'Se asignan brigadas e integrantes disponibles.'],
  ['05', 'Seguimiento', 'Se registran avances y resultados de la atención.'],
];

function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <View style={styles.brand}>
      <View style={[styles.brandMark, inverse && styles.brandMarkInverse]}>
        <Text style={styles.brandMarkText}>F</Text>
      </View>
      <View>
        <Text style={[styles.brandName, inverse && styles.inverseText]}>FIREGUARD</Text>
        <Text style={[styles.brandLocation, inverse && styles.inverseMuted]}>COCHABAMBA · BOLIVIA</Text>
      </View>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  secondary = false,
  light = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  light?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        light && styles.lightButton,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[
        styles.buttonText,
        secondary && styles.secondaryButtonText,
        light && styles.lightButtonText,
      ]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function LandingScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 820;
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const aboutOffset = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const goToAbout = () => {
    setMenuOpen(false);
    scrollRef.current?.scrollTo({ y: aboutOffset.current, animated: true });
  };

  const goTo = (href: '/map' | '/calendar' | '/profile') => {
    setMenuOpen(false);
    router.push(href);
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={[styles.headerInner, compact && styles.headerInnerCompact]}>
          <Pressable accessibilityRole="link" accessibilityLabel="FIREGUARD, ir al inicio" onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}>
            <Brand />
          </Pressable>
          {compact ? (
            <View style={styles.mobileHeaderActions}>
              <PrimaryButton label="Iniciar sesión" onPress={() => goTo('/profile')} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
                accessibilityState={{ expanded: menuOpen }}
                onPress={() => setMenuOpen((open) => !open)}
                style={styles.menuButton}
              >
                <Text style={styles.menuButtonText}>{menuOpen ? 'Cerrar' : 'Menú'}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.navLinks}>
              <Pressable accessibilityRole="link" onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}><Text style={styles.navLinkActive}>Inicio</Text></Pressable>
              <Pressable accessibilityRole="link" onPress={() => goTo('/map')}><Text style={styles.navLink}>Mapa satelital</Text></Pressable>
              <Pressable accessibilityRole="link" onPress={() => goTo('/calendar')}><Text style={styles.navLink}>Calendario</Text></Pressable>
              <Pressable accessibilityRole="link" onPress={goToAbout}><Text style={styles.navLink}>Acerca del sistema</Text></Pressable>
              <PrimaryButton label="Iniciar sesión" onPress={() => goTo('/profile')} />
            </View>
          )}
        </View>
        {compact && menuOpen ? (
          <View style={styles.mobileMenu}>
            <Pressable accessibilityRole="link" onPress={() => { setMenuOpen(false); scrollRef.current?.scrollTo({ y: 0, animated: true }); }}><Text style={styles.mobileMenuLink}>Inicio</Text></Pressable>
            <Pressable accessibilityRole="link" onPress={() => goTo('/map')}><Text style={styles.mobileMenuLink}>Mapa satelital</Text></Pressable>
            <Pressable accessibilityRole="link" onPress={() => goTo('/calendar')}><Text style={styles.mobileMenuLink}>Calendario</Text></Pressable>
            <Pressable accessibilityRole="link" onPress={goToAbout}><Text style={styles.mobileMenuLink}>Acerca del sistema</Text></Pressable>
          </View>
        ) : null}
      </View>

      <View style={[styles.hero, compact && styles.heroCompact]}>
        <View style={[styles.heroCopy, compact && styles.heroCopyCompact]}>
          <View style={styles.eyebrow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrowText}>MONITOREO Y COORDINACIÓN · COCHABAMBA</Text>
          </View>
          <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>
            La tecnología al servicio de la prevención y respuesta ante incendios.
          </Text>
          <Text style={styles.heroDescription}>
            FIREGUARD integra información satelital y reportes ciudadanos para facilitar el seguimiento de posibles incendios y apoyar la coordinación de los equipos de respuesta.
          </Text>
          <View style={styles.heroActions}>
            <PrimaryButton label="Explorar mapa satelital" onPress={() => goTo('/map')} />
            <PrimaryButton label="Iniciar sesión" onPress={() => goTo('/profile')} secondary />
          </View>
          <Text style={styles.heroFootnote}>El mapa y el calendario son de consulta pública. No necesitas una cuenta para explorarlos.</Text>
        </View>

        <View style={[styles.monitorPanel, compact && styles.monitorPanelCompact]} accessibilityLabel="Ilustración conceptual de monitoreo satelital">
          <View style={styles.monitorTopline}>
            <View>
              <Text style={styles.monitorOverline}>CENTRO DE MONITOREO</Text>
              <Text style={styles.monitorTitle}>Cochabamba</Text>
            </View>
            <View style={styles.liveTag}><View style={styles.liveDot} /><Text style={styles.liveTagText}>VISTA PÚBLICA</Text></View>
          </View>
          <View style={styles.radar}>
            <View style={[styles.radarRing, styles.radarRingOuter]} />
            <View style={[styles.radarRing, styles.radarRingMiddle]} />
            <View style={[styles.radarRing, styles.radarRingInner]} />
            <View style={styles.radarAxisHorizontal} />
            <View style={styles.radarAxisVertical} />
            <View style={styles.radarSweep} />
            <View style={[styles.hotspot, styles.hotspotOne]} />
            <View style={[styles.hotspot, styles.hotspotTwo]} />
            <View style={[styles.hotspot, styles.hotspotThree]} />
            <View style={styles.radarCenter}><Text style={styles.radarCenterText}>FG</Text></View>
          </View>
          <View style={styles.monitorLegend}>
            <View style={styles.sensorLabel}><View style={[styles.sensorDot, { backgroundColor: COLORS.orange }]} /><Text style={styles.sensorText}>MODIS</Text></View>
            <View style={styles.sensorLabel}><View style={[styles.sensorDot, { backgroundColor: '#67b6d2' }]} /><Text style={styles.sensorText}>VIIRS</Text></View>
            <Text style={styles.monitorCoordinates}>17.55°–17.15° S · 66.35°–65.95° O</Text>
          </View>
          <View style={styles.monitorCallout}>
            <Text style={styles.calloutMark}>!</Text>
            <Text style={styles.calloutText}>Visualización conceptual · sin detecciones simuladas</Text>
          </View>
        </View>
      </View>

      <View style={styles.featureSection}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionKicker}>UNA PLATAFORMA, DISTINTAS HERRAMIENTAS</Text>
          <Text style={[styles.sectionTitle, compact && styles.sectionTitleCompact]}>Monitoreo y coordinación en un solo lugar.</Text>
          <Text style={styles.sectionDescription}>Información pública para explorar y herramientas operativas para usuarios autorizados.</Text>
        </View>
        <View style={[styles.featureGrid, compact && styles.featureGridCompact]}>
          {FEATURES.map((feature) => (
            <View key={feature.number} style={styles.featureCard}>
              <View style={styles.featureTop}>
                <View style={[styles.featureIcon, feature.tone === 'orange' ? styles.iconOrange : feature.tone === 'blue' ? styles.iconBlue : feature.tone === 'red' ? styles.iconRed : styles.iconGreen]}>
                  <Text style={styles.featureIconText}>{feature.number}</Text>
                </View>
                <Text style={styles.featureIndex}>FIREGUARD / {feature.number}</Text>
              </View>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureDescription}>{feature.description}</Text>
              <Pressable accessibilityRole="link" onPress={() => goTo(feature.href)} style={styles.featureAction}>
                <Text style={styles.featureActionText}>{feature.action}</Text>
                <Text style={styles.featureArrow}>↗</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>

      <View
        style={[styles.processSection, compact && styles.processSectionCompact]}
        onLayout={(event) => { aboutOffset.current = event.nativeEvent.layout.y; }}
      >
        <View style={[styles.processIntro, compact && styles.processIntroCompact]}>
          <Text style={styles.sectionKickerLight}>DEL AVISO AL SEGUIMIENTO</Text>
          <Text style={[styles.processTitle, compact && styles.sectionTitleCompact]}>Un flujo claro para actuar con información.</Text>
          <Text style={styles.processDescription}>Cada etapa conserva su propósito: observar, reportar, evaluar y coordinar. Una detección satelital no se convierte automáticamente en un incidente.</Text>
        </View>
        <View style={[styles.steps, compact && styles.stepsCompact]}>
          {STEPS.map(([number, title, description], index) => (
            <View key={number} style={[styles.step, compact && styles.stepCompact]}>
              <View style={styles.stepMarker}>
                <Text style={styles.stepNumber}>{number}</Text>
                {index < STEPS.length - 1 ? <View style={styles.stepLine} /> : null}
              </View>
              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>{title}</Text>
                <Text style={styles.stepDescription}>{description}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.satelliteSection, compact && styles.satelliteSectionCompact]}>
        <View style={styles.satelliteCopy}>
          <Text style={styles.sectionKicker}>OBSERVACIÓN SATELITAL</Text>
          <Text style={[styles.sectionTitle, compact && styles.sectionTitleCompact]}>Dos sensores. Una lectura cuidadosa.</Text>
          <Text style={styles.satelliteDescription}>
            MODIS y VIIRS proporcionan observaciones de focos de calor desde satélites. Sus sensores y escalas de observación son distintos; los datos sirven como referencia y no reemplazan la verificación en terreno.
          </Text>
          <View style={styles.sensorCards}>
            <View style={styles.sensorCard}><View style={[styles.sensorCardDot, { backgroundColor: COLORS.orange }]} /><View><Text style={styles.sensorCardTitle}>MODIS</Text><Text style={styles.sensorCardText}>Terra · Aqua</Text></View></View>
            <View style={styles.sensorCard}><View style={[styles.sensorCardDot, { backgroundColor: '#4795b8' }]} /><View><Text style={styles.sensorCardTitle}>VIIRS</Text><Text style={styles.sensorCardText}>Suomi-NPP</Text></View></View>
          </View>
          <PrimaryButton label="Consultar calendario" onPress={() => goTo('/calendar')} secondary />
        </View>
        <View style={styles.cautionCard}>
          <View style={styles.cautionIcon}><Text style={styles.cautionIconText}>!</Text></View>
          <Text style={styles.cautionLabel}>IMPORTANTE</Text>
          <Text style={styles.cautionText}>
            Una detección satelital no confirma por sí sola la existencia de un incendio. Asimismo, la ausencia de detecciones no descarta un posible incendio.
          </Text>
          <View style={styles.pendingData}>
            <View style={styles.pendingDot} />
            <Text style={styles.pendingText}>Los datos históricos 2020–2023 están pendientes de descarga y procesamiento.</Text>
          </View>
        </View>
      </View>

      <View style={[styles.cta, compact && styles.ctaCompact]}>
        <View style={styles.ctaCopy}>
          <Text style={styles.ctaKicker}>PREVENCIÓN · INFORMACIÓN · COORDINACIÓN</Text>
          <Text style={[styles.ctaTitle, compact && styles.sectionTitleCompact]}>Forma parte de una comunidad más preparada.</Text>
          <Text style={styles.ctaDescription}>Consulta información pública o crea una cuenta ciudadana para contribuir comunicando posibles situaciones de incendio.</Text>
        </View>
        <View style={styles.ctaActions}>
          <PrimaryButton label="Consultar mapa" onPress={() => goTo('/map')} light />
          <PrimaryButton label="Iniciar sesión" onPress={() => goTo('/profile')} secondary />
        </View>
      </View>

      <View style={styles.footer}>
        <View style={[styles.footerTop, compact && styles.footerTopCompact]}>
          <View style={styles.footerBrand}>
            <Brand inverse />
            <Text style={styles.footerDescription}>Plataforma de consulta satelital y coordinación de reportes de posibles incendios en Cochabamba.</Text>
          </View>
          <View style={styles.footerLinks}>
            <Text style={styles.footerHeading}>EXPLORAR</Text>
            <Pressable onPress={() => goTo('/map')}><Text style={styles.footerLink}>Mapa satelital</Text></Pressable>
            <Pressable onPress={() => goTo('/calendar')}><Text style={styles.footerLink}>Calendario histórico</Text></Pressable>
            <Pressable onPress={() => goTo('/profile')}><Text style={styles.footerLink}>Iniciar sesión</Text></Pressable>
          </View>
          <View style={styles.footerNote}>
            <Text style={styles.footerHeading}>USO RESPONSABLE</Text>
            <Text style={styles.footerDescription}>Las detecciones satelitales son observaciones y no sustituyen la evaluación ni la verificación en terreno.</Text>
          </View>
        </View>
        <View style={styles.footerBottom}>
          <Text style={styles.footerCopyright}>© {new Date().getFullYear()} FIREGUARD Cochabamba · Todos los derechos reservados</Text>
          <Text style={styles.footerCopyright}>Información pública · Sin datos de muestra</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.paper },
  pageContent: { paddingBottom: 0 },
  header: { backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border, zIndex: 2 },
  headerInner: { width: '100%', maxWidth: 1240, minHeight: 78, alignSelf: 'center', paddingHorizontal: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 20 },
  headerInnerCompact: { minHeight: 70, paddingHorizontal: 18, flexWrap: 'wrap' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center' },
  brandMarkInverse: { backgroundColor: '#fff' },
  brandMarkText: { color: COLORS.white, fontSize: 22, fontWeight: '900' },
  brandName: { color: COLORS.navy, fontSize: 14, fontWeight: '900', letterSpacing: 1.2 },
  brandLocation: { color: COLORS.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 3 },
  navLinks: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  navLink: { color: '#52616a', fontSize: 12, fontWeight: '700' },
  navLinkActive: { color: COLORS.red, fontSize: 12, fontWeight: '800' },
  button: { minHeight: 44, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 7, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: COLORS.white, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#aebbc2' },
  secondaryButtonText: { color: COLORS.navy },
  lightButton: { backgroundColor: COLORS.white },
  lightButtonText: { color: COLORS.navy },
  pressed: { opacity: 0.78 },
  mobileHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 10 },
  menuButtonText: { color: COLORS.navy, fontSize: 12, fontWeight: '800' },
  mobileMenu: { paddingHorizontal: 20, paddingBottom: 14, gap: 14, backgroundColor: COLORS.white },
  mobileMenuLink: { color: COLORS.navy, fontSize: 13, fontWeight: '700', paddingVertical: 4 },
  hero: { width: '100%', minHeight: 568, paddingHorizontal: 28, paddingVertical: 60, backgroundColor: COLORS.navyDeep, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 48, overflow: 'hidden' },
  heroCompact: { minHeight: 0, paddingHorizontal: 20, paddingVertical: 38, flexDirection: 'column', alignItems: 'stretch', gap: 34 },
  heroCopy: { flex: 1, maxWidth: 560 },
  heroCopyCompact: { maxWidth: '100%' },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 20 },
  eyebrowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.orange },
  eyebrowText: { color: '#d9a77f', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  heroTitle: { color: COLORS.white, fontSize: 48, lineHeight: 55, fontWeight: '800', letterSpacing: -1.2, maxWidth: 590 },
  heroTitleCompact: { fontSize: 36, lineHeight: 42 },
  heroDescription: { color: '#c4d0d6', fontSize: 15, lineHeight: 25, maxWidth: 540, marginTop: 18 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 27 },
  heroFootnote: { color: '#8fa3ad', fontSize: 11, lineHeight: 17, marginTop: 17 },
  monitorPanel: { width: 420, maxWidth: '100%', padding: 21, borderRadius: 16, borderWidth: 1, borderColor: '#335064', backgroundColor: '#132c3d', overflow: 'hidden' },
  monitorPanelCompact: { width: '100%', alignSelf: 'center' },
  monitorTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  monitorOverline: { color: '#8da6b3', fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  monitorTitle: { color: COLORS.white, fontSize: 18, fontWeight: '800', marginTop: 5 },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#203c4b', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#66b789' },
  liveTagText: { color: '#b5c8cb', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  radar: { height: 280, marginVertical: 13, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#102738' },
  radarRing: { position: 'absolute', borderRadius: 300, borderWidth: 1, borderColor: '#355768' },
  radarRingOuter: { width: 255, height: 255 },
  radarRingMiddle: { width: 178, height: 178 },
  radarRingInner: { width: 94, height: 94 },
  radarAxisHorizontal: { position: 'absolute', height: 1, left: 18, right: 18, backgroundColor: '#294556' },
  radarAxisVertical: { position: 'absolute', width: 1, top: 10, bottom: 10, backgroundColor: '#294556' },
  radarSweep: { position: 'absolute', width: 130, height: 130, left: '50%', top: '50%', backgroundColor: 'rgba(45, 138, 90, 0.13)', borderTopWidth: 1, borderTopColor: '#478d72', transform: [{ translateY: -130 }, { rotate: '25deg' }] },
  radarCenter: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#f3a185' },
  radarCenterText: { color: COLORS.white, fontSize: 9, fontWeight: '900' },
  hotspot: { position: 'absolute', width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.orange, borderWidth: 2, borderColor: '#ffd0a5' },
  hotspotOne: { top: 75, right: '29%' },
  hotspotTwo: { bottom: 73, left: '31%', backgroundColor: '#d45f43', borderColor: '#f3a185' },
  hotspotThree: { top: '43%', left: '23%' },
  monitorLegend: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: '#294556', paddingTop: 12 },
  sensorLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sensorDot: { width: 7, height: 7, borderRadius: 4 },
  sensorText: { color: '#d0dce1', fontSize: 9, fontWeight: '700' },
  monitorCoordinates: { flexGrow: 1, color: '#829ba8', fontSize: 8, textAlign: 'right' },
  monitorCallout: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 9, borderRadius: 6, backgroundColor: '#203844' },
  calloutMark: { color: '#f4b36e', fontSize: 13, fontWeight: '900' },
  calloutText: { flex: 1, color: '#b8c5c9', fontSize: 9, lineHeight: 14 },
  featureSection: { paddingHorizontal: 28, paddingVertical: 82, maxWidth: 1240, width: '100%', alignSelf: 'center' },
  sectionHeading: { maxWidth: 700, marginBottom: 30 },
  sectionKicker: { color: COLORS.red, fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginBottom: 12 },
  sectionTitle: { color: COLORS.navy, fontSize: 34, lineHeight: 41, fontWeight: '800', letterSpacing: -0.5 },
  sectionTitleCompact: { fontSize: 29, lineHeight: 35 },
  sectionDescription: { color: COLORS.muted, fontSize: 13, lineHeight: 21, marginTop: 11 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  featureGridCompact: { flexDirection: 'column' },
  featureCard: { flexGrow: 1, flexBasis: 250, minHeight: 230, padding: 20, borderWidth: 1, borderColor: COLORS.border, borderRadius: 11, backgroundColor: COLORS.white, justifyContent: 'space-between', gap: 16 },
  featureTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  featureIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconOrange: { backgroundColor: '#fff0e4' },
  iconBlue: { backgroundColor: '#e8f1f5' },
  iconRed: { backgroundColor: '#f9e9e7' },
  iconGreen: { backgroundColor: '#e7f2eb' },
  featureIconText: { color: COLORS.navy, fontSize: 11, fontWeight: '900' },
  featureIndex: { color: '#9aa8ad', fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
  featureTitle: { color: COLORS.navy, fontSize: 16, fontWeight: '800' },
  featureDescription: { color: COLORS.muted, fontSize: 12, lineHeight: 19, flexGrow: 1 },
  featureAction: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#edf0f1' },
  featureActionText: { color: COLORS.red, fontSize: 11, fontWeight: '800' },
  featureArrow: { color: COLORS.red, fontSize: 14, fontWeight: '800' },
  processSection: { paddingHorizontal: 28, paddingVertical: 70, backgroundColor: COLORS.navy, flexDirection: 'row', justifyContent: 'center', gap: 70 },
  processSectionCompact: { paddingHorizontal: 20, paddingVertical: 50, flexDirection: 'column', gap: 32 },
  processIntro: { maxWidth: 400, flex: 1, justifyContent: 'center' },
  processIntroCompact: { maxWidth: '100%' },
  sectionKickerLight: { color: '#f0a36d', fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginBottom: 12 },
  processTitle: { color: COLORS.white, fontSize: 33, lineHeight: 40, fontWeight: '800' },
  processDescription: { color: '#b6c6ce', fontSize: 12, lineHeight: 20, marginTop: 14 },
  steps: { width: 450, maxWidth: '100%', gap: 0 },
  stepsCompact: { width: '100%' },
  step: { flexDirection: 'row', gap: 14, minHeight: 70 },
  stepCompact: { minHeight: 76 },
  stepMarker: { alignItems: 'center', width: 34 },
  stepNumber: { color: '#f0a36d', fontSize: 10, fontWeight: '900', paddingTop: 2 },
  stepLine: { width: 1, flex: 1, marginTop: 7, backgroundColor: '#426072' },
  stepCopy: { flex: 1, paddingBottom: 15 },
  stepTitle: { color: COLORS.white, fontSize: 13, fontWeight: '800' },
  stepDescription: { color: '#aebfc8', fontSize: 11, lineHeight: 17, marginTop: 4 },
  satelliteSection: { width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: 28, paddingVertical: 82, flexDirection: 'row', alignItems: 'center', gap: 65 },
  satelliteSectionCompact: { paddingHorizontal: 20, paddingVertical: 52, flexDirection: 'column', alignItems: 'stretch', gap: 28 },
  satelliteCopy: { flex: 1, maxWidth: 580, gap: 14 },
  satelliteDescription: { color: COLORS.muted, fontSize: 13, lineHeight: 22 },
  sensorCards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 5 },
  sensorCard: { minWidth: 145, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, backgroundColor: COLORS.white },
  sensorCardDot: { width: 9, height: 9, borderRadius: 5 },
  sensorCardTitle: { color: COLORS.navy, fontSize: 11, fontWeight: '900' },
  sensorCardText: { color: COLORS.muted, fontSize: 9, marginTop: 2 },
  cautionCard: { flex: 1, maxWidth: 440, padding: 23, borderRadius: 12, borderWidth: 1, borderColor: '#f0d7c4', backgroundColor: '#fffaf6', gap: 12 },
  cautionIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8e6d6' },
  cautionIconText: { color: '#a44a2d', fontSize: 17, fontWeight: '900' },
  cautionLabel: { color: '#a44a2d', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  cautionText: { color: COLORS.navy, fontSize: 14, fontWeight: '700', lineHeight: 22 },
  pendingData: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: '#f0e2d7', paddingTop: 11, marginTop: 3 },
  pendingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.orange, marginTop: 4 },
  pendingText: { flex: 1, color: '#725c4d', fontSize: 10, lineHeight: 16 },
  cta: { marginHorizontal: 28, marginBottom: 72, padding: 34, borderRadius: 14, backgroundColor: COLORS.red, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 30 },
  ctaCompact: { marginHorizontal: 16, marginBottom: 48, padding: 23, flexDirection: 'column', alignItems: 'stretch' },
  ctaCopy: { flex: 1, maxWidth: 650 },
  ctaKicker: { color: '#ffd0b5', fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginBottom: 10 },
  ctaTitle: { color: COLORS.white, fontSize: 30, lineHeight: 36, fontWeight: '800' },
  ctaDescription: { color: '#f4d8cf', fontSize: 12, lineHeight: 20, marginTop: 10 },
  ctaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  footer: { backgroundColor: COLORS.navyDeep, paddingHorizontal: 28, paddingTop: 38, paddingBottom: 15 },
  footerTop: { maxWidth: 1184, width: '100%', alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 38, paddingBottom: 29 },
  footerTopCompact: { flexDirection: 'column', gap: 24 },
  footerBrand: { maxWidth: 340, gap: 12 },
  footerDescription: { color: '#9eafb8', fontSize: 10, lineHeight: 17 },
  inverseText: { color: COLORS.white },
  inverseMuted: { color: '#9eafb8' },
  footerLinks: { gap: 10 },
  footerHeading: { color: '#d2a183', fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginBottom: 2 },
  footerLink: { color: '#d3dde1', fontSize: 10 },
  footerNote: { maxWidth: 250, gap: 9 },
  footerBottom: { width: '100%', maxWidth: 1184, alignSelf: 'center', borderTopWidth: 1, borderTopColor: '#243847', paddingTop: 13, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  footerCopyright: { color: '#788f9a', fontSize: 9 },
});
