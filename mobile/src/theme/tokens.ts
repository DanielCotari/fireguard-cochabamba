export const colorScale = {
  ink: {
    50: '#F4F7F8',
    100: '#E6ECEE',
    200: '#D3DEE2',
    300: '#B7C6CC',
    500: '#5E727A',
    700: '#314249',
    900: '#172226',
  },
  petrol: {
    700: '#1C4650',
    800: '#14343C',
    900: '#0E272E',
  },
  ember: {
    100: '#F8E8DC',
    300: '#E7A57A',
    500: '#C2511A',
    700: '#8C3A12',
    900: '#5C260C',
  },
  moss: {
    100: '#E5F2EB',
    500: '#1B6B45',
    700: '#145236',
  },
  glacier: {
    100: '#E5F1F3',
    500: '#1F6F78',
    700: '#164E55',
  },
  danger: {
    100: '#F8E8E6',
    700: '#9B2C2C',
  },
  warning: {
    100: '#F8F1DC',
    700: '#8A5A10',
  },
} as const;

export const activityScale = {
  zero: '#E4E8EA',
  steps: ['#F6D7C4', '#E8A87C', '#D06A32', '#A33E12', '#6E2A0C'],
} as const;

export function activityColor(value: number, maximum: number) {
  if (value <= 0) return activityScale.zero;
  if (maximum <= 0) return activityScale.steps[activityScale.steps.length - 1];
  const index = Math.min(
    activityScale.steps.length - 1,
    Math.max(0, Math.ceil((value / maximum) * activityScale.steps.length) - 1),
  );
  return activityScale.steps[index];
}

export function activityInk(value: number, maximum: number) {
  return maximum > 0 && value / maximum > 0.55 ? '#FFFFFF' : colorScale.ink[900];
}

export const themeTokens = {
  light: {
    colors: {
      canvas: '#F3F5F6',
      surface: '#FFFFFF',
      surfaceRaised: '#FFFFFF',
      ink: colorScale.ink[900],
      inkMuted: colorScale.ink[700],
      inkSubtle: colorScale.ink[500],
      line: colorScale.ink[200],
      lineStrong: colorScale.ink[300],
      accent: colorScale.ember[500],
      accentSoft: colorScale.ember[100],
      attention: colorScale.ember[700],
      attentionSoft: colorScale.ember[100],
      calm: colorScale.moss[700],
      calmSoft: colorScale.moss[100],
      danger: colorScale.danger[700],
      dangerSoft: colorScale.danger[100],
      warning: colorScale.warning[700],
      warningSoft: colorScale.warning[100],
      modis: colorScale.ember[700],
      viirs: colorScale.glacier[700],
      focus: colorScale.petrol[800],
      overlay: 'rgba(14, 39, 46, 0.72)',
      nav: colorScale.petrol[800],
      navInk: '#F4F7F8',
      navMuted: '#C5D4D8',
      navActive: colorScale.petrol[700],
      navLine: '#2A5560',
    },
  },
  dark: {
    colors: {
      canvas: '#121A1D',
      surface: '#1A2428',
      surfaceRaised: '#212C31',
      ink: '#F4F7F8',
      inkMuted: '#D5DEE2',
      inkSubtle: '#9AADB4',
      line: '#314249',
      lineStrong: '#496068',
      accent: '#E08A4F',
      accentSoft: '#3A2A22',
      attention: '#E7A57A',
      attentionSoft: '#3A2A22',
      calm: '#8FCBB0',
      calmSoft: '#1C3330',
      danger: '#F0B4AE',
      dangerSoft: '#3A2424',
      warning: '#E3C27A',
      warningSoft: '#3A3220',
      modis: '#E7A57A',
      viirs: '#8FCFD4',
      focus: '#8FCFD4',
      overlay: 'rgba(0, 0, 0, 0.72)',
      nav: '#0E272E',
      navInk: '#F4F7F8',
      navMuted: '#C5D4D8',
      navActive: '#1C4650',
      navLine: '#2A5560',
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
  xxl: 40,
  section: 48,
} as const;

export const breakpoints = {
  phone: 480,
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
  overviewCardHeight: 148,
  reportMapHeight: 300,
  photoPreviewSize: 82,
  coordinateFieldWidth: 180,
  sidebar: 248,
  touchTarget: 44,
  navigationTabWidth: 96,
  brandMark: 36,
  headerHeight: 64,
  compactHeaderHeight: 60,
  landingHeroHeight: 0,
  landingHeroCopyWidth: 640,
  landingHeroArtWidth: 0,
  landingHeroArtHeight: 0,
  landingHeroArtCompactHeight: 0,
  landingContourCanvasHeight: 0,
  landingSectionCopyWidth: 720,
  landingFeatureWidth: 240,
  landingFeatureHeight: 0,
  mapHeaderHeight: 0,
  mapDescriptionWidth: 720,
  calendarIntroHeight: 0,
  calendarScopeWidth: 240,
  calendarGridWidth: 720,
  calendarTitleWidth: 720,
  calendarLedeWidth: 680,
  calendarYearCellWidth: 56,
  calendarMonthCellWidth: 52,
  emptyStateWidth: 520,
  profileVisualHeight: 280,
  profileVisualWideHeight: 520,
  profileVisualCompactHeight: 240,
  profileMapHeight: 120,
  profileCopyWidth: 460,
  profileFormWidth: 540,
  profilePanelWidth: 600,
  profileInputHeight: 44,
  multilineFieldHeight: 98,
  mapHeightCompact: 420,
  mapHeightWide: 560,
  chartHeight: 168,
  hairline: 1,
  rule: 2,
} as const;

export const typography = {
  family: {
    editorial: 'system-ui',
    sans: 'system-ui',
    mono: 'ui-monospace',
  },
  size: {
    caption: 12,
    small: 13,
    body: 15,
    subheading: 18,
    heading: 26,
    display: 32,
  },
  lineHeight: {
    body: 22,
    heading: 32,
    display: 38,
  },
  tabular: ['tabular-nums'] as ('tabular-nums')[],
} as const;

export const radii = {
  small: 4,
  medium: 6,
  large: 8,
  pill: 4,
} as const;

export const shadows = {
  card: {
    shadowColor: colorScale.ink[900],
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
} as const;

export const motion = {
  reduced: 0,
  quick: 120,
  standard: 180,
  slow: 240,
} as const;

export type ThemeMode = keyof typeof themeTokens;
