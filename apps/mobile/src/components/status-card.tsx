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
};

/** Card-shaped message shown in place of the deck: errors, empty and finished states. */
export function StatusCard({ icon, title, message, action }: StatusCardProps) {
  return (
    <View style={styles.card}>
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
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
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
