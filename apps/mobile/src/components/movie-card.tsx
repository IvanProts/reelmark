import { StyleSheet, View } from 'react-native';

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import type { MovieCard as Movie } from '@reelmark/shared';

import { useI18n } from '@/i18n';
import { formatRating, hasRating } from '@/lib/format';
import { colors, posterScrim, radii, sizes, spacing } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

const MAX_GENRES = 3;
const POSTER_FADE_MS = 250;

/**
 * One movie: full-bleed poster with title, year, rating and genres on a bottom gradient, and a
 * "Details" chip. Purely visual; the swipeable wrapper handles touches (a tap opens the movie
 * sheet) and screen readers. The card fills its parent, which decides the size.
 */
export function MovieCard({ title, year, rating, genres, posterUrl }: Movie) {
  const { t } = useI18n();
  const shownGenres = genres.slice(0, MAX_GENRES);

  return (
    <View style={styles.card}>
      <Image
        source={posterUrl}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        // Fade the poster in once it's downloaded instead of popping in.
        transition={POSTER_FADE_MS}
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

      <View style={styles.content}>
        <View style={styles.headline}>
          <AppText variant="hero" numberOfLines={2}>
            {title}
          </AppText>

          <View style={styles.metaRow}>
            <Meta year={year} rating={rating} />
            <View style={styles.detailsChip}>
              <Icon name="info" size={sizes.iconSmall} />
              <AppText variant="micro" numberOfLines={1}>
                {t('card.details')}
              </AppText>
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
        </View>
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
  detailsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: sizes.badge,
    paddingHorizontal: spacing.sm + spacing.xxs,
    borderRadius: radii.full,
    backgroundColor: colors.overlayChip,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.overlayChipBorder,
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
});
