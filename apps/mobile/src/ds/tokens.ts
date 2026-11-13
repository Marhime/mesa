// Mesa design tokens (docs/DESIGN_SYSTEM.md): minimal, neutral, food colors only for food.
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
  /** Text and icons on `select` (the selected chip, tab, segment). */
  onSelect: string;
  /** Text and icons on pastels and illustrations (same in both themes). */
  onTint: string;
  onTintMuted: string;
  success: string;
  danger: string;
  dangerSoft: string;
  scrim: string;
  focus: string;
  /** Loading placeholders: visible on both surface and surfaceRaised. */
  skeleton: string;
  /** Edge of floating chrome (tab bar, float buttons): a hairline in dark, where shadows vanish. */
  floatEdge: string;
}

export type ColorToken = keyof Palette;

// Minimal and neutral: warm-free grays, a near-black ink, and selection in ink (black on light,
// white on dark). Color is kept for food (category pastels, illustrations) and for meaning.
const light: Palette = {
  surface: '#f6f6f4',
  surfaceRaised: '#ffffff',
  surfaceSunken: '#eeeeeb',
  line: '#e2e2de',
  lineStrong: '#9a9a95',
  ink: '#161616',
  inkMuted: '#6b6b67',
  onInk: '#ffffff',
  select: '#161616',
  selectSoft: '#ebebe6',
  onSelect: '#ffffff',
  onTint: '#161616',
  onTintMuted: '#55554f',
  success: '#2e7d4f',
  danger: '#c2392f',
  dangerSoft: '#fbe5e2',
  scrim: '#16161666',
  focus: '#2f6fdb',
  skeleton: '#e6e6e2',
  floatEdge: 'transparent',
};

const dark: Palette = {
  surface: '#0e0e0e',
  surfaceRaised: '#1a1a1a',
  surfaceSunken: '#080808',
  line: '#2b2b2b',
  lineStrong: '#5f5f5b',
  ink: '#f2f2ef',
  inkMuted: '#a3a39d',
  onInk: '#0e0e0e', // = surface
  select: '#f2f2ef',
  selectSoft: '#262624',
  onSelect: '#121212',
  onTint: '#161616',
  onTintMuted: '#55554f',
  success: '#6fcf97',
  danger: '#ff8a80',
  dangerSoft: '#3a1714',
  scrim: '#000000a6',
  focus: '#7aa7f5',
  skeleton: '#262626',
  floatEdge: '#2b2b2b', // = line
};

export const palettes: Record<ColorScheme, Palette> = { light, dark };

/** Food category tints, muted, identical in both themes. `other` uses surfaceSunken (theme dependent). */
export const categoryPastel = {
  produce: '#d5e2cc', // sage
  bakery: '#efe5cf', // oat
  meat: '#efd6d8', // blush
  dairy: '#d6e1ea', // mist
  frozen: '#dde3ef', // frost
  cupboard: '#efe5cf',
  drinks: '#d6e1ea',
  household: '#dedbd5', // stone
} as const;

/**
 * Illustration colors (FoodPicto, DishArt, SuccessBurst, Sticker): muted food tints outlined in ink.
 * Identical in both themes, like a printed card. Never for UI chrome.
 */
export const art = {
  ink: '#161616',
  paper: '#ffffff',
  sage: '#d5e2cc',
  /** Deeper green for leaves, limes, avocado skin. */
  leaf: '#b9cfa9',
  oat: '#efe5cf',
  /** Soft yellow: banana, corn, cheese, yolk. */
  butter: '#f1e2ae',
  clay: '#efd3c4',
  /** Warm red: tomato, chile, meat. */
  brick: '#e9b4a6',
  blush: '#efd6d8',
  mist: '#d6e1ea',
  stone: '#dedbd5',
} as const;

/** Space scale. Only these values exist. */
export const space = {
  /** Between a title and its line under it (a label and its caption, stacked tight). */
  xxs: 2,
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
  /** What floats just above the tab bar, at its right end (the Mesa button): a touch target, no more. */
  tabAccessory: 44,
  listRow: 56,
  thumb: 64,
  stepNumber: 28,
  emptyDisc: 72,
  sheetHandle: 36,
  sheetHandleHeight: 4,
  skeletonLine: 14,
  inviteCode: 48,
  swipeAction: 88,
  readable: 560,
  fieldButton: 60,
  pictoSm: 32,
  /** The amount column of an ingredient row ("1½ tbsp"), so the names line up. */
  amountColumn: 72,
  pictoMd: 40,
  sticker: 24,
  burst: 120,
  /** The small seal of a finished list ("All put away"). */
  burstSm: 72,
  useSoonCard: 120,
  upNextCard: 180,
  meter: 8,
  /** The import progression bar. */
  progressBar: 6,
  dishHero: 300,
  dishBanner: 176,
  dishTile: 104,
  /** A video's thumbnail in a list (creator sheet), 16:9. */
  videoThumb: 96,
  /** The play disc over a video thumbnail. */
  playDisc: 28,
  /** Longest a creator's pill grows in "Your creators" (name and "2 new"). */
  creatorPill: 240,
  /** A VideoCard in a rail (For you, New from your creators, Ask Mesa), 16:9 thumbnail on top. */
  videoCard: 260,
  /** A recipe card in a rail ("Cook again"). */
  recipeRailCard: 168,
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

/**
 * Where a list row's text starts, so the hairline between rows lines up with it (ListGroup `inset`).
 * row: text only · icon: after a 20 pt icon, or a checkbox (space.xs + size.touch, the same 48) ·
 * picto: after a food picto (FoodRow) · avatar: after an avatar.
 */
export const rowInset = {
  none: 0,
  row: space.lg,
  icon: space.lg + iconSize.md + space.md,
  picto: space.lg + size.pictoSm + space.md,
  avatar: space.lg + size.avatarMd + space.md,
} as const;
export type RowInset = keyof typeof rowInset;

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
/** Chrome that sits in fixed shapes (badges, stickers, tab and segment labels) grows less. */
export const maxFontScaleChrome = 1.3;
/** From this Dynamic Type multiplier on, buttons side by side stack (ButtonRow), so no label is cut. */
export const stackFontScale = 1.3;

/** Motion durations in ms. Ease-out by default (see motion.ts). */
export const duration = {
  /** Finger down: the press shows at once. */
  touch: 50,
  /** Finger up, a checkbox or a mark switching. */
  press: 100,
  /** Something leaving (a row, a toast, a bar): faster than it came, so the next thing is never kept waiting. */
  leave: 150,
  /** A mark switching on (an ingredient's ✓ settling in). */
  mark: 150,
  /** Something arriving or moving (fades, reflows, swaps). */
  small: 200,
  /** A sheet closing: the next sheet or screen comes up right after. */
  sheet: 200,
  /** A modal screen (the iOS sheet) going down: a screen pushed before it is gone is laid out under it. */
  modalExit: 500,
  /** Success moments: the Cooked seal, stickers. */
  pop: 400,
  /** A skeleton breathing out (then in). */
  pulse: 750,
  /** One bubble of the Simmer loader rising. */
  simmer: 1000,
  flash: 1200,
  /** A checked grocery row stays in place, struck through, this long before it moves to the cart. */
  settle: 1200,
  toast: 4000,
  /** Toasts stay longer while VoiceOver is on (time to reach Undo). */
  toastA11y: 10000,
} as const;

/** Springs (Reanimated `withSpring` duration-based configs). */
export const spring = {
  /** Sheets opening and settling back after a drag: quick, no bounce. */
  sheet: { duration: 380, dampingRatio: 1 },
  /** The selection pill sliding between tabs and segments. */
  indicator: { duration: 300, dampingRatio: 0.9 },
} as const;

/** Gesture thresholds. */
export const gesture = {
  /** A sheet dragged down past this share of its height closes. */
  dismissFraction: 0.25,
  /** …or flicked down faster than this (pt/s). */
  dismissVelocity: 1000,
  /** Vertical travel before a drag starts; horizontal travel that cancels it (chips scroll sideways). */
  activeOffset: 12,
  failOffset: 16,
  /** A toast swiped this far away is dismissed. */
  toastDismiss: 24,
  /** Hero images scroll at this fraction of the content speed. */
  parallax: 0.5,
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
  video: 16 / 9,
} as const;
