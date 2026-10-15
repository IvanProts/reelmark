import { useEffect, useRef, useState, type RefObject } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { useRouter } from 'expo-router';

import { SafeAreaView } from 'react-native-safe-area-context';

import type { DecisionStatus, MovieCard } from '@reelmark/shared';

import { AppText } from '@/components/app-text';
import { CardStack } from '@/components/card-stack';
import { DeckActions } from '@/components/deck-actions';
import { FailureNotice, LikedPrompt } from '@/components/deck-toast';
import { IconButton } from '@/components/icon-button';
import { MovieCardSkeleton } from '@/components/movie-card-skeleton';
import { StatusCard } from '@/components/status-card';
import type { SwipeCardHandle } from '@/components/swipe-card';
import { useDeck, type DeckFailure } from '@/hooks/use-deck';
import { useMe } from '@/hooks/use-profile';
import { useScreenReaderEnabled } from '@/hooks/use-screen-reader';
import { useI18n, type TranslateFn } from '@/i18n';
import { registerDeckTopCard } from '@/lib/deck-bridge';
import { describeError } from '@/lib/error-messages';
import { sizes, spacing } from '@/theme';

/** How long the "Liked it?" prompt stays; longer with a screen reader, which reads it first. */
const LIKED_PROMPT_MS = 4000;
const LIKED_PROMPT_SCREEN_READER_MS = 10_000;

type Size = { width: number; height: number };

/** Deck tab: swipe through movies, with buttons for the same decisions. */
export default function DeckScreen() {
  const me = useMe();
  // A different account (e.g. after deleting all data) starts with a fresh deck state.
  return <Deck key={me.data?.id ?? 'no-account'} />;
}

function Deck() {
  const router = useRouter();
  const { t } = useI18n();
  const deck = useDeck();
  const screenReader = useScreenReaderEnabled();
  const topCardRef = useRef<SwipeCardHandle>(null);
  // Space available for the card; known only after the first layout pass.
  const [area, setArea] = useState<Size | null>(null);
  const [restored, setRestored] = useState<{ movieId: number; from: DecisionStatus }>();
  const [likedPrompt, setLikedPrompt] = useState<MovieCard | null>(null);

  useEffect(() => {
    if (!likedPrompt) return;
    const timeout = screenReader ? LIKED_PROMPT_SCREEN_READER_MS : LIKED_PROMPT_MS;
    const timer = setTimeout(() => setLikedPrompt(null), timeout);
    return () => clearTimeout(timer);
  }, [likedPrompt, screenReader]);

  function decide(movie: MovieCard, status: DecisionStatus) {
    deck.decide(movie, status);
    setRestored(undefined);
    setLikedPrompt(status === 'seen' ? movie : null);
  }

  function undo() {
    const entry = deck.undo();
    if (!entry) return;
    setLikedPrompt(null);
    setRestored({ movieId: entry.movie.id, from: entry.status });
  }

  function openDetails(movie: MovieCard) {
    router.push({ pathname: '/movie/[id]', params: { id: String(movie.id), from: 'deck' } });
  }

  // The movie sheet's Seen / Not seen / Want buttons act like the buttons below the deck.
  const topCardId = deck.status === 'ready' ? deck.current?.id : undefined;
  useEffect(() => {
    if (topCardId === undefined) return;
    return registerDeckTopCard({
      movieId: topCardId,
      decide: (status) => topCardRef.current?.decide(status),
    });
  }, [topCardId]);

  function answerLiked(liked: boolean) {
    if (likedPrompt) deck.rate(likedPrompt, liked);
    setLikedPrompt(null);
  }

  const card = area ? fitCard(area) : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <AppText variant="headline" accessibilityRole="header">
          {t('app.name')}
        </AppText>
        <View style={styles.headerEnd}>
          {deck.sortedCount > 0 ? (
            <AppText variant="caption" color="textTertiary" style={styles.counter}>
              {t('deck.counter', { count: deck.sortedCount })}
            </AppText>
          ) : null}
          <IconButton
            icon="info"
            accessibilityLabel={t('about.title')}
            onPress={() => router.push('/about')}
          />
        </View>
      </View>

      <View
        style={styles.stage}
        onLayout={(event: LayoutChangeEvent) => setArea(event.nativeEvent.layout)}
      >
        {card ? (
          <View style={[styles.cardFrame, card]}>
            <DeckContent
              deck={deck}
              topCardRef={topCardRef}
              restored={restored}
              onDecide={decide}
              onOpenDetails={openDetails}
            />
          </View>
        ) : null}
        <View style={styles.toastSlot} pointerEvents="box-none">
          {deck.failure ? (
            <FailureNotice
              message={failureMessage(deck.failure, t)}
              onDismiss={deck.dismissFailure}
            />
          ) : likedPrompt ? (
            <LikedPrompt onAnswer={answerLiked} />
          ) : null}
        </View>
      </View>

      <DeckActions
        enabled={deck.status === 'ready'}
        canUndo={deck.canUndo}
        onDecide={(status) => topCardRef.current?.decide(status)}
        onUndo={undo}
      />

      <AppText variant="micro" color="textTertiary" style={styles.credit}>
        {t('deck.credit')}
      </AppText>
    </SafeAreaView>
  );
}

type DeckContentProps = {
  deck: ReturnType<typeof useDeck>;
  topCardRef: RefObject<SwipeCardHandle | null>;
  restored?: { movieId: number; from: DecisionStatus };
  onDecide: (movie: MovieCard, status: DecisionStatus) => void;
  onOpenDetails: (movie: MovieCard) => void;
};

/** What fills the card slot for each deck status. */
function DeckContent({ deck, topCardRef, restored, onDecide, onOpenDetails }: DeckContentProps) {
  const { t } = useI18n();

  switch (deck.status) {
    case 'loading':
      return <MovieCardSkeleton />;
    case 'ready':
      return deck.current ? (
        <CardStack
          current={deck.current}
          next={deck.next}
          topCardRef={topCardRef}
          restored={restored}
          onDecide={onDecide}
          onOpenDetails={onOpenDetails}
        />
      ) : null;
    case 'error': {
      const copy = describeError(deck.error);
      return (
        <StatusCard
          icon={copy.icon}
          title={t(copy.title)}
          message={t(copy.message)}
          action={{ label: t('deck.retry'), icon: 'retry', onPress: deck.retry }}
        />
      );
    }
    case 'empty':
      return (
        <StatusCard
          icon="empty"
          title={t('deck.emptyTitle')}
          message={t('deck.emptyMessage')}
          action={{ label: t('deck.refresh'), icon: 'retry', onPress: deck.retry }}
        />
      );
    case 'finished':
      return (
        <StatusCard
          icon="finished"
          title={t('deck.finishedTitle')}
          message={t('deck.finishedMessage')}
          action={{ label: t('deck.refresh'), icon: 'retry', onPress: deck.retry }}
        />
      );
  }
}

function failureMessage({ kind, title }: DeckFailure, t: TranslateFn): string {
  switch (kind) {
    case 'save':
      return t('deck.saveFailed', { title });
    case 'rate':
      return t('deck.rateFailed', { title });
    case 'undo':
      return t('deck.undoFailed', { title });
  }
}

/**
 * The biggest 2:3 card that fits in the available area, leaving room below
 * it for the card that peeks out from behind.
 */
function fitCard(area: Size): Size {
  const maxHeight = area.height - sizes.stackPeek;
  const width = Math.min(area.width, maxHeight * sizes.cardAspectRatio);
  return { width, height: width / sizes.cardAspectRatio };
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexShrink: 1,
  },
  counter: {
    flexShrink: 1,
    fontVariant: ['tabular-nums'],
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.sm,
  },
  cardFrame: {
    marginBottom: sizes.stackPeek,
  },
  toastSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.xxxl,
    alignItems: 'center',
  },
  credit: {
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
});
