import { Pressable, StyleSheet, View } from 'react-native';

import type { DecisionStatus } from '@reelmark/shared';

import { useI18n } from '@/i18n';
import { colors, radii, sizes, spacing, type ColorToken } from '@/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

type DeckActionsProps = {
  /** False while there is no card to decide on. */
  enabled: boolean;
  canUndo: boolean;
  onDecide: (status: DecisionStatus) => void;
  onUndo: () => void;
};

/** Buttons under the deck: undo, plus the same three decisions as the swipe gestures. */
export function DeckActions({ enabled, canUndo, onDecide, onUndo }: DeckActionsProps) {
  const { t } = useI18n();

  return (
    <View style={styles.row}>
      <RoundButton
        icon="undo"
        label={t('deck.undo')}
        hint={t('deck.undoHint')}
        small
        disabled={!canUndo}
        onPress={onUndo}
      />
      <RoundButton
        icon="notSeen"
        label={t('deck.notSeen')}
        hint={t('deck.notSeenHint')}
        disabled={!enabled}
        onPress={() => onDecide('not_seen')}
      />
      <RoundButton
        icon="want"
        iconColor="want"
        label={t('deck.want')}
        hint={t('deck.wantHint')}
        disabled={!enabled}
        onPress={() => onDecide('want')}
      />
      <RoundButton
        icon="seen"
        label={t('deck.seen')}
        hint={t('deck.seenHint')}
        primary
        disabled={!enabled}
        onPress={() => onDecide('seen')}
      />
    </View>
  );
}

type RoundButtonProps = {
  icon: IconName;
  iconColor?: ColorToken;
  label: string;
  hint: string;
  /** Filled with the accent colour. */
  primary?: boolean;
  small?: boolean;
  disabled: boolean;
  onPress: () => void;
};

function RoundButton({
  icon,
  iconColor = 'textPrimary',
  label,
  hint,
  primary = false,
  small = false,
  disabled,
  onPress,
}: RoundButtonProps) {
  const size = small ? sizes.deckButtonSmall : sizes.deckButton;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.item, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.circle,
          { width: size, height: size },
          primary ? styles.primary : styles.secondary,
        ]}
      >
        <Icon
          name={icon}
          size={small ? sizes.icon : sizes.statusIcon}
          color={primary ? 'onAccent' : small ? 'textSecondary' : iconColor}
        />
      </View>
      <AppText variant="micro" color="textSecondary" numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-end',
  },
  item: {
    alignItems: 'center',
    gap: spacing.xs + spacing.xxs,
    minWidth: sizes.deckButton,
  },
  circle: {
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
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
  disabled: {
    opacity: 0.4,
  },
});
