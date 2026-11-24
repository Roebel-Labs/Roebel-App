import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNavigation from '@/components/BottomNavigation';
import { useShellGuard } from '@/lib/navigation/useShellGuard';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

/** Org shell "Dashboard" section (charts land in Phase 3). */
export default function DashboardTab() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  useShellGuard('dashboard');
  return (
    <View style={[styles.flex, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Dashboard</Text>
      <View style={styles.nav} pointerEvents="box-none">
        <BottomNavigation activeTab="dashboard" glass />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { fontFamily: fontFamily.heading, fontSize: 34, paddingHorizontal: 16 },
  nav: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
