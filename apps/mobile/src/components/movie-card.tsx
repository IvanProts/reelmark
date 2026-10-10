import { StyleSheet, View } from 'react-native';

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import Animated, { css, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import type { MovieCard as Movie } from '@reelmark/shared';

import { useI18n } from '@/i18n';
import { formatRating, hasRating } from '@/lib/format';
import { colors, posterScrim, radii, sizes, spacing } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

const MAX_GENRES = 3;
const ANIMATION_MS = 250;

type MovieCardProps = Movie & {
  /** Shows the overview over a dimmed poster. */
  expanded?: boolean;
};

/**
 * One movie: full-bleed poster with title, year, rating and genres on a bottom gradient.
 * Purely visual; the swipeable wrapper handles touches and screen readers. The card fills
 * its parent, which decides the size.
 */
export function MovieCard({
  title,
  year,
  rating,
  genres,
  overview,
  posterUrl,
  expanded = false,
}: MovieCardProps) {
  const { t } = useI18n();
  const shownGenres = genres.slice(0, MAX_GENRES);
  const overviewText = overview.trim() || t('card.noOverview');

  return (
    <View style={styles.card}>
      <Image
        source={posterUrl}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        // Fade the poster in once it's downloaded instead of popping in.
        transition={ANIMATION_MS}
        // iOS "Smart Invert" must not turn posters into negatives.
        accessibilityIgnoresInvertColors
      />

      {/* Dark gradient at the bottom keeps the text readable on any poster. */}
      <LinearGradient
        colors={posterScrim.colors}
        locations={posterScrim.locations}
        style={styles.scrim}
        pointerEvents="none"
      />

      {/* Dims the poster while the overview is open; a CSS transition animates `opacity`. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.dim, transitions.opacity, { opacity: expanded ? 1 : 0 }]}
      />

      <View style={styles.content}>
        {/* `layout` animates this block upwards when the overview appears below it. */}
        <Animated.View layout={LinearTransition.duration(ANIMATION_MS)} style={styles.headline}>
          <AppText variant="hero" numberOfLines={expanded ? 3 : 2}>
            {title}
          </AppText>

          <View style={styles.metaRow}>
            <Meta year={year} rating={rating} />
            <View style={styles.expandHint}>
              <Icon name={expanded ? 'collapse' : 'expand'} size={sizes.iconSmall} />
            </View>
          </View>

          {shownGenres.length > 0 ? (
            <View style={styles.genres}>
              {shownGenres.map((genre) => (
                <View key={genre} style={styles.chip}>
                  <AppText variant="micro" numberOfLines={1}>
                    {genre}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
        </Animated.View>

        {expanded ? (
          <Animated.ScrollView
            entering={FadeIn.duration(ANIMATION_MS)}
            exiting={FadeOut.duration(ANIMATION_MS / 2)}
            style={styles.overview}
            showsVerticalScrollIndicator={false}
          >
            <AppText variant="callout" color="textSecondary">
              {overviewText}
            </AppText>
          </Animated.ScrollView>
        ) : null}
      </View>
    </View>
  );
}

/** What a screen reader says for a movie: title, year, rating and genres. */
export function useMovieDescription({ title, year, rating, genres }: Movie): string {
  const { t, locale } = useI18n();
  return [
    title,
    year ? t('card.a11yYear', { year }) : null,
    hasRating(rating) ? t('card.a11yRating', { rating: formatRating(rating, locale) }) : null,
    genres.slice(0, MAX_GENRES).join(', ') || null,
  ]
    .filter(Boolean)
    .join(', ');
}

/** "2024 · ★ 7,8" (uk) / "2024 · ★ 7.8" (en) — each part is optional. */
function Meta({ year, rating }: Pick<Movie, 'year' | 'rating'>) {
  const { locale } = useI18n();
  const showRating = hasRating(rating);
  if (!year && !showRating) return <View style={styles.metaSpacer} />;

  return (
    <AppText variant="caption" color="textSecondary" style={styles.metaSpacer}>
      {year ?? ''}
      {year && showRating ? '  ·  ' : ''}
      {showRating ? (
        <>
          <AppText variant="caption" color="accent">
            ★
          </AppText>{' '}
          <AppText variant="caption">{formatRating(rating, locale)}</AppText>
        </>
      ) : null}
    </AppText>
  );
}

// Like StyleSheet.create, but also accepts Reanimated's CSS transition properties.
const transitions = css.create({
  opacity: {
    transitionProperty: 'opacity',
    transitionDuration: ANIMATION_MS,
  },
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radii.card,
    // Clip the poster and gradient to the rounded corners.
    overflow: 'hidden',
    // Shown while the poster is still loading.
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.posterBorder,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '65%',
  },
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.posterDim,
  },
  content: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    padding: spacing.xl,
    paddingTop: spacing.xxxl,
  },
  headline: {
    gap: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metaSpacer: {
    flex: 1,
  },
  expandHint: {
    width: sizes.badge,
    height: sizes.badge,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlayChip,
  },
  genres: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + spacing.xxs,
    marginTop: spacing.xxs,
  },
  chip: {
    paddingHorizontal: spacing.md - spacing.xxs,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    backgroundColor: colors.overlayChip,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.overlayChipBorder,
  },
  overview: {
    // Takes the remaining height and scrolls when the text is longer.
    flexGrow: 0,
    flexShrink: 1,
    marginTop: spacing.lg,
  },
});
