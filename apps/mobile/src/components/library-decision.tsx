import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { DecisionStatus } from '@reelmark/shared';

import { useDeleteDecision, useSaveDecision } from '@/hooks/use-decisions';
import { useI18n } from '@/i18n';
import { colors, radii, sizes, spacing } from '@/theme';

import { AppText } from './app-text';
import { DangerButton } from './danger-button';
import { Icon, type IconName } from './icon';
import { SegmentedControl } from './segmented-control';

export type Decision = { status: DecisionStatus; liked: boolean | null };

type LibraryDecisionProps = {
  movieId: number;
  /** The saved decision, when known (e.g. the movie was opened from the library). */
  initial: Decision | undefined;
  /** Called after the decision was removed. */
  onRemoved: () => void;
};

/** Change or remove a saved decision, or make one for a movie opened from a link. */
export function LibraryDecision({ movieId, initial, onRemoved }: LibraryDecisionProps) {
  const { t } = useI18n();
  const [decision, setDecision] = useState(initial);
  const [failed, setFailed] = useState(false);
  const saveDecision = useSaveDecision();
  const deleteDecision = useDeleteDecision();

  // Optimistic: the sheet shows the change at once and reverts if saving fails.
  function change(next: Decision) {
    const previous = decision;
    setDecision(next);
    setFailed(false);
    saveDecision.mutate(
      { movieId, ...next },
      {
        onError: () => {
          setDecision(previous);
          setFailed(true);
        },
      },
    );
  }

  function remove() {
    setFailed(false);
    deleteDecision.mutate(movieId, {
      onSuccess: onRemoved,
      onError: () => setFailed(true),
    });
  }

  const statusOptions = [
    { value: 'seen' as const, label: t('deck.seen') },
    { value: 'not_seen' as const, label: t('deck.notSeen') },
    { value: 'want' as const, label: t('deck.want') },
  ];
  const liked = decision?.liked ?? null;

  return (
    <View style={styles.section}>
      <AppText variant="label">{t('detail.decision')}</AppText>
      <SegmentedControl
        options={statusOptions}
        selected={decision?.status}
        onChange={(status) => change({ status, liked: status === 'seen' ? liked : null })}
        accessibilityLabel={t('detail.decision')}
      />
      {decision?.status === 'seen' ? (
        <View style={styles.likedRow}>
          <AppText variant="body" color="textSecondary" style={styles.likedLabel}>
            {t('deck.likedQuestion')}
          </AppText>
          <LikedToggle
            icon="thumbUp"
            label={t('deck.liked')}
            checked={liked === true}
            onPress={() => change({ status: 'seen', liked: liked === true ? null : true })}
          />
          <LikedToggle
            icon="thumbDown"
            label={t('deck.disliked')}
            checked={liked === false}
            onPress={() => change({ status: 'seen', liked: liked === false ? null : false })}
          />
        </View>
      ) : null}

      {failed ? (
        <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
          {t('detail.saveFailed')}
        </AppText>
      ) : null}

      {decision ? (
        <DangerButton
          label={t('detail.remove')}
          hint={t('detail.removeHint')}
          onPress={remove}
          disabled={deleteDecision.isPending}
        />
      ) : null}
    </View>
  );
}

/** 👍 or 👎; tapping the selected one again clears the rating. */
function LikedToggle({
  icon,
  label,
  checked,
  onPress,
}: {
  icon: IconName;
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="togglebutton"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      style={({ pressed }) => [
        styles.toggle,
        checked && styles.toggleChecked,
        pressed && styles.pressed,
      ]}
    >
      <Icon name={icon} color={checked ? 'onAccent' : 'textSecondary'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  likedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  likedLabel: {
    flex: 1,
  },
  toggle: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  toggleChecked: {
    backgroundColor: colors.accent,
  },
  pressed: {
    opacity: 0.7,
  },
});
