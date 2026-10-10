import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { useRouter } from 'expo-router';

import { SafeAreaView } from 'react-native-safe-area-context';

import type { LibraryStatus } from '@reelmark/shared';

import { AppText } from '@/components/app-text';
import { PosterTile } from '@/components/poster-tile';
import { SegmentedControl } from '@/components/segmented-control';
import { StatusCard } from '@/components/status-card';
import { useLibrary } from '@/hooks/use-library';
import { useI18n } from '@/i18n';
import { describeError } from '@/lib/error-messages';
import { colors, radii, sizes, spacing } from '@/theme';

const COLUMNS = 3;
const SKELETON_TILES = 9;

/** Library tab: movies marked as seen or want-to-watch, as a poster grid. */
export default function LibraryScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [status, setStatus] = useState<LibraryStatus>('seen');
  const { items, query } = useLibrary(status);
  const errorCopy = describeError(query.error);
  // Only a pull shows the spinner; background refetches (e.g. on returning to the tab) don't.
  const [pulling, setPulling] = useState(false);

  async function pullToRefresh() {
    setPulling(true);
    try {
      await query.refetch();
    } finally {
      setPulling(false);
    }
  }

  const tileWidth = (width - spacing.lg * 2 - spacing.sm * (COLUMNS - 1)) / COLUMNS;
  const options = [
    { value: 'seen' as const, label: t('library.seen') },
    { value: 'want' as const, label: t('library.want') },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('library.title')}
        </AppText>
        <SegmentedControl
          options={options}
          selected={status}
          onChange={setStatus}
          accessibilityLabel={t('library.list')}
        />
      </View>

      <FlatList
        // A new list per tab, so scroll position and end-reached state don't leak between them.
        key={status}
        data={items}
        keyExtractor={(item) => String(item.movie.id)}
        numColumns={COLUMNS}
        renderItem={({ item }) => (
          <PosterTile
            item={item}
            width={tileWidth}
            onPress={() =>
              router.push({ pathname: '/movie/[id]', params: { id: String(item.movie.id) } })
            }
          />
        )}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={() => void pullToRefresh()}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          query.isPending ? (
            <View style={styles.row}>
              {Array.from({ length: SKELETON_TILES }, (_, index) => (
                <View
                  key={index}
                  style={[
                    styles.skeleton,
                    { width: tileWidth, height: tileWidth / sizes.cardAspectRatio },
                  ]}
                />
              ))}
            </View>
          ) : query.isError ? (
            <StatusCard
              plain
              icon={errorCopy.icon}
              title={t(errorCopy.title)}
              message={t(errorCopy.message)}
              action={{
                label: t('deck.retry'),
                icon: 'retry',
                onPress: () => void query.refetch(),
              }}
            />
          ) : (
            <StatusCard
              plain
              icon={status === 'seen' ? 'seen' : 'want'}
              title={t(status === 'seen' ? 'library.emptySeenTitle' : 'library.emptyWantTitle')}
              message={t(
                status === 'seen' ? 'library.emptySeenMessage' : 'library.emptyWantMessage',
              )}
            />
          )
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <ActivityIndicator color={colors.accent} style={styles.footer} />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    gap: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  grid: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  skeleton: {
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  footer: {
    marginVertical: spacing.lg,
  },
});
