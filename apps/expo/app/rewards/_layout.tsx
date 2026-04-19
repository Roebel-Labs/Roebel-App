import React from 'react';
import { Stack } from 'expo-router';

export default function RewardsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'default' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="schatzkammer" />
      <Stack.Screen name="referral" />
      <Stack.Screen name="lootbox/[id]" />
      <Stack.Screen name="reward/[id]" />
    </Stack>
  );
}
