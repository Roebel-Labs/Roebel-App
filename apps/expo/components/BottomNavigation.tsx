import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

// Import SVG icons
import HomeStroke from '../assets/icons/bottom-nav/home.svg';
import HomeFilled from '../assets/icons/bottom-nav/home-filled.svg';
import DiscoverStroke from '../assets/icons/bottom-nav/discover.svg';
import DiscoverFilled from '../assets/icons/bottom-nav/discover_fill.svg';
import UserStroke from '../assets/icons/bottom-nav/user-circle.svg';
import UserFilled from '../assets/icons/bottom-nav/user-circle-filled.svg';

export type TabKey = 'home' | 'explore' | 'profile';

export const BOTTOM_NAV_HEIGHT = 56;

type Props = {
  activeTab: TabKey;
  onTabPress: (tab: TabKey) => void;
};

const TABS: { key: TabKey; stroke: any; filled: any }[] = [
  { key: 'home', stroke: HomeStroke, filled: HomeFilled },
  { key: 'explore', stroke: DiscoverStroke, filled: DiscoverFilled },
  { key: 'profile', stroke: UserStroke, filled: UserFilled },
];

export default function BottomNavigation({ activeTab, onTabPress }: Props) {
  const { colors } = useTheme();
  const iconColor = colors.textPrimary;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.tabsContainer}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = isActive ? tab.filled : tab.stroke;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onTabPress(tab.key)}
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

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 8,
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
  activeTab: {},
});
