import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type AccountMode = 'personal' | 'business';

type Props = {
  mode: AccountMode;
  onModeChange: (mode: AccountMode) => void;
};

export default function AccountSwitcher({ mode, onModeChange }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Pressable
        style={[
          styles.tab,
          mode === 'personal' && [styles.tabActive, { backgroundColor: colors.primary }],
        ]}
        onPress={() => onModeChange('personal')}
      >
        <Text
          style={[
            styles.tabText,
            { color: colors.textSecondary },
            mode === 'personal' && { color: colors.onPrimary },
          ]}
        >
          Persönlich
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.tab,
          mode === 'business' && [styles.tabActive, { backgroundColor: colors.primary }],
        ]}
        onPress={() => onModeChange('business')}
      >
        <Text
          style={[
            styles.tabText,
            { color: colors.textSecondary },
            mode === 'business' && { color: colors.onPrimary },
          ]}
        >
          Geschäft
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {},
  tabText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
