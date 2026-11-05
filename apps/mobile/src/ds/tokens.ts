// Mesa design tokens (docs/DESIGN_SYSTEM.md, Zician foundations).
// The ONLY place in the app where raw colors, sizes, spacings and radii are written.
// Pure data: no React Native imports, so app.config.ts can read it too.

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  line: string;
  lineStrong: string;
  ink: string;
  inkMuted: string;
  onInk: string;
  select: string;
  selectSoft: string;
  onTint: string;
  onTintMuted: string;
  success: string;
  danger: string;
  dangerSoft: string;
  scrim: string;
  focus: string;
}

export type ColorToken = keyof Palette;

const light: Palette = {
  surface: '#f3f1ea',
  surfaceRaised: '#ffffff',
  surfaceSunken: '#ecebe4',
  line: '#dcdad0',
  lineStrong: '#8a8796',
  ink: '#16141f',
  inkMuted: '#5c5968',
  onInk: '#f3f1ea', // = surface
  select: '#d4e86a',
  selectSoft: '#eef5c8',
  onTint: '#16141f',
  onTintMuted: '#4a4756',
  success: '#1a7340',
  danger: '#c02e45',
  dangerSoft: '#fbe3e6',
  scrim: '#16141f66',
  focus: '#5334c7',
};

const dark: Palette = {
  surface: '#111016',
  surfaceRaised: '#1c1b23',
  surfaceSunken: '#0a090e',
  line: '#34313f',
  lineStrong: '#6e6a7c',
  ink: '#f4f2ec',
  inkMuted: '#aba7b8',
  onInk: '#111016', // = surface
  select: '#d4e86a',
  selectSoft: '#2b3016',
  onTint: '#16141f',
  onTintMuted: '#4a4756',
  success: '#6fd29a',
  danger: '#ff8a97',
  dangerSoft: '#3d1820',
  scrim: '#000000a6',
  focus: '#a08bff',
};

export const palettes: Record<ColorScheme, Palette> = { light, dark };

/** Food category pastels, identical in both themes. `other` uses surfaceSunken (theme dependent). */
export const categoryPastel = {
  produce: '#ffc4a0', // coral
  bakery: '#fbe7a8', // butter
  meat: '#f7b3da', // pink
  dairy: '#cfe0fc', // sky
  frozen: '#c9bcff', // lavender
  cupboard: '#fbe7a8',
  drinks: '#cfe0fc',
  household: '#c9bcff',
} as const;

/**
 * Illustration colors (FoodPicto, DishArt, SuccessBurst, Sticker): the Zician pastels outlined in ink.
 * Identical in both themes, like a printed sticker. Never for UI chrome.
 */
export const art = {
  ink: '#16141f',
  paper: '#ffffff',
  lime: '#d4e86a',
  lavender: '#c9bcff',
  pink: '#f7b3da',
  butter: '#fbe7a8',
  sky: '#cfe0fc',
  coral: '#ffc4a0',
} as const;

/** Space scale. Only these values exist. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;
export type SpaceToken = keyof typeof space;

/** Layout constants derived from the space scale. */
export const layout = {
  screenMargin: space.xl,
  sectionGap: space.xxxl,
  tabBarEdge: space.lg,
} as const;

export const radius = {
  sm: 10, // thumbnails
  md: 16, // compact cards
  lg: 24, // cards, list groups, multiline fields
  xl: 32, // sheets, hero
  full: 9999, // every control
} as const;
export type RadiusToken = keyof typeof radius;

export const border = {
  hairline: 1,
  control: 1.5,
  strong: 2,
} as const;

/** Component dimensions (heights, icon sizes, touch targets). */
export const size = {
  touch: 44,
  iconButton: 44,
  buttonMd: 48,
  buttonLg: 56,
  field: 52,
  chip: 36,
  checkbox: 24,
  avatarSm: 28,
  avatarMd: 36,
  dot: 10,
  badge: 18,
  tabBar: 74,
  tabItem: 58,
  listRow: 56,
  thumb: 64,
  stepNumber: 28,
  emptyDisc: 72,
  sheetHandle: 36,
  sheetHandleHeight: 4,
  equalizerBar: 4,
  skeletonLine: 14,
  inviteCode: 48,
  swipeAction: 88,
  readable: 560,
  fieldButton: 60,
  pictoSm: 32,
  pictoMd: 40,
  sticker: 24,
  burst: 120,
  useSoonCard: 120,
  upNextCard: 180,
  meter: 8,
  segment: 6,
  segmentLg: 10,
  dishHero: 300,
  dishBanner: 176,
  dishTile: 104,
} as const;

/** Sticker tilt, in degrees. */
export const tilt = { left: -4, right: 3 } as const;

export const iconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  /** The check of the success seal. */
  hero: 56,
} as const;
export type IconSize = keyof typeof iconSize;

export const fontFamily = {
  urbanist600: 'Urbanist_600SemiBold',
  figtree400: 'Figtree_400Regular',
  figtree600: 'Figtree_600SemiBold',
} as const;

export interface TypeStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: 'uppercase';
}

/** Closed type scale, two weights. */
export const typography = {
  display: { fontFamily: fontFamily.urbanist600, fontSize: 34, lineHeight: 40, letterSpacing: -0.5 },
  title: { fontFamily: fontFamily.urbanist600, fontSize: 24, lineHeight: 30 },
  heading: { fontFamily: fontFamily.urbanist600, fontSize: 18, lineHeight: 24 },
  bodyLg: { fontFamily: fontFamily.figtree400, fontSize: 17, lineHeight: 26 },
  body: { fontFamily: fontFamily.figtree400, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fontFamily.figtree600, fontSize: 15, lineHeight: 20 },
  labelLg: { fontFamily: fontFamily.figtree600, fontSize: 17, lineHeight: 20 },
  caption: { fontFamily: fontFamily.figtree400, fontSize: 13, lineHeight: 18 },
  captionStrong: { fontFamily: fontFamily.figtree600, fontSize: 13, lineHeight: 18 },
  micro: { fontFamily: fontFamily.figtree400, fontSize: 12, lineHeight: 16 },
  microStrong: { fontFamily: fontFamily.figtree600, fontSize: 12, lineHeight: 16 },
  sticker: { fontFamily: fontFamily.urbanist600, fontSize: 12, lineHeight: 16, letterSpacing: 0.12 },
  overline: {
    fontFamily: fontFamily.figtree600,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  input: { fontFamily: fontFamily.figtree400, fontSize: 16, lineHeight: 22 },
} as const satisfies Record<string, TypeStyle>;
export type TypeVariant = keyof typeof typography;

/** Largest Dynamic Type multiplier we honour before layouts would break. */
export const maxFontScale = 1.6;

/** Motion durations in ms. Ease-out by default (see motion.ts). */
export const duration = {
  press: 125,
  small: 250,
  sheet: 375,
  pop: 500,
  flash: 1200,
  toast: 4000,
} as const;

export const opacity = {
  pressed: 0.6,
  disabled: 0.4,
  muted: 0.5,
} as const;

/** Elevation: only floating things (tab bar, sheets, toasts) get a shadow. */
export const shadow = {
  sm: { shadowColor: '#16141f', shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, shadowOpacity: 0.06, elevation: 1 },
  lg: { shadowColor: '#16141f', shadowOffset: { width: 0, height: 8 }, shadowRadius: 24, shadowOpacity: 0.14, elevation: 8 },
  /** Printed-sticker offset shadow (Sticker). */
  hard: { shadowColor: '#16141f', shadowOffset: { width: 2, height: 2 }, shadowRadius: 0, shadowOpacity: 1, elevation: 2 },
} as const;

/** Media aspect ratios. */
export const aspect = {
  recipeCard: 16 / 10,
} as const;
