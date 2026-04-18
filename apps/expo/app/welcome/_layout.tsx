import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments, useRouter } from 'expo-router';
import { TransitionStack } from '@/lib/navigation/TransitionStack';
import { WelcomeWizardProvider, useWelcomeWizard } from '@/context/WelcomeWizardContext';
import { useUser } from '@/context/UserContext';
import { useTheme } from '@/context/ThemeContext';
import { updateUserOnboarding } from '@/lib/supabase-users';
import ExitWizardSheet from '@/components/ExitWizardSheet';

const STEP_SCREENS = ['name', 'role', 'features'];

function WizardHeader() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const lastSegment = segments[segments.length - 1] || '';
  const { dispatch } = useWelcomeWizard();
  const { user, refreshUser } = useUser();
  const [showExit, setShowExit] = useState(false);

  if (!STEP_SCREENS.includes(lastSegment)) return null;

  const markCompletedAndExit = async () => {
    if (user?.wallet_address) {
      try {
        await updateUserOnboarding(user.wallet_address, { markCompleted: true });
        await refreshUser();
      } catch (err) {
        console.error('Failed to mark onboarding complete on exit:', err);
      }
    }
    dispatch({ type: 'RESET' });
    setShowExit(false);
    router.replace('/profile');
  };

  return (
    <>
      <View style={[styles.header, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => setShowExit(true)} style={styles.cancelButton}>
          <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Abbrechen</Text>
        </Pressable>
      </View>
      <ExitWizardSheet
        visible={showExit}
        onDelete={markCompletedAndExit}
        onSaveAndExit={markCompletedAndExit}
        onCancel={() => setShowExit(false)}
      />
    </>
  );
}

export default function WelcomeLayout() {
  return (
    <WelcomeWizardProvider>
      <WizardHeader />
      <TransitionStack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <TransitionStack.Screen name="index" />
        <TransitionStack.Screen name="name" />
        <TransitionStack.Screen name="role" />
        <TransitionStack.Screen name="features" />
        <TransitionStack.Screen name="consent" />
        <TransitionStack.Screen name="notifications" options={{ animation: 'fade' }} />
      </TransitionStack>
    </WelcomeWizardProvider>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  cancelText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
});
