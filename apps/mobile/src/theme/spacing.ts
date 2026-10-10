/**
 * Spacing scale on a 4pt grid. Use these for padding, margins and gaps.
 * (React Native units are density-independent points, not pixels.)
 */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/** Corner radii. */
export const radii = {
  sm: 8,
  md: 12,
  /** Movie cards: large and soft, like a cinema screen's rounded corners. */
  card: 24,
  /** Bottom sheets. */
  sheet: 28,
  /** Pills and circles: any value ≥ half the height gives a full round end. */
  full: 999,
} as const;

/** Fixed component sizes. */
export const sizes = {
  /** Apple HIG / Material minimum touch target. Never go below this. */
  minTouchTarget: 44,
  /** Height of the big pill buttons. */
  actionButton: 56,
  /** Round deck buttons: the main decisions, and the smaller undo. */
  deckButton: 64,
  deckButtonSmall: 48,
  /** Icon size inside buttons. */
  icon: 20,
  /** Tiny icons inside badges. */
  iconSmall: 12,
  /** Small round badges and chips. */
  badge: 24,
  /** Large icon on status (error/empty) cards, and the circle around it. */
  statusIcon: 28,
  statusIconCircle: 64,
  /** Poster width in the movie detail sheet. */
  detailPoster: 96,
  /** Posters are 2:3 (width:height), so cards are too. */
  cardAspectRatio: 2 / 3,
  /** How far the next card peeks out from under the top one. */
  stackPeek: 14,
  /** How much smaller the next card is than the top one. */
  stackScale: 0.92,
} as const;
