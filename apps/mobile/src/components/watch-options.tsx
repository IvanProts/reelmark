import { Linking, StyleSheet, View } from 'react-native';

import { Image } from 'expo-image';

import type { WatchOptions as Options, WatchProvider } from '@reelmark/shared';

import { useI18n } from '@/i18n';
import { colors, radii, sizes, spacing } from '@/theme';

import { ActionButton } from './action-button';
import { AppText } from './app-text';

/**
 * Where to watch in the device's country: stream, rent and buy rows of provider logos, the
 * JustWatch credit their terms require, and TMDB's page with every offer.
 */
export function WatchOptions({ watch }: { watch: Options }) {
  const { t } = useI18n();
  const rows = [
    { label: t('watch.stream'), providers: watch.stream },
    { label: t('watch.rent'), providers: watch.rent },
    { label: t('watch.buy'), providers: watch.buy },
  ].filter((row) => row.providers.length > 0);
  const { link } = watch;

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <AppText variant="label" accessibilityRole="header" style={styles.title}>
          {t('watch.title')}
        </AppText>
        <AppText variant="caption" color="textTertiary">
          {t('watch.region', { region: watch.region })}
        </AppText>
      </View>

      {rows.length === 0 ? (
        <AppText color="textSecondary">{t('watch.none')}</AppText>
      ) : (
        rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <AppText variant="caption" color="textSecondary">
              {row.label}
            </AppText>
            <View style={styles.logos}>
              {row.providers.map((provider) => (
                <ProviderLogo key={provider.name} provider={provider} />
              ))}
            </View>
          </View>
        ))
      )}

      <AppText variant="micro" color="textTertiary">
        {t('watch.credit')}
      </AppText>

      {link ? (
        <ActionButton
          label={t('watch.link')}
          icon="external"
          variant="secondary"
          accessibilityHint={t('watch.linkHint')}
          // The contract only admits https links to www.themoviedb.org.
          onPress={() => void Linking.openURL(link).catch(() => undefined)}
        />
      ) : null}
    </View>
  );
}

function ProviderLogo({ provider }: { provider: WatchProvider }) {
  return (
    <View
      style={styles.logo}
      accessible
      accessibilityRole="image"
      accessibilityLabel={provider.name}
    >
      <Image
        source={provider.logoUrl}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={150}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  row: {
    gap: spacing.sm,
  },
  logos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  logo: {
    width: sizes.providerLogo,
    height: sizes.providerLogo,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.posterBorder,
  },
});
