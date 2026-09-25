import React from 'react';
import { Stack } from 'expo-router';
import { ChatProvider } from '@/context/ChatContext';

/** Mecky Chat routes (index, [threadId], computer/[threadId], ultra). Screens are auto-discovered. */
export default function ChatLayout() {
  return (
    <ChatProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'default' }}>
        <Stack.Screen name="ultra" options={{ presentation: 'modal' }} />
      </Stack>
    </ChatProvider>
  );
}
