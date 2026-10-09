import { StyleSheet, View } from 'react-native';

import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SUPPORTED_LOCALES } from '@reelmark/shared';

import { ActionButton } from '@/components/action-button';
import { AppText } from '@/components/app-text';
import { IconButton } from '@/components/icon-button';
import { SegmentedControl } from '@/components/segmented-control';
import { dictionaries, useI18n } from '@/i18n';
import { colors, radii, spacing } from '@/theme';

const TMDB_URL = 'https://www.themoviedb.org/';
/** Required by TMDB's terms of use: shown word for word in every language, so not translated. */
const TMDB_ATTRIBUTION = 'This product uses the TMDB API but is not endorsed or certified by TMDB.';

// Each language is labelled in itself ("Українська", "English"), so people can
// find theirs even when they can't read the current one.
const LANGUAGE_OPTIONS = SUPPORTED_LOCALES.map((code) => ({
  value: code,
  label: dictionaries[code]['language.name'],
  labelLanguage: code,
}));

/** About sheet: app description, language switch and TMDB attribution. Presented as a form sheet. */
export default function AboutScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version;
  const attributionTranslation = t('about.attributionTranslation');

  return (
    // No `flex: 1`: the sheet uses `fitToContents`, so it sizes itself to this view.
    <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('about.title')}
        </AppText>
        <IconButton
          icon="close"
          accessibilityLabel={t('about.close')}
          onPress={() => router.back()}
        />
      </View>

      <AppText color="textSecondary">{t('about.description', { appName: t('app.name') })}</AppText>

      <View style={styles.section}>
        <AppText variant="label">{t('about.languageTitle')}</AppText>
        <SegmentedControl
          options={LANGUAGE_OPTIONS}
          selected={locale}
          onChange={setLocale}
          accessibilityLabel={t('about.languageTitle')}
        />
      </View>

      <View style={styles.section}>
        <AppText variant="label">{t('about.dataTitle')}</AppText>
        <AppText color="textSecondary">{t('about.dataBody')}</AppText>
        <View style={styles.attribution}>
          <AppText variant="caption" color="textSecondary" accessibilityLanguage="en">
            {TMDB_ATTRIBUTION}
          </AppText>
          {attributionTranslation ? (
            <AppText variant="caption" color="textTertiary">
              {attributionTranslation}
            </AppText>
          ) : null}
        </View>
        <ActionButton
          label={t('about.tmdbLink')}
          icon="external"
          variant="secondary"
          // Opens an in-app browser (Safari View Controller / Chrome Custom Tab).
          onPress={() =>
            openBrowserAsync(TMDB_URL, {
              controlsColor: colors.accent,
              toolbarColor: colors.surface,
            })
          }
          accessibilityHint={t('about.tmdbLinkHint')}
        />
      </View>

      {version ? (
        <AppText variant="caption" color="textTertiary">
          {t('about.version', { version })}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  attribution: {
    gap: spacing.xs,
    padding: spacing.lg,
    marginVertical: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
