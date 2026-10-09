import { StyleSheet, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import Animated, { css, useReducedMotion } from 'react-native-reanimated';

import { useI18n } from '@/i18n';
import { colors, radii, shimmerGradient, sizes, spacing, typography } from '@/theme';

/** Loading placeholder shaped like a MovieCard, with a shimmer unless Reduce Motion is on. */
export function MovieCardSkeleton() {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();

  return (
    <View
      style={styles.card}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('deck.loading')}
    >
      <View style={styles.content}>
        <View style={[styles.bar, styles.titleBar]} />
        <View style={[styles.bar, styles.titleBarShort]} />
        <View style={[styles.bar, styles.metaBar]} />
        <View style={styles.chips}>
          <View style={[styles.bar, styles.chip]} />
          <View style={[styles.bar, styles.chip]} />
          <View style={[styles.bar, styles.chip]} />
        </View>
      </View>

      {reduceMotion ? null : (
        // A Reanimated CSS animation: loops on the UI thread with no per-frame JS work.
        <Animated.View style={[styles.shimmer, animations.sweep]} pointerEvents="none">
          <LinearGradient
            colors={shimmerGradient}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

const animations = css.create({
  sweep: {
    animationName: {
      // Percentages are relative to the shimmer band's own width.
      from: { transform: [{ translateX: '-100%' }] },
      to: { transform: [{ translateX: '250%' }] },
    },
    animationDuration: '1.6s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radii.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  bar: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.sm,
  },
  // Bars are as tall as the text they stand in for.
  titleBar: {
    width: '78%',
    height: typography.hero.fontSize,
  },
  titleBarShort: {
    width: '46%',
    height: typography.hero.fontSize,
  },
  metaBar: {
    width: '32%',
    height: typography.caption.fontSize,
    marginTop: spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.xs + spacing.xxs,
    marginTop: spacing.xxs,
  },
  chip: {
    width: '18%',
    height: sizes.badge,
    borderRadius: radii.full,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '40%',
  },
});
