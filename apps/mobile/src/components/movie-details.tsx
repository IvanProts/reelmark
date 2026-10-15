/** The movie sheet's facts: header, scores, tagline, overview and credits. */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Image } from 'expo-image';

import type { MovieDetails } from '@reelmark/shared';

import { useI18n, type TranslateFn } from '@/i18n';
import { formatRating, hasRating } from '@/lib/format';
import { colors, radii, sizes, spacing } from '@/theme';

import { AppText } from './app-text';

type HeaderProps = {
  details: MovieDetails;
  /** The close button, top right. */
  action: ReactNode;
};

/** Poster, title, "2014 · 2 h 49 min · 16+" and genres. */
export function MovieDetailsHeader({ details, action }: HeaderProps) {
  const { t } = useI18n();
  const { movie, runtime, certification } = details;
  const facts = [
    movie.year
      ? { text: String(movie.year), spoken: t('card.a11yYear', { year: movie.year }) }
      : null,
    runtime ? { text: formatRuntime(runtime, t), spoken: formatRuntime(runtime, t) } : null,
    certification
      ? {
          text: certification.value,
          spoken: t('detail.a11yCertification', { value: certification.value }),
        }
      : null,
  ].filter((fact) => fact !== null);

  return (
    <View style={styles.header}>
      <Image
        source={movie.posterUrl}
        style={styles.poster}
        contentFit="cover"
        transition={200}
        accessibilityIgnoresInvertColors
      />
      <View style={styles.headerText}>
        <AppText variant="headline" accessibilityRole="header">
          {movie.title}
        </AppText>
        {facts.length > 0 ? (
          <AppText
            variant="caption"
            color="textSecondary"
            accessibilityLabel={facts.map((fact) => fact.spoken).join(', ')}
          >
            {facts.map((fact) => fact.text).join('  ·  ')}
          </AppText>
        ) : null}
        {movie.genres.length > 0 ? (
          <AppText variant="caption" color="textTertiary">
            {movie.genres.join(', ')}
          </AppText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

/** "TMDB audience 7.5", "Rotten Tomatoes 93%", "Metacritic 81"; unknown scores are left out. */
export function ScoresRow({ details }: { details: MovieDetails }) {
  const { t, locale } = useI18n();
  const { rating } = details.movie;
  const { rottenTomatoes, metacritic } = details.critics;
  const tmdb = formatRating(rating, locale);
  const scores = [
    hasRating(rating)
      ? { source: t('rating.tmdb'), value: tmdb, spoken: t('rating.a11yTmdb', { value: tmdb }) }
      : null,
    rottenTomatoes !== null
      ? {
          source: t('rating.rottenTomatoes'),
          value: `${rottenTomatoes}%`,
          spoken: t('rating.a11yRottenTomatoes', { value: rottenTomatoes }),
        }
      : null,
    metacritic !== null
      ? {
          source: t('rating.metacritic'),
          value: String(metacritic),
          spoken: t('rating.a11yMetacritic', { value: metacritic }),
        }
      : null,
  ].filter((score) => score !== null);

  if (scores.length === 0) return null;
  return (
    <View style={styles.scores}>
      {scores.map((score) => (
        <View
          key={score.source}
          style={styles.score}
          accessible
          accessibilityRole="text"
          accessibilityLabel={score.spoken}
        >
          <AppText variant="micro" color="textSecondary" numberOfLines={1}>
            {score.source}
          </AppText>
          <AppText variant="label" style={styles.scoreValue}>
            {score.value}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** Tagline, overview, directors and top cast. */
export function MovieStory({ details }: { details: MovieDetails }) {
  const { t } = useI18n();
  const tagline = details.tagline.trim();

  return (
    <View style={styles.story}>
      {tagline ? (
        <AppText variant="callout" color="textPrimary" style={styles.tagline}>
          {tagline}
        </AppText>
      ) : null}
      <AppText variant="body" color="textSecondary">
        {details.movie.overview.trim() || t('card.noOverview')}
      </AppText>
      <Credit label={t('detail.directors')} names={details.directors} />
      <Credit label={t('detail.cast')} names={details.cast} />
    </View>
  );
}

function Credit({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <View style={styles.credit}>
      <AppText variant="micro" color="textTertiary">
        {label}
      </AppText>
      <AppText variant="callout">{names.join(', ')}</AppText>
    </View>
  );
}

/** 169 → "2 h 49 min"; under an hour, minutes only. */
function formatRuntime(minutes: number, t: TranslateFn): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0
    ? t('detail.runtime', { hours, minutes: rest })
    : t('detail.runtimeMinutes', { minutes: rest });
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'flex-start',
  },
  poster: {
    width: sizes.detailPoster,
    aspectRatio: sizes.cardAspectRatio,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.posterBorder,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  scores: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  score: {
    flexGrow: 1,
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  scoreValue: {
    fontVariant: ['tabular-nums'],
  },
  story: {
    gap: spacing.md,
  },
  tagline: {
    fontStyle: 'italic',
  },
  credit: {
    gap: spacing.xxs,
  },
});
