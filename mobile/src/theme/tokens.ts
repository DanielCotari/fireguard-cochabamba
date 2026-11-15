export const colorScale = {
  ash: {
    50: '#F6F3ED',
    100: '#EAE5DA',
    200: '#D8D0C2',
    300: '#B9B0A1',
    500: '#81796D',
    700: '#514C44',
    900: '#292D2A',
  },
  bone: {
    50: '#FBF9F4',
    100: '#F2EDE3',
    200: '#E7DFD1',
    300: '#D9CEBD',
    500: '#B6A790',
  },
  ember: {
    100: '#F7E5D7',
    300: '#D99A70',
    500: '#B85D3F',
    700: '#873F2C',
    900: '#54291F',
  },
  amber: {
    100: '#F8EED8',
    300: '#E0B56D',
    500: '#D39A55',
    700: '#875A22',
  },
  moss: {
    100: '#E4EAE1',
    300: '#91A18A',
    500: '#526C5B',
    700: '#354A3D',
    900: '#25362D',
  },
  glacier: {
    100: '#E3EBEC',
    300: '#91AEB0',
    500: '#56777A',
    700: '#38575A',
  },
} as const;

export const themeTokens = {
  light: {
    colors: {
      canvas: colorScale.bone[100],
      surface: colorScale.bone[50],
      surfaceRaised: '#FFFFFF',
      ink: colorScale.ash[900],
      inkMuted: colorScale.ash[700],
      inkSubtle: colorScale.ash[500],
      line: colorScale.ash[200],
      lineStrong: colorScale.ash[300],
      attention: colorScale.ember[700],
      attentionSoft: colorScale.ember[100],
      calm: colorScale.moss[700],
      calmSoft: colorScale.moss[100],
      modis: colorScale.ember[700],
      viirs: colorScale.glacier[700],
      focus: colorScale.glacier[700],
      overlay: 'rgba(41, 45, 42, 0.72)',
    },
  },
  dark: {
    colors: {
      canvas: '#202522',
      surface: '#292F2B',
      surfaceRaised: '#323A35',
      ink: '#F2EDE3',
      inkMuted: '#D0C8BA',
      inkSubtle: '#AAA293',
      line: '#4C554F',
      lineStrong: '#68736B',
      attention: '#E4A17D',
      attentionSoft: '#4B3028',
      calm: '#B4C4AA',
      calmSoft: '#34443A',
      modis: '#E4A17D',
      viirs: '#A8C6C8',
      focus: '#A8C6C8',
      overlay: 'rgba(0, 0, 0, 0.72)',
    },
  },
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  section: 64,
} as const;

export const breakpoints = {
  compact: 820,
  desktopNavigation: 900,
} as const;

export const dimensions = {
  content: 1240,
  wideContent: 1400,
  profileContent: 1180,
  workspaceContent: 1100,
  workspaceDescription: 760,
  overviewCardWidth: 250,
  overviewCardHeight: 180,
  reportMapHeight: 300,
  photoPreviewSize: 82,
  coordinateFieldWidth: 180,
  sidebar: 260,
  touchTarget: 44,
  navigationTabWidth: 88,
  brandMark: 40,
  headerHeight: 76,
  compactHeaderHeight: 68,
  landingHeroHeight: 560,
  landingHeroCopyWidth: 600,
  landingHeroArtWidth: 510,
  landingHeroArtHeight: 380,
  landingHeroArtCompactHeight: 300,
  landingContourCanvasHeight: 300,
  landingSectionCopyWidth: 700,
  landingFeatureWidth: 250,
  landingFeatureHeight: 230,
  mapHeaderHeight: 128,
  mapDescriptionWidth: 700,
  calendarIntroHeight: 290,
  calendarScopeWidth: 240,
  calendarGridWidth: 630,
  calendarTitleWidth: 680,
  calendarLedeWidth: 640,
  calendarYearCellWidth: 52,
  calendarMonthCellWidth: 42,
  emptyStateWidth: 520,
  profileVisualHeight: 300,
  profileVisualWideHeight: 600,
  profileVisualCompactHeight: 380,
  profileMapHeight: 180,
  profileCopyWidth: 460,
  profileFormWidth: 540,
  profilePanelWidth: 600,
  profileInputHeight: 48,
  multilineFieldHeight: 98,
  mapHeightCompact: 420,
  mapHeightWide: 580,
  hairline: 1,
  rule: 2,
} as const;

export const typography = {
  family: {
    editorial: 'Georgia',
    sans: 'system-ui',
    mono: 'ui-monospace',
  },
  size: {
    caption: 11,
    small: 13,
    body: 15,
    subheading: 19,
    heading: 28,
    display: 42,
  },
  lineHeight: {
    body: 23,
    heading: 36,
    display: 48,
  },
} as const;

export const radii = {
  small: 6,
  medium: 12,
  large: 20,
  pill: 999,
} as const;

export const shadows = {
  card: {
    shadowColor: colorScale.ash[900],
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
} as const;

export const motion = {
  reduced: 0,
  quick: 140,
  standard: 220,
  slow: 520,
} as const;

export type ThemeMode = keyof typeof themeTokens;