import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, sizes, spacing } from '@/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

type ActionButtonProps = {
  label: string;
  icon?: IconName;
  /** `primary` = filled with the accent color; `secondary` = quiet, dark. */
  variant?: 'primary' | 'secondary';
  onPress: () => void;
  disabled?: boolean;
  /** Extra context for screen readers, e.g. what the button will do. */
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

/** Large pill-shaped button used for the main actions of a screen. */
export function ActionButton({
  label,
  icon,
  variant = 'primary',
  onPress,
  disabled = false,
  accessibilityHint,
  style,
}: ActionButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {icon ? <Icon name={icon} color={isPrimary ? 'onAccent' : 'textSecondary'} /> : null}
        <AppText variant="label" color={isPrimary ? 'onAccent' : 'textPrimary'} numberOfLines={1}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: sizes.actionButton,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.4,
  },
});
