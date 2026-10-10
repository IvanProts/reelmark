/**
 * A movie card you can swipe: right = seen, left = not seen, up = want to watch.
 * Drag, flick, tap for the overview, or use screen-reader actions; all paths end in `onDecide`.
 */
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  type AccessibilityActionEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { DecisionStatus, MovieCard as Movie } from '@reelmark/shared';

import { useI18n, type PlainTranslationKey } from '@/i18n';
import { decisionMade, thresholdTick } from '@/lib/haptics';
import { colors, radii, spacing, type ColorToken } from '@/theme';

import { AppText } from './app-text';
import { MovieCard, useMovieDescription } from './movie-card';

/** Horizontal drag, as a share of the screen width, that commits seen / not seen. */
const SIDE_THRESHOLD = 0.28;
/** Upward drag, as a share of the screen height, that commits want. */
const UP_THRESHOLD = 0.16;
/** A flick this fast (points per second) commits even a short drag. */
const FLICK_VELOCITY = 900;
const FLY_OUT_MS = 260;
const FADE_OUT_MS = 150;
const MAX_TILT_DEG = 12;

export type SwipeCardHandle = {
  /** Plays the exit animation for `status`, then calls `onDecide`. */
  decide: (status: DecisionStatus) => void;
};

type SwipeCardProps = {
  movie: Movie;
  /** Only the top card reacts to touches and screen readers. */
  interactive: boolean;
  /** For a card restored by undo: the side it flies back in from. */
  enterFrom?: DecisionStatus;
  onDecide: (status: DecisionStatus) => void;
  ref?: Ref<SwipeCardHandle>;
};

type Limits = { side: number; up: number };

export function SwipeCard({ movie, interactive, enterFrom, onDecide, ref }: SwipeCardProps) {
  const { t } = useI18n();
  const description = useMovieDescription(movie);
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  const limits: Limits = { side: width * SIDE_THRESHOLD, up: height * UP_THRESHOLD };
  const start =
    enterFrom && !reduceMotion ? offscreen(enterFrom, width, height, 0) : { x: 0, y: 0 };
  const translateX = useSharedValue(start.x);
  const translateY = useSharedValue(start.y);
  const opacity = useSharedValue(enterFrom && reduceMotion ? 0 : 1);
  /** The decision the drag is currently past the threshold for, if any. */
  const armed = useSharedValue<DecisionStatus | null>(null);
  /** Set once the card is on its way out, so a second decision can't start. */
  const leaving = useSharedValue(false);

  // A card restored by undo flies back to the centre (or fades in with Reduce Motion).
  useEffect(() => {
    if (!enterFrom) return;
    translateX.set(withSpring(0));
    translateY.set(withSpring(0));
    opacity.set(withTiming(1, { duration: FADE_OUT_MS }));
  }, [enterFrom, translateX, translateY, opacity]);

  function commit(status: DecisionStatus) {
    decisionMade();
    onDecide(status);
  }

  function flyOut(status: DecisionStatus) {
    'worklet';
    if (leaving.get()) return;
    leaving.set(true);
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(commit, status);
    };
    if (reduceMotion) {
      opacity.set(withTiming(0, { duration: FADE_OUT_MS }, done));
      return;
    }
    const target = offscreen(status, width, height, translateY.get());
    translateX.set(withTiming(target.x, { duration: FLY_OUT_MS }));
    translateY.set(withTiming(target.y, { duration: FLY_OUT_MS }, done));
  }

  useImperativeHandle(ref, () => ({ decide: (status) => flyOut(status) }));

  const pan = Gesture.Pan()
    .enabled(interactive)
    .onUpdate((event) => {
      // A card on its way out ignores touches: moving it would cancel the exit animation.
      if (leaving.get()) return;
      translateX.set(event.translationX);
      translateY.set(event.translationY);
      const zone = decisionFor(event.translationX, event.translationY, 0, 0, limits);
      if (zone !== armed.get()) {
        armed.set(zone);
        if (zone) scheduleOnRN(thresholdTick);
      }
    })
    .onEnd((event) => {
      if (leaving.get()) return;
      armed.set(null);
      const status = decisionFor(
        event.translationX,
        event.translationY,
        event.velocityX,
        event.velocityY,
        limits,
      );
      if (status) {
        flyOut(status);
      } else {
        translateX.set(withSpring(0));
        translateY.set(withSpring(0));
      }
    });
  const toggleExpanded = () => setExpanded((value) => !value);
  const tap = Gesture.Tap()
    .enabled(interactive)
    .onEnd((_event, success) => {
      if (success) scheduleOnRN(toggleExpanded);
    });
  // The tap only counts if the finger didn't start a drag.
  const gesture = Gesture.Exclusive(pan, tap);

  const cardStyle = useAnimatedStyle(() => {
    const tilt = reduceMotion
      ? 0
      : interpolate(translateX.get(), [-width, 0, width], [-MAX_TILT_DEG, 0, MAX_TILT_DEG]);
    return {
      opacity: opacity.get(),
      transform: [
        { translateX: translateX.get() },
        { translateY: translateY.get() },
        { rotate: `${tilt}deg` },
      ],
    };
  });

  function onAccessibilityAction(event: AccessibilityActionEvent) {
    const action = event.nativeEvent.actionName;
    if (action === 'activate') toggleExpanded();
    else if (action === 'seen') flyOut('seen');
    else if (action === 'notSeen') flyOut('not_seen');
    else if (action === 'want') flyOut('want');
  }

  const overview = movie.overview.trim() || t('card.noOverview');
  const seenStamp = useStampVisibility(translateX, translateY, 'seen', limits);
  const notSeenStamp = useStampVisibility(translateX, translateY, 'not_seen', limits);
  const wantStamp = useStampVisibility(translateX, translateY, 'want', limits);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.card, cardStyle]}
        accessible={interactive}
        accessibilityElementsHidden={!interactive}
        importantForAccessibility={interactive ? 'yes' : 'no-hide-descendants'}
        accessibilityRole="button"
        accessibilityLabel={expanded ? `${description}. ${overview}` : description}
        accessibilityHint={expanded ? t('card.hideOverview') : t('card.showOverview')}
        accessibilityState={{ expanded }}
        accessibilityActions={[
          { name: 'activate' },
          { name: 'seen', label: t('deck.seen') },
          { name: 'notSeen', label: t('deck.notSeen') },
          { name: 'want', label: t('deck.want') },
        ]}
        onAccessibilityAction={onAccessibilityAction}
      >
        <MovieCard {...movie} expanded={expanded} />
        <Stamp
          label="stamp.seen"
          color="accent"
          position={styles.stampLeft}
          visibility={seenStamp}
        />
        <Stamp
          label="stamp.notSeen"
          color="textPrimary"
          position={styles.stampRight}
          visibility={notSeenStamp}
        />
        <Stamp
          label="stamp.want"
          color="want"
          position={styles.stampCenter}
          visibility={wantStamp}
        />
      </Animated.View>
    </GestureDetector>
  );
}

type StampProps = {
  label: PlainTranslationKey;
  color: ColorToken;
  position: StyleProp<ViewStyle>;
  visibility: ReturnType<typeof useStampVisibility>;
};

/** "БАЧИВ" / "НЕ БАЧИВ" / "ХОЧУ", fading in as the drag approaches the threshold. */
function Stamp({ label, color, position, visibility }: StampProps) {
  const { t } = useI18n();
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.stamp, position, { borderColor: colors[color] }, visibility]}
    >
      <AppText variant="stamp" color={color} numberOfLines={1}>
        {t(label)}
      </AppText>
    </Animated.View>
  );
}

function useStampVisibility(
  translateX: SharedValue<number>,
  translateY: SharedValue<number>,
  status: DecisionStatus,
  limits: Limits,
) {
  return useAnimatedStyle(() => {
    const x = translateX.get();
    const y = translateY.get();
    const horizontal = Math.abs(x) >= Math.abs(y);
    let progress = 0;
    if (status === 'seen' && horizontal) progress = x / limits.side;
    if (status === 'not_seen' && horizontal) progress = -x / limits.side;
    if (status === 'want' && !horizontal) progress = -y / limits.up;
    return { opacity: interpolate(progress, [0.25, 1], [0, 1], Extrapolation.CLAMP) };
  });
}

/** The decision for a drag that ended here, or null to spring back. */
function decisionFor(
  x: number,
  y: number,
  velocityX: number,
  velocityY: number,
  limits: Limits,
): DecisionStatus | null {
  'worklet';
  if (Math.abs(x) >= Math.abs(y)) {
    if (x > limits.side || (x > 0 && velocityX > FLICK_VELOCITY)) return 'seen';
    if (x < -limits.side || (x < 0 && velocityX < -FLICK_VELOCITY)) return 'not_seen';
    return null;
  }
  if (y < -limits.up || (y < 0 && velocityY < -FLICK_VELOCITY)) return 'want';
  return null;
}

/** Where a card goes when it leaves for `status` (and where it comes back from). */
function offscreen(status: DecisionStatus, width: number, height: number, currentY: number) {
  'worklet';
  if (status === 'seen') return { x: width * 1.4, y: currentY };
  if (status === 'not_seen') return { x: -width * 1.4, y: currentY };
  return { x: 0, y: -height };
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
  },
  stamp: {
    position: 'absolute',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 3,
    borderRadius: radii.md,
    backgroundColor: colors.stampBackdrop,
  },
  // Each stamp sits on the side the card is moving away from, where it stays in view.
  stampLeft: {
    top: spacing.xxxl,
    left: spacing.xl,
    transform: [{ rotate: '-14deg' }],
  },
  stampRight: {
    top: spacing.xxxl,
    right: spacing.xl,
    transform: [{ rotate: '14deg' }],
  },
  stampCenter: {
    top: '38%',
    alignSelf: 'center',
    transform: [{ rotate: '-6deg' }],
  },
});
