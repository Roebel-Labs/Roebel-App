import React from 'react';
import { Stack } from 'expo-router';
import { CreateOrgWizardProvider } from '@/context/CreateOrgWizardContext';

export default function CreateOrgLayout() {
  return (
    <CreateOrgWizardProvider>
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
