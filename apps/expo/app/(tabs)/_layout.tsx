import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';

// Import SVG icons
import HomeStroke from '../../assets/icons/bottom-nav/home.svg';
import HomeFilled from '../../assets/icons/bottom-nav/home-filled.svg';
import DiscoverStroke from '../../assets/icons/bottom-nav/discover.svg';
import DiscoverFilled from '../../assets/icons/bottom-nav/discover_fill.svg';
import UserStroke from '../../assets/icons/bottom-nav/user-circle.svg';
import UserFilled from '../../assets/icons/bottom-nav/user-circle-filled.svg';

export const BOTTOM_NAV_HEIGHT = 56;

function CustomTabBar({ state, navigation }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const iconColor = colors.textPrimary;

  const tabs = [
    {
      key: 'feed',
      route: state.routes[0],
      strokeIcon: HomeStroke,
      filledIcon: HomeFilled,
    },
    {
      key: 'explore',
      route: state.routes[1],
      strokeIcon: DiscoverStroke,
      filledIcon: DiscoverFilled,
    },
    {
      key: 'profile',
      route: state.routes[2],
      strokeIcon: UserStroke,
      filledIcon: UserFilled,
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      <View style={styles.tabsContainer}>
        {tabs.map((tab, index) => {
          const isActive = state.index === index;
          const Icon = isActive ? tab.filledIcon : tab.strokeIcon;

          return (
            <Pressable
              key={tab.key}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: tab.route.key,
                  canPreventDefault: true,
                });
                if (!event.defaultPrevented) {
                  navigation.navigate(tab.route.name);
                }
              }}
              style={[styles.tab, isActive && styles.activeTab]}
            >
              <Icon width={24} height={24} color={iconColor} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
    >
      <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
      <Tabs.Screen name="explore" options={{ title: 'Entdecken' }} />
      <Tabs.Screen name="profile" options={{ title: 'Mein Röbel' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 60,
    paddingHorizontal: 40,
  },
  tab: {
    padding: 10,
  },
  activeTab: {
    // Active tab styling if needed
  },
});
