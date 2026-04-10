import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { FeedType } from '@/lib/types/feed';

type Props = {
  activeTab: FeedType;
  onTabChange: (tab: FeedType) => void;
};

const TABS: { key: FeedType; label: string }[] = [
  { key: 'main', label: 'Für Alle' },
  { key: 'rathaus', label: 'Stadt' },
  { key: 'app', label: 'App' },
];

export default function FeedTabBar({ activeTab, onTabChange }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onTabChange(tab.key)}
            style={[styles.tab, isActive && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Text
              style={[
                styles.tabLabel,
                {
                  color: isActive ? colors.primary : colors.textTertiary,
                  fontFamily: isActive ? 'Inter-Medium' : 'Inter-Regular',
                },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: {
    fontSize: 15,
  },
});
