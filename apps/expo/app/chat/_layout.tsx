import React from 'react';
import { Stack } from 'expo-router';
import { ChatProvider } from '@/context/ChatContext';
import { ChatSheetsProvider } from '@/components/chat/ChatSheetsProvider';

/** Mecky Chat routes (index, [threadId], computer/[threadId], ultra). Screens are auto-discovered. */
export default function ChatLayout() {
  return (
    <ChatProvider>
      {/* Designed menus + confirm sheets for every chat route (no system dialogs). */}
      <ChatSheetsProvider>
        <Stack screenOptions={{ headerShown: false, animation: 'default' }}>
          <Stack.Screen name="ultra" options={{ presentation: 'modal' }} />
        </Stack>
      </ChatSheetsProvider>
    </ChatProvider>
  );
}
