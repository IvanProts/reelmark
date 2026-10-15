import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, sizes, spacing } from '@/theme';

import { AppText } from './app-text';

type Option<Value extends string> = {
  value: Value;
  label: string;
  /** Language of the label, so VoiceOver pronounces e.g. "English" correctly (iOS). */
  labelLanguage?: string;
};

type SegmentedControlProps<Value extends string> = {
  options: readonly Option<Value>[];
  /** Undefined when nothing has been chosen yet. */
  selected: Value | undefined;
  onChange: (value: Value) => void;
  /** What the whole control is for, read by screen readers ("Language"). */
  accessibilityLabel: string;
};

/**
 * A row of mutually exclusive options, exposed to screen readers as a radio group.
 * Generic over `Value`, so `onChange` receives the exact option type.
 */
export function SegmentedControl<Value extends string>({
  options,
  selected,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<Value>) {
  return (
    <View
      style={styles.track}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const isSelected = option.value === selected;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={option.label}
            accessibilityLanguage={option.labelLanguage}
            style={({ pressed }) => [
              styles.segment,
              isSelected && styles.selected,
              pressed && !isSelected && styles.pressed,
            ]}
          >
            <AppText
              variant="label"
              color={isSelected ? 'onAccent' : 'textSecondary'}
              numberOfLines={1}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: spacing.xs,
    gap: spacing.xs,
    borderRadius: radii.full,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    minHeight: sizes.minTouchTarget,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
  },
  selected: {
    backgroundColor: colors.accent,
  },
  pressed: {
    backgroundColor: colors.surfaceRaised,
  },
});
