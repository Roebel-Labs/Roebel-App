import React, { lazy, Suspense } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

// Lazy-load the entire profile content to avoid thirdweb module-scope
// evaluation at tab navigator startup (causes HMR assertion error)
const ProfileContent = lazy(() => import('@/components/profile/ProfileContent'));

function ProfileLoading() {
  const { colors } = useTheme();
  return (
    <View style={[styles.loading, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export default function ProfileTab() {
  return (
    <Suspense fallback={<ProfileLoading />}>
      <ProfileContent />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
