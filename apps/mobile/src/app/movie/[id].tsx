import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type DecisionStatus, MovieIdParamsSchema } from '@reelmark/shared';

import { AppText } from '@/components/app-text';
import { DangerButton } from '@/components/danger-button';
import { Icon, type IconName } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { SegmentedControl } from '@/components/segmented-control';
import { useDeleteDecision, useSaveDecision } from '@/hooks/use-decisions';
import { useCachedLibraryItem } from '@/hooks/use-library';
import { useI18n } from '@/i18n';
import { formatRating, hasRating } from '@/lib/format';
import { colors, radii, sizes, spacing } from '@/theme';

type Decision = { status: DecisionStatus; liked: boolean | null };

/** Movie details from the library, where the decision can be changed or removed. A sheet. */
export default function MovieDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Route params can come from a deep link, so they are validated like any other input.
  const movieId = MovieIdParamsSchema.safeParse({ movieId: id }).data?.movieId;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const cached = useCachedLibraryItem(movieId);
  // A snapshot: after an edit, the movie may leave the cached list it was opened from.
  const [item] = useState(cached);
  const [decision, setDecision] = useState<Decision | undefined>(
    cached && { status: cached.decision.status, liked: cached.decision.liked },
  );
  const [failed, setFailed] = useState(false);
  const saveDecision = useSaveDecision();
  const deleteDecision = useDeleteDecision();

  const sheetPadding = { paddingBottom: Math.max(insets.bottom, spacing.xl) };

  if (!item || !decision) {
    return (
      <View style={[styles.sheet, sheetPadding]}>
        <View style={styles.closeRow}>
          <IconButton icon="close" accessibilityLabel={t('common.close')} onPress={router.back} />
        </View>
        <AppText color="textSecondary">{t('detail.notFound')}</AppText>
      </View>
    );
  }

  const { movie } = item;

  // Optimistic: the sheet shows the change at once and reverts if saving fails.
  function change(next: Decision) {
    const previous = decision;
    setDecision(next);
    setFailed(false);
    saveDecision.mutate(
      { movieId: movie.id, ...next },
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
    deleteDecision.mutate(movie.id, {
      onSuccess: () => router.back(),
      onError: () => setFailed(true),
    });
  }

  const meta = [
    movie.year,
    hasRating(movie.rating) ? `★ ${formatRating(movie.rating, locale)}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');
  const statusOptions = [
    { value: 'seen' as const, label: t('deck.seen') },
    { value: 'not_seen' as const, label: t('deck.notSeen') },
    { value: 'want' as const, label: t('deck.want') },
  ];

  return (
    <View style={[styles.sheet, sheetPadding]}>
      <View style={styles.header}>
        <Image
          source={movie.posterUrl}
          style={styles.poster}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
        <View style={styles.headerText}>
          <AppText variant="headline" accessibilityRole="header">
            {movie.title}
          </AppText>
          {meta ? (
            <AppText variant="caption" color="textSecondary">
              {meta}
            </AppText>
          ) : null}
          {movie.genres.length > 0 ? (
            <AppText variant="caption" color="textTertiary">
              {movie.genres.join(', ')}
            </AppText>
          ) : null}
        </View>
        <IconButton icon="close" accessibilityLabel={t('common.close')} onPress={router.back} />
      </View>

      <AppText variant="callout" color="textSecondary" numberOfLines={7}>
        {movie.overview.trim() || t('card.noOverview')}
      </AppText>

      <View style={styles.section}>
        <AppText variant="label">{t('detail.decision')}</AppText>
        <SegmentedControl
          options={statusOptions}
          selected={decision.status}
          onChange={(status) =>
            change({ status, liked: status === 'seen' ? decision.liked : null })
          }
          accessibilityLabel={t('detail.decision')}
        />
        {decision.status === 'seen' ? (
          <View style={styles.likedRow}>
            <AppText variant="body" color="textSecondary" style={styles.likedLabel}>
              {t('deck.likedQuestion')}
            </AppText>
            <LikedToggle
              icon="thumbUp"
              label={t('deck.liked')}
              checked={decision.liked === true}
              onPress={() =>
                change({ status: 'seen', liked: decision.liked === true ? null : true })
              }
            />
            <LikedToggle
              icon="thumbDown"
              label={t('deck.disliked')}
              checked={decision.liked === false}
              onPress={() =>
                change({ status: 'seen', liked: decision.liked === false ? null : false })
              }
            />
          </View>
        ) : null}
      </View>

      {failed ? (
        <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
          {t('detail.saveFailed')}
        </AppText>
      ) : null}

      <DangerButton
        label={t('detail.remove')}
        hint={t('detail.removeHint')}
        onPress={remove}
        disabled={deleteDecision.isPending}
      />
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
  sheet: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl,
    gap: spacing.lg,
  },
  closeRow: {
    alignItems: 'flex-end',
  },
  header: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'flex-start',
  },
  poster: {
    width: sizes.detailPoster,
    aspectRatio: sizes.cardAspectRatio,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
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
