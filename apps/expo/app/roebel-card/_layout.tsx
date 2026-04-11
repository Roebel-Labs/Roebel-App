import React from 'react';
import { Stack } from 'expo-router';
import { RoebelCardProvider } from '@/context/RoebelCardContext';

/**
 * Röbel Card nested route tree.
 *
 * Mounts the RoebelCardProvider for every screen in /roebel-card/* so the
 * buyer landing page, partner / partner-register / employer stubs, and any
 * future screens can consume useRoebelCard() without re-wrapping themselves.
 *
 * headerShown is false across the board — each screen draws its own header
 * (matching the wallet / scan / help convention in the app).
 */
export default function RoebelCardLayout() {
  return (
    <RoebelCardProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'default' }} />
    </RoebelCardProvider>
  );
}
