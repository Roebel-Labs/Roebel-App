import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useExtendedMode } from '@/context/ExtendedModeContext';

// Import SVG icons using react-native-svg-transformer
import HomeStroke from '../assets/icons/bottom-nav/home.svg';
import HomeFilled from '../assets/icons/bottom-nav/home-filled.svg';
import DiscoverStroke from '../assets/icons/bottom-nav/discover.svg';
import DiscoverFilled from '../assets/icons/bottom-nav/discover_fill.svg';
import MapStroke from '../assets/icons/bottom-nav/maps-location.svg';
import MapFilled from '../assets/icons/bottom-nav/maps-location-filled.svg';
import UserStroke from '../assets/icons/bottom-nav/user-circle.svg';
import UserFilled from '../assets/icons/bottom-nav/user-circle-filled.svg';

export type TabKey = 'home' | 'explore' | 'map' | 'profile';

/** Content height of the bottom nav (excluding safe area inset). Use for positioning elements above the nav. */
export const BOTTOM_NAV_HEIGHT = 56;

type Props = {
  activeTab: TabKey;
  onTabPress: (tab: TabKey) => void;
};

export default function BottomNavigation({ activeTab, onTabPress }: Props) {
  const { colors } = useTheme();
  const { isExtendedMode } = useExtendedMode();
  const iconColor = colors.textPrimary;

  // Middle tab depends on mode
  const middleTabKey: TabKey = isExtendedMode ? 'explore' : 'map';
  const isMiddleActive = activeTab === middleTabKey;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.tabsContainer}>
        <Pressable
          onPress={() => onTabPress('home')}
          style={[styles.tab, activeTab === 'home' && styles.activeTab]}
        >
          {activeTab === 'home' ? (
            <HomeFilled width={24} height={24} color={iconColor} />
          ) : (
            <HomeStroke width={24} height={24} color={iconColor} />
          )}
        </Pressable>

        <Pressable
          onPress={() => onTabPress(middleTabKey)}
          style={[styles.tab, isMiddleActive && styles.activeTab]}
        >
          {isExtendedMode ? (
            isMiddleActive ? (
              <DiscoverFilled width={24} height={24} color={iconColor} />
            ) : (
              <DiscoverStroke width={24} height={24} color={iconColor} />
            )
          ) : (
            isMiddleActive ? (
              <MapFilled width={24} height={24} color={iconColor} />
            ) : (
              <MapStroke width={24} height={24} color={iconColor} />
            )
          )}
        </Pressable>

        <Pressable
          onPress={() => onTabPress('profile')}
          style={[styles.tab, activeTab === 'profile' && styles.activeTab]}
        >
          {activeTab === 'profile' ? (
            <UserFilled width={24} height={24} color={iconColor} />
          ) : (
            <UserStroke width={24} height={24} color={iconColor} />
          )}
        </Pressable>
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
  activeTab: {
    // Active tab styling if needed
  },
});
