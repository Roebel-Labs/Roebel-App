import React, { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';
import { Stack, useSegments } from 'expo-router';
import { CreateOrgWizardProvider } from '@/context/CreateOrgWizardContext';

const STEP_MAP: Record<string, number> = {
  type: 1, info: 2, location: 3, contact: 4, photos: 5, review: 6,
};
const TOTAL_STEPS = 6;

function ProgressBar() {
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
    <View className="h-[3px] bg-surface">
      <Animated.View
        className="h-full bg-primary"
        style={{ width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }}
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
