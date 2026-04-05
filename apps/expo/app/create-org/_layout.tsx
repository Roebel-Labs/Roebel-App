import React, { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';
import { Stack, useSegments } from 'expo-router';
import { CreateOrgWizardProvider } from '@/context/CreateOrgWizardContext';
import { useTheme } from '@/context/ThemeContext';

const STEP_MAP: Record<string, number> = {
  type: 1, info: 2, location: 3, contact: 4, photos: 5, review: 6,
};
const TOTAL_STEPS = 6;

function ProgressBar() {
  const { colors } = useTheme();
  const segments = useSegments();
  const lastSegment = segments[segments.length - 1] || '';
  const step = STEP_MAP[lastSegment] || 0;
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (step > 0) {
      Animated.timing(widthAnim, {
        toValue: (step / TOTAL_STEPS) * 100,
        duration: 250,
        useNativeDriver: false,
      }).start();
    }
  }, [step]);

  if (step === 0) return null; // Hide on intro and success

  return (
    <View style={{ height: 3, backgroundColor: colors.surface }}>
      <Animated.View
        style={{
          height: '100%',
          backgroundColor: colors.primary,
          width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

export default function CreateOrgLayout() {
  return (
    <CreateOrgWizardProvider>
      <ProgressBar />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="type" />
        <Stack.Screen name="info" />
        <Stack.Screen name="location" />
        <Stack.Screen name="contact" />
        <Stack.Screen name="photos" />
        <Stack.Screen name="review" />
        <Stack.Screen name="success" />
      </Stack>
    </CreateOrgWizardProvider>
  );
}
