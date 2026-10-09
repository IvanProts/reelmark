import { Pressable, StyleSheet } from 'react-native';

import { colors, radii, sizes, spacing } from '@/theme';

import { Icon, type IconName } from './icon';

type IconButtonProps = {
  icon: IconName;
  /** Required: an icon alone means nothing to a screen reader. */
  accessibilityLabel: string;
  onPress: () => void;
};

/** Round, quiet button with just an icon (header actions, close buttons). */
export function IconButton({ icon, accessibilityLabel, onPress }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // Already 44×44; hitSlop just makes it more forgiving.
      hitSlop={spacing.xs}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Icon name={icon} color="textSecondary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  pressed: {
    backgroundColor: colors.border,
  },
});
