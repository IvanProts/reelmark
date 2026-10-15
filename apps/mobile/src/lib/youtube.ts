/**
 * The trailer player's page and navigation policy. The player is a WebView around YouTube's
 * privacy-enhanced embed, and may never become a general-purpose browser.
 */
import { Linking } from 'react-native';

import { TrailerSchema } from '@reelmark/shared';

import { colors } from '@/theme';

const YOUTUBE_KEY = TrailerSchema.shape.youtubeKey;

/**
 * The address of the player's own page. YouTube requires an embed inside a native WebView to
 * identify the app through the HTTP Referer, as `https://` + the app id (otherwise playback
 * fails with "Error 153"), so this must stay equal to `ios.bundleIdentifier` and
 * `android.package` in app.json. Nothing is ever fetched from it.
 */
export const PLAYER_BASE_URL = 'https://com.ivanprots.reelmark/';

/** The only page that may load inside the player's frame: YouTube's privacy-enhanced embed. */
const EMBED_URL = /^https:\/\/www\.youtube-nocookie\.com\/embed\//;
/** Links inside the player that leave it for the YouTube app or the browser. */
const YOUTUBE_URL = /^https:\/\/(?:(?:www|m)\.youtube\.com|youtu\.be)\//;

/** Validates a trailer key (e.g. from a deep link) the same way the API contract does. */
export function parseYoutubeKey(value: unknown): string | undefined {
  return YOUTUBE_KEY.safeParse(value).data;
}

/**
 * The player page for a validated key: one full-size iframe and nothing else. Its policy lets
 * the page frame only the embed, and the referrer policy sends our origin with that request.
 */
export function playerHtml(youtubeKey: string): string {
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeKey)}?playsinline=1&rel=0`;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src https://www.youtube-nocookie.com; style-src 'unsafe-inline'">
<style>html,body{margin:0;height:100%;background:${colors.background}}iframe{display:block;width:100%;height:100%;border:0}</style>
</head>
<body>
<iframe src="${src}" title="YouTube" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
</body>
</html>`;
}

/** The trailer on YouTube itself, outside the app. */
export function watchUrl(youtubeKey: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeKey)}`;
}

/**
 * `onShouldStartLoadWithRequest` for the player: our page and the embed load; a YouTube link the
 * viewer follows opens outside the app; everything else (ads, trackers, other sites, app
 * schemes) is blocked.
 */
export function allowPlayerNavigation({
  url,
  isTopFrame,
}: {
  url: string;
  isTopFrame?: boolean;
}): boolean {
  if (url === 'about:blank' || url === PLAYER_BASE_URL || EMBED_URL.test(url)) return true;
  // Only the main page: a hidden frame must not be able to switch apps.
  if (isTopFrame !== false && YOUTUBE_URL.test(url)) {
    Linking.openURL(url).catch(() => undefined);
  }
  return false;
}
