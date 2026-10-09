import { StyleSheet, View } from 'react-native';

import Animated, {
  css,
  FadeIn,
  withTiming,
  type ExitAnimationsValues,
  type SharedValue,
} from 'react-native-reanimated';

import type { MovieCard as Movie } from '@reelmark/shared';

import { colors, radii, sizes } from '@/theme';

import { MovieCard } from './movie-card';

const STACK_MS = 280;
const FLY_OUT_MS = 320;
/** How much the card tilts while flying out. */
const FLY_OUT_TILT_DEG = 12;

/** -1 = the card leaves to the left ("not seen"), 1 = to the right ("seen"). */
export type ExitDirection = -1 | 1;

type CardStackProps = {
  current: Movie;
  next?: Movie;
  /**
   * Which way the top card flies out. A shared value rather than a plain prop: the exit
   * animation runs after React has removed the card, and reads the value at that moment.
   */
  exitDirection: SharedValue<ExitDirection>;
};

/**
 * The top movie card with the next one peeking out from behind it.
 *
 * When `current` changes, the old top card flies out and the card behind grows into its
 * place: React keeps that component (same `key`), so a CSS transition animates its transform.
 *
 * TODO(phase-1): drive the top card with a Pan gesture and decide once it passes a threshold.
 */
export function CardStack({ current, next, exitDirection }: CardStackProps) {
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
            exiting={isTop ? flyOut(exitDirection) : undefined}
            style={[styles.layer, transitions.transform, isTop ? styles.top : styles.behind]}
            // The card behind is decoration: not touchable, not read aloud.
            pointerEvents={isTop ? 'auto' : 'none'}
            accessibilityElementsHidden={!isTop}
            importantForAccessibility={isTop ? 'auto' : 'no-hide-descendants'}
          >
            <MovieCard {...movie} />
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

/**
 * Exit animation: the card slides off-screen sideways with a slight tilt.
 * `'worklet'` makes the function run on the UI thread.
 */
function flyOut(direction: SharedValue<ExitDirection>) {
  return (values: ExitAnimationsValues) => {
    'worklet';
    const dir = direction.get();
    const config = { duration: FLY_OUT_MS };
    return {
      initialValues: {
        originX: values.currentOriginX,
        opacity: 1,
        transform: [{ rotate: '0deg' }],
      },
      animations: {
        originX: withTiming(values.currentOriginX + dir * values.windowWidth, config),
        opacity: withTiming(0, config),
        transform: [{ rotate: withTiming(`${dir * FLY_OUT_TILT_DEG}deg`, config) }],
      },
    };
  };
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
