import { Pressable, StyleSheet } from 'react-native';

import { colors, radii, sizes, spacing } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

type DangerButtonProps = {
  label: string;
  hint: string;
  onPress: () => void;
  disabled?: boolean;
};

/** A quiet button for destructive actions: red label and trash icon, no fill. */
export function DangerButton({ label, hint, onPress, disabled = false }: DangerButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Icon name="trash" color="danger" />
      <AppText variant="label" color="danger">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: sizes.actionButton,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.surfaceRaised,
  },
  disabled: {
    opacity: 0.4,
  },
});
