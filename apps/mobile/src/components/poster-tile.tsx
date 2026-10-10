import { Pressable, StyleSheet, View } from 'react-native';

import { Image } from 'expo-image';

import type { LibraryItem } from '@reelmark/shared';

import { useI18n } from '@/i18n';
import { colors, radii, sizes, spacing } from '@/theme';

import { Icon } from './icon';
import { useMovieDescription } from './movie-card';

type PosterTileProps = {
  item: LibraryItem;
  width: number;
  onPress: () => void;
};

/** A poster in the library grid, with a 👍 / 👎 badge when the movie was rated. */
export function PosterTile({ item, width, onPress }: PosterTileProps) {
  const { t } = useI18n();
  const description = useMovieDescription(item.movie);
  const { liked } = item.decision;
  const rating = liked === null ? '' : `, ${t(liked ? 'library.liked' : 'library.disliked')}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${description}${rating}`}
      accessibilityHint={t('library.openHint')}
      // Explicit height: inside a stretching row, `aspectRatio` alone would collapse to zero.
      style={({ pressed }) => [
        styles.tile,
        { width, height: width / sizes.cardAspectRatio },
        pressed && styles.pressed,
      ]}
    >
      <Image
        source={item.movie.posterUrl}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={200}
        recyclingKey={String(item.movie.id)}
        accessibilityIgnoresInvertColors
      />
      {liked === null ? null : (
        <View style={styles.badge}>
          <Icon name={liked ? 'thumbUp' : 'thumbDown'} size={sizes.iconSmall} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.posterBorder,
  },
  pressed: {
    opacity: 0.8,
  },
  badge: {
    position: 'absolute',
    right: spacing.xs + spacing.xxs,
    bottom: spacing.xs + spacing.xxs,
    width: sizes.badge,
    height: sizes.badge,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.stampBackdrop,
  },
});
