import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

export type TaskTabValue = 'available' | 'completed';

interface TaskTabsProps {
  value: TaskTabValue;
  onChange: (v: TaskTabValue) => void;
  availableCount: number;
  completedCount: number;
}

export default function TaskTabs({
  value,
  onChange,
  availableCount,
  completedCount,
}: TaskTabsProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      <TabButton
        label="Verfügbar"
        count={availableCount}
        active={value === 'available'}
        onPress={() => onChange('available')}
      />
      <TabButton
        label="Abgeschlossen"
        count={completedCount}
        active={value === 'completed'}
        onPress={() => onChange('completed')}
      />
    </View>
  );
}

function TabButton({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.tab}>
      <Text
        style={[
          styles.label,
          {
            color: active ? colors.primary : colors.textSecondary,
            fontFamily: active ? 'Inter-SemiBold' : 'Inter-Medium',
          },
        ]}
      >
        {label} {count > 0 && <Text style={styles.count}>({count})</Text>}
      </Text>
      <View
        style={[
          styles.underline,
          { backgroundColor: active ? colors.primary : 'transparent' },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  label: {
    fontSize: 15,
  },
  count: {
    fontSize: 13,
  },
  underline: {
    height: 2,
    width: '55%',
    borderRadius: 1,
  },
});
