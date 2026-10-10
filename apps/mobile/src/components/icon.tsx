import type { ComponentProps } from 'react';

import { SymbolView } from 'expo-symbols';

import { colors, sizes, type ColorToken } from '@/theme';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

/** Every icon the app uses: SF Symbols on iOS, Material Symbols on Android. */
const ICONS = {
  seen: { ios: 'eye.fill', android: 'visibility' },
  notSeen: { ios: 'eye.slash.fill', android: 'visibility_off' },
  info: { ios: 'info.circle', android: 'info' },
  offline: { ios: 'wifi.slash', android: 'wifi_off' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning' },
  finished: { ios: 'popcorn', android: 'theaters' },
  empty: { ios: 'film.stack', android: 'movie' },
  want: { ios: 'bookmark.fill', android: 'bookmark' },
  undo: { ios: 'arrow.uturn.backward', android: 'undo' },
  thumbUp: { ios: 'hand.thumbsup.fill', android: 'thumb_up' },
  thumbDown: { ios: 'hand.thumbsdown.fill', android: 'thumb_down' },
  deckTab: { ios: 'rectangle.stack.fill', android: 'style' },
  libraryTab: { ios: 'books.vertical.fill', android: 'video_library' },
  trash: { ios: 'trash', android: 'delete' },
  retry: { ios: 'arrow.clockwise', android: 'refresh' },
  expand: { ios: 'chevron.up', android: 'expand_less' },
  collapse: { ios: 'chevron.down', android: 'expand_more' },
  close: { ios: 'xmark', android: 'close' },
  external: { ios: 'arrow.up.right', android: 'open_in_new' },
} as const satisfies Record<string, SymbolName>;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  size?: number;
  color?: ColorToken;
};

/** A decorative platform icon; screen readers skip it and read the adjacent label. */
export function Icon({ name, size = sizes.icon, color = 'textPrimary' }: IconProps) {
  return (
    <SymbolView
      name={ICONS[name]}
      size={size}
      tintColor={colors[color]}
      weight="semibold"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
