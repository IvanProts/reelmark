import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { ActionButton } from '@/components/action-button';
import { IconButton } from '@/components/icon-button';
import { StatusCard } from '@/components/status-card';
import { useI18n } from '@/i18n';
import {
  allowPlayerNavigation,
  parseYoutubeKey,
  PLAYER_BASE_URL,
  playerHtml,
  watchUrl,
} from '@/lib/youtube';
import { colors, spacing } from '@/theme';

/** YouTube's minimum embedded player size, in points. */
const MIN_PLAYER_SIZE = 200;
const VIDEO_ASPECT_RATIO = 16 / 9;
/** Only YouTube's pages may load; anything else goes through `allowPlayerNavigation`. */
const ANY_ORIGIN = ['*'];

/**
 * Full-screen trailer player. The video sits in its own rectangle with all controls of ours
 * outside it, as YouTube's embed rules require.
 */
export default function TrailerScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  // Route params can come from a deep link, so the key is validated like any other input.
  const youtubeKey = parseYoutubeKey(key);
  const router = useRouter();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const playerWidth = Math.max(width, MIN_PLAYER_SIZE);
  const playerHeight = Math.max(playerWidth / VIDEO_ASPECT_RATIO, MIN_PLAYER_SIZE);
  const openOnYoutube = youtubeKey
    ? () => void Linking.openURL(watchUrl(youtubeKey)).catch(() => undefined)
    : undefined;

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, spacing.lg),
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <View style={styles.topBar}>
        <IconButton icon="close" accessibilityLabel={t('trailer.close')} onPress={router.back} />
      </View>

      <View style={styles.stage}>
        {!youtubeKey ? (
          <StatusCard
            plain
            icon="warning"
            title={t('trailer.invalidTitle')}
            message={t('trailer.invalidMessage')}
          />
        ) : failed ? (
          <StatusCard
            plain
            icon="offline"
            title={t('trailer.errorTitle')}
            message={t('trailer.errorMessage')}
            action={
              openOnYoutube
                ? { label: t('trailer.openYoutube'), icon: 'external', onPress: openOnYoutube }
                : undefined
            }
          />
        ) : (
          <>
            {/* The video rectangle: nothing of ours is drawn over it. */}
            <View style={[styles.player, { width: playerWidth, height: playerHeight }]}>
              <WebView
                // Our own one-iframe page, served from the app-id origin YouTube expects.
                source={{ html: playerHtml(youtubeKey), baseUrl: PLAYER_BASE_URL }}
                // Every URL reaches `allowPlayerNavigation`; with the default list the library
                // would hand unlisted schemes to the OS on its own.
                originWhitelist={ANY_ORIGIN}
                onShouldStartLoadWithRequest={allowPlayerNavigation}
                setSupportMultipleWindows={false}
                javaScriptCanOpenWindowsAutomatically={false}
                allowsInlineMediaPlayback
                allowsFullscreenVideo
                allowsLinkPreview={false}
                incognito
                scrollEnabled={false}
                bounces={false}
                onLoadEnd={() => setLoading(false)}
                onError={() => setFailed(true)}
              />
            </View>
            {/* A fixed slot, so the player doesn't move when the spinner goes. */}
            <View style={styles.loadingSlot}>
              {loading ? (
                <ActivityIndicator
                  color={colors.accent}
                  accessibilityLabel={t('trailer.loading')}
                />
              ) : null}
            </View>
          </>
        )}
      </View>

      {openOnYoutube && !failed ? (
        <ActionButton
          label={t('trailer.openYoutube')}
          icon="external"
          variant="secondary"
          onPress={openOnYoutube}
          style={styles.youtube}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  stage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  player: {
    backgroundColor: colors.background,
  },
  loadingSlot: {
    height: spacing.xxxl,
    marginTop: spacing.lg,
    justifyContent: 'center',
  },
  youtube: {
    marginHorizontal: spacing.lg,
  },
});
