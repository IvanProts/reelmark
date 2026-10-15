/**
 * Color tokens — "a cinema at night".
 *
 * The app is dark-only (app.json `userInterfaceStyle: "dark"`), so there is a
 * single palette instead of light/dark variants. Components must use these
 * tokens and never hard-code colors.
 *
 * Contrast (WCAG 2.1, checked against `background`):
 *   textPrimary   17.4:1   textSecondary 8.3:1   textTertiary 5.9:1
 *   accent        10.8:1   onAccent on accent 10.3:1
 *   want          11.0:1   danger 7.7:1
 * Everything meets AA (4.5:1) for normal text.
 */
export const colors = {
  /** App canvas: near-black with a cool, ink-blue tint. */
  background: '#0B0B0F',
  /** Cards, sheets, skeletons: one step above the canvas. */
  surface: '#16161D',
  /** Secondary buttons and pressed states: one more step up. */
  surfaceRaised: '#1F1F28',
  /** Hairline borders that separate surfaces on a dark canvas. */
  border: '#2A2A35',

  /** Warm "projector light" white for primary text. */
  textPrimary: '#F4F1EA',
  /** Supporting text: metadata, descriptions. */
  textSecondary: '#A9A7B3',
  /** Least important text: footnotes, counters. */
  textTertiary: '#8E8C98',

  /** The one accent: marquee-light amber. Primary actions and the rating star. */
  accent: '#F5B544',
  /** Text/icons placed on top of `accent`. */
  onAccent: '#17110A',
  /** "Want to watch": the swipe-up stamp and the watchlist button. */
  want: '#8CC8FF',
  /** Destructive actions, such as deleting data. */
  danger: '#FF7A6B',

  /** Shimmer highlight that sweeps across skeletons. */
  shimmer: 'rgba(255, 255, 255, 0.06)',

  /** Chips and small controls floating on top of a poster. */
  overlayChip: 'rgba(255, 255, 255, 0.12)',
  overlayChipBorder: 'rgba(255, 255, 255, 0.16)',
  /** Thin inner border around posters so they don't bleed into the canvas. */
  posterBorder: 'rgba(255, 255, 255, 0.08)',
  /**
   * Grey veil over the card behind the top one. Only its bottom edge peeks
   * out, and a lighter edge reads as "another card underneath" on the dark canvas.
   */
  stackVeil: 'rgba(42, 42, 53, 0.82)',
  /** Behind swipe stamps, so their text reads on any poster. */
  stampBackdrop: 'rgba(11, 11, 15, 0.45)',
} as const;

/**
 * Bottom scrim over posters: transparent → almost-background.
 * It guarantees readable text on any poster, even a pure white one
 * (the title area sits on ≥ 60% opacity, metadata on ≥ 85%).
 */
export const posterScrim = {
  colors: [
    'rgba(11, 11, 15, 0)',
    'rgba(11, 11, 15, 0.55)',
    'rgba(11, 11, 15, 0.88)',
    'rgba(11, 11, 15, 0.97)',
  ],
  locations: [0, 0.3, 0.62, 1],
} as const;

/** Soft horizontal highlight used by the skeleton shimmer. */
export const shimmerGradient = [
  'rgba(255, 255, 255, 0)',
  colors.shimmer,
  'rgba(255, 255, 255, 0)',
] as const;

export type ColorToken = keyof typeof colors;
