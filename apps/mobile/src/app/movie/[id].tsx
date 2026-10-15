import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MovieIdParamsSchema, type DecisionStatus, type MovieDetails } from '@reelmark/shared';

import { ActionButton } from '@/components/action-button';
import { AppText } from '@/components/app-text';
import { DeckActions } from '@/components/deck-actions';
import { IconButton } from '@/components/icon-button';
import { LibraryDecision } from '@/components/library-decision';
import { MovieDetailsHeader, MovieStory, ScoresRow } from '@/components/movie-details';
import { StatusCard } from '@/components/status-card';
import { WatchOptions } from '@/components/watch-options';
import { useCachedLibraryItem } from '@/hooks/use-library';
import { useMovieDetails } from '@/hooks/use-movie-details';
import { useI18n } from '@/i18n';
import { getDeckDecider } from '@/lib/deck-bridge';
import { describeError } from '@/lib/error-messages';
import { ApiError } from '@/lib/http';
import { colors, radii, sizes, spacing } from '@/theme';

/**
 * The sheet fits its content, so a fixed height keeps it from jumping between the loading,
 * error and loaded states; the content scrolls inside.
 */
const SHEET_HEIGHT = 0.9;

/**
 * The movie sheet: everything needed to decide (trailer, scores, story, where to watch) and the
 * decision itself. Opened from the deck (`?from=deck`), the library, or a deep link to any id.
 */
export default function MovieSheet() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  // Route params can come from a deep link, so they are validated like any other input.
  const movieId = MovieIdParamsSchema.safeParse({ movieId: id }).data?.movieId;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { t } = useI18n();
  const details = useMovieDetails(movieId);
  // Settled once: the deck's top card can't change while its sheet covers the deck.
  const [fromDeck] = useState(
    () => from === 'deck' && movieId !== undefined && getDeckDecider(movieId) !== undefined,
  );

  const close = (
    <IconButton icon="close" accessibilityLabel={t('common.close')} onPress={router.back} />
  );
  const notFound = movieId === undefined || isNotFound(details.error);

  let content;
  if (notFound) {
    content = (
      <>
        <View style={styles.closeRow}>{close}</View>
        <StatusCard
          plain
          icon="empty"
          title={t('detail.notFoundTitle')}
          message={t('detail.notFoundMessage')}
        />
      </>
    );
  } else if (details.isPending) {
    content = (
      <>
        <View style={styles.closeRow}>{close}</View>
        <DetailsSkeleton />
      </>
    );
  } else if (details.isError) {
    const copy = describeError(details.error);
    content = (
      <>
        <View style={styles.closeRow}>{close}</View>
        <StatusCard
          plain
          icon={copy.icon}
          title={t(copy.title)}
          message={t(copy.message)}
          action={{
            label: t('deck.retry'),
            icon: 'retry',
            onPress: () => void details.refetch(),
          }}
        />
      </>
    );
  } else {
    content = (
      <Loaded
        details={details.data}
        close={close}
        fromDeck={fromDeck}
        onDone={() => router.back()}
        onPlay={(key) => router.push({ pathname: '/trailer/[key]', params: { key } })}
      />
    );
  }

  return (
    <ScrollView
      style={{ height: height * SHEET_HEIGHT }}
      contentContainerStyle={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}
    >
      {content}
    </ScrollView>
  );
}

type LoadedProps = {
  details: MovieDetails;
  close: ReactNode;
  fromDeck: boolean;
  /** Closes the sheet. */
  onDone: () => void;
  onPlay: (youtubeKey: string) => void;
};

function Loaded({ details, close, fromDeck, onDone, onPlay }: LoadedProps) {
  const { t } = useI18n();
  const movieId = details.movie.id;
  const cached = useCachedLibraryItem(movieId);
  // A snapshot: after an edit, the movie may leave the cached list it was opened from.
  const [initial] = useState(
    () => cached && { status: cached.decision.status, liked: cached.decision.liked },
  );
  const { trailer } = details;

  function decideInDeck(status: DecisionStatus) {
    getDeckDecider(movieId)?.(status);
    onDone();
  }

  return (
    <>
      <MovieDetailsHeader details={details} action={close} />
      {trailer ? (
        <ActionButton
          label={t('detail.trailer')}
          icon="play"
          accessibilityHint={t('detail.trailerHint')}
          onPress={() => onPlay(trailer.youtubeKey)}
        />
      ) : null}
      <ScoresRow details={details} />
      <MovieStory details={details} />
      <View style={styles.divider} />
      <WatchOptions watch={details.watch} />
      <View style={styles.divider} />
      {fromDeck ? (
        <View style={styles.deckDecision}>
          <AppText variant="label">{t('detail.decision')}</AppText>
          <DeckActions enabled onDecide={decideInDeck} />
        </View>
      ) : (
        <LibraryDecision movieId={movieId} initial={initial} onRemoved={onDone} />
      )}
    </>
  );
}

/** Placeholder blocks in the shape of the loaded sheet. */
function DetailsSkeleton() {
  const { t } = useI18n();
  return (
    <View
      style={styles.skeleton}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('detail.loading')}
    >
      <View style={styles.skeletonHeader}>
        <View style={[styles.block, styles.skeletonPoster]} />
        <View style={styles.skeletonLines}>
          <View style={[styles.block, styles.lineWide]} />
          <View style={[styles.block, styles.lineShort]} />
        </View>
      </View>
      <View style={[styles.block, styles.skeletonButton]} />
      {[0, 1, 2, 3].map((line) => (
        <View key={line} style={[styles.block, styles.lineFull]} />
      ))}
    </View>
  );
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl,
    gap: spacing.xl,
  },
  closeRow: {
    alignItems: 'flex-end',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  deckDecision: {
    gap: spacing.md,
  },
  skeleton: {
    gap: spacing.lg,
  },
  skeletonHeader: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  skeletonPoster: {
    width: sizes.detailPoster,
    aspectRatio: sizes.cardAspectRatio,
  },
  skeletonLines: {
    flex: 1,
    gap: spacing.sm,
  },
  skeletonButton: {
    height: sizes.actionButton,
    borderRadius: radii.full,
  },
  block: {
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceRaised,
  },
  lineWide: {
    height: spacing.xxl,
    width: '80%',
  },
  lineShort: {
    height: spacing.lg,
    width: '50%',
  },
  lineFull: {
    height: spacing.lg,
  },
});
