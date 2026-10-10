import { StyleSheet, View } from 'react-native';

import { colors, radii, sizes, spacing } from '@/theme';

import { ActionButton } from './action-button';
import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

type StatusCardProps = {
  icon: IconName;
  title: string;
  message: string;
  action?: {
    label: string;
    icon?: IconName;
    onPress: () => void;
  };
  /** Without the card background, e.g. inside a list. */
  plain?: boolean;
};

/** Message for error, empty and finished states; card-shaped where it replaces the deck. */
export function StatusCard({ icon, title, message, action, plain = false }: StatusCardProps) {
  return (
    <View style={[styles.content, !plain && styles.card]}>
      <View style={styles.iconCircle}>
        <Icon name={icon} size={sizes.statusIcon} color="accent" />
      </View>
      <AppText variant="headline" style={styles.center} accessibilityRole="header">
        {title}
      </AppText>
      <AppText variant="body" color="textSecondary" style={styles.center}>
        {message}
      </AppText>
      {action ? (
        <ActionButton
          label={action.label}
          icon={action.icon}
          onPress={action.onPress}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
  },
  card: {
    flex: 1,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  iconCircle: {
    width: sizes.statusIconCircle,
    height: sizes.statusIconCircle,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    marginBottom: spacing.sm,
  },
  center: {
    textAlign: 'center',
  },
  action: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
});
