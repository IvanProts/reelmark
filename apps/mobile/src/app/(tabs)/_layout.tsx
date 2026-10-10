import { Tabs } from 'expo-router/js-tabs';

import { Icon } from '@/components/icon';
import { useI18n } from '@/i18n';
import { colors } from '@/theme';

/** Bottom tabs: the deck and the library. */
export default function TabsLayout() {
  const { t } = useI18n();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.deck'),
          tabBarIcon: ({ focused }) => (
            <Icon name="deckTab" color={focused ? 'accent' : 'textTertiary'} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t('tabs.library'),
          tabBarIcon: ({ focused }) => (
            <Icon name="libraryTab" color={focused ? 'accent' : 'textTertiary'} />
          ),
        }}
      />
    </Tabs>
  );
}
