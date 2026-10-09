import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { useRouter } from 'expo-router';

import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { AppText } from '@/components/app-text';
import { CardStack, type ExitDirection } from '@/components/card-stack';
import { IconButton } from '@/components/icon-button';
import { MovieCardSkeleton } from '@/components/movie-card-skeleton';
import { StatusCard } from '@/components/status-card';
import { useDeck } from '@/hooks/use-deck';
import { useI18n } from '@/i18n';
import { describeError } from '@/lib/error-messages';
import { sizes, spacing } from '@/theme';

type Size = { width: number; height: number };

/** Deck screen: one movie card at a time, with "Not seen" / "Seen it" actions below. */
export default function DeckScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const deck = useDeck();
  const exitDirection = useSharedValue<ExitDirection>(1);
  // Space available for the card; known only after the first layout pass.
  const [area, setArea] = useState<Size | null>(null);

  function decide(decision: 'seen' | 'notSeen') {
    // TODO(phase-1): save the decision through the API.
    exitDirection.set(decision === 'seen' ? 1 : -1);
    deck.advance();
  }

  const card = area ? fitCard(area) : null;
  const showActions = deck.status === 'ready' || deck.status === 'loading';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <AppText variant="headline" accessibilityRole="header">
          {t('app.name')}
        </AppText>
        <View style={styles.headerEnd}>
          {deck.position > 0 ? (
            <AppText variant="caption" color="textTertiary" style={styles.counter}>
              {t('deck.counter', { count: deck.position })}
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
            <DeckContent deck={deck} exitDirection={exitDirection} />
          </View>
        ) : null}
      </View>

      {showActions ? (
        <View style={styles.actions}>
          <ActionButton
            label={t('deck.notSeen')}
            icon="notSeen"
            variant="secondary"
            disabled={deck.status !== 'ready'}
            onPress={() => decide('notSeen')}
            accessibilityHint={t('deck.notSeenHint')}
            style={styles.action}
          />
          <ActionButton
            label={t('deck.seen')}
            icon="seen"
            disabled={deck.status !== 'ready'}
            onPress={() => decide('seen')}
            accessibilityHint={t('deck.seenHint')}
            style={styles.action}
          />
        </View>
      ) : null}

      <AppText variant="micro" color="textTertiary" style={styles.credit}>
        {t('deck.credit')}
      </AppText>
    </SafeAreaView>
  );
}

/** What fills the card slot for each deck status. */
function DeckContent({
  deck,
  exitDirection,
}: {
  deck: ReturnType<typeof useDeck>;
  exitDirection: SharedValue<ExitDirection>;
}) {
  const { t } = useI18n();

  switch (deck.status) {
    case 'loading':
      return <MovieCardSkeleton />;
    case 'ready':
      return deck.current ? (
        <CardStack current={deck.current} next={deck.next} exitDirection={exitDirection} />
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
          action={{ label: t('deck.restart'), icon: 'restart', onPress: deck.restart }}
        />
      );
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
    marginVertical: spacing.md,
  },
  cardFrame: {
    marginBottom: sizes.stackPeek,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  action: {
    flex: 1,
  },
  credit: {
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
});
