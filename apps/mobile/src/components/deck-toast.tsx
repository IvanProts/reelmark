/** Small pills that float over the bottom of the deck: the "Liked it?" prompt and failures. */
import { Pressable, StyleSheet } from 'react-native';

import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { useI18n } from '@/i18n';
import { colors, radii, sizes, spacing } from '@/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

/** Asks whether a movie just marked as seen was liked. Ignoring it is fine. */
export function LikedPrompt({ onAnswer }: { onAnswer: (liked: boolean) => void }) {
  const { t } = useI18n();
  return (
    <Animated.View entering={FadeInDown} exiting={FadeOutDown} style={styles.pill}>
      <AppText variant="label" style={styles.text}>
        {t('deck.likedQuestion')}
      </AppText>
      <ToastButton icon="thumbUp" label={t('deck.liked')} onPress={() => onAnswer(true)} />
      <ToastButton icon="thumbDown" label={t('deck.disliked')} onPress={() => onAnswer(false)} />
    </Animated.View>
  );
}

/** Says that a save or undo failed; the deck has already been put back. */
export function FailureNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const { t } = useI18n();
  return (
    <Animated.View
      entering={FadeInDown}
      exiting={FadeOutDown}
      style={styles.pill}
      accessibilityLiveRegion="polite"
    >
      <Icon name="warning" color="accent" />
      <AppText variant="caption" style={styles.text}>
        {message}
      </AppText>
      <ToastButton icon="close" label={t('common.close')} onPress={onDismiss} />
    </Animated.View>
  );
}

function ToastButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Icon name={icon} color="textPrimary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxWidth: '100%',
  },
  text: {
    flexShrink: 1,
  },
  button: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: colors.border,
  },
});
