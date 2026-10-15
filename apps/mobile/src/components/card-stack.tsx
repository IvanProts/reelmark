import type { Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import Animated, { css, FadeIn } from 'react-native-reanimated';

import type { DecisionStatus, MovieCard as Movie } from '@reelmark/shared';

import { colors, radii, sizes } from '@/theme';

import { SwipeCard, type SwipeCardHandle } from './swipe-card';

const STACK_MS = 280;

type CardStackProps = {
  current: Movie;
  next?: Movie;
  /** Controls the top card, so the buttons can play the same exit as a swipe. */
  topCardRef: Ref<SwipeCardHandle>;
  /** A card brought back by undo, and the side it flies back in from. */
  restored?: { movieId: number; from: DecisionStatus };
  onDecide: (movie: Movie, status: DecisionStatus) => void;
  onOpenDetails: (movie: Movie) => void;
};

/**
 * The top movie card with the next one peeking out from behind it.
 *
 * When the top card leaves, the card behind grows into its place: React keeps that component
 * (same `key`), so a CSS transition animates its transform.
 */
export function CardStack({
  current,
  next,
  topCardRef,
  restored,
  onDecide,
  onOpenDetails,
}: CardStackProps) {
  // Render back-to-front: later children are drawn on top.
  const layers = next ? [next, current] : [current];

  return (
    <View style={styles.stack}>
      {layers.map((movie) => {
        const isTop = movie.id === current.id;
        return (
          <Animated.View
            key={movie.id}
            entering={FadeIn.duration(STACK_MS)}
            style={[styles.layer, transitions.transform, isTop ? styles.top : styles.behind]}
            // The card behind is decoration: not touchable, not read aloud.
            pointerEvents={isTop ? 'auto' : 'none'}
          >
            <SwipeCard
              ref={isTop ? topCardRef : undefined}
              movie={movie}
              interactive={isTop}
              enterFrom={restored?.movieId === movie.id ? restored.from : undefined}
              onDecide={(status) => onDecide(movie, status)}
              onOpenDetails={() => onOpenDetails(movie)}
            />
            {/* Fades out as the card behind moves to the front. */}
            <Animated.View
              pointerEvents="none"
              style={[styles.veil, transitions.opacity, { opacity: isTop ? 0 : 1 }]}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

const transitions = css.create({
  transform: {
    transitionProperty: 'transform',
    transitionDuration: STACK_MS,
    transitionTimingFunction: 'ease-out',
  },
  opacity: {
    transitionProperty: 'opacity',
    transitionDuration: STACK_MS,
  },
});

const styles = StyleSheet.create({
  stack: {
    flex: 1,
  },
  layer: {
    ...StyleSheet.absoluteFill,
    // Scale around the bottom edge so the card behind peeks out only below the top one.
    transformOrigin: 'bottom',
  },
  top: {
    transform: [{ translateY: 0 }, { scale: 1 }],
  },
  behind: {
    transform: [{ translateY: sizes.stackPeek }, { scale: sizes.stackScale }],
  },
  veil: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.card,
    backgroundColor: colors.stackVeil,
  },
});
