import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useSegments, useRouter } from 'expo-router';
import { CreateDealWizardProvider, useCreateDealWizard } from '@/context/CreateDealWizardContext';
import { useTheme } from '@/context/ThemeContext';
import ExitWizardSheet from '@/components/ExitWizardSheet';

const STEP_SCREENS = ['type', 'details', 'image', 'schedule', 'review'];

function WizardHeader() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const lastSegment = segments[segments.length - 1] || '';
  const { dispatch } = useCreateDealWizard();
  const [showExit, setShowExit] = useState(false);

  if (!STEP_SCREENS.includes(lastSegment)) return null;

  return (
    <>
      <View style={[styles.header, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => setShowExit(true)} style={styles.cancelButton}>
          <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Abbrechen</Text>
        </Pressable>
      </View>
      <ExitWizardSheet
        visible={showExit}
        onDelete={() => {
          dispatch({ type: 'RESET' });
          setShowExit(false);
          router.replace('/org/ads');
        }}
        onSaveAndExit={() => {
          setShowExit(false);
          router.replace('/org/ads');
        }}
        onCancel={() => setShowExit(false)}
      />
    </>
  );
}

export default function CreateDealLayout() {
  return (
    <CreateDealWizardProvider>
      <WizardHeader />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="type" />
        <Stack.Screen name="details" />
        <Stack.Screen name="image" />
        <Stack.Screen name="schedule" />
        <Stack.Screen name="review" />
        <Stack.Screen name="success" />
      </Stack>
    </CreateDealWizardProvider>
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
