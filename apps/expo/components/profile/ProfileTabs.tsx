import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

export type ProfileTabKey = string;

type Tab<K extends ProfileTabKey> = {
  key: K;
  label: string;
  count?: number;
};

type Props<K extends ProfileTabKey> = {
  tabs: Tab<K>[];
  active: K;
  onChange: (key: K) => void;
};

/**
 * X.com / Facebook-style tab bar. Shows one row of labels with an underline
 * indicator under the active tab. Optional count suffix (e.g. "Beiträge · 12").
 */
export default function ProfileTabs<K extends ProfileTabKey>({ tabs, active, onChange }: Props<K>) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
          >
            <Text
              style={[
                styles.label,
                { color: isActive ? colors.textPrimary : colors.textTertiary },
                isActive && { fontFamily: 'Inter-SemiBold' },
              ]}
            >
              {tab.label}
              {typeof tab.count === 'number' && (
                <Text style={[styles.count, { color: colors.textTertiary }]}> · {tab.count}</Text>
              )}
            </Text>
            {isActive && (
              <View style={[styles.indicator, { backgroundColor: colors.primary }]} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    position: 'relative',
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  count: {
    fontFamily: 'Inter-Regular',
  },
  indicator: {
    position: 'absolute',
    bottom: -1,
    height: 3,
    width: 60,
    borderRadius: 2,
  },
});
