import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNavigation from '@/components/BottomNavigation';
import { ChatProvider } from '@/context/ChatContext';
import { ChatSheetsProvider } from '@/components/chat/ChatSheetsProvider';
import { ChatHomeChromeContext } from '@/components/chat/ChatHomeChrome';
import ChatIndexScreen from '@/app/chat/index';
import { glassBarFootprint } from '@/lib/glass-tab-geometry';
import { useShellGuard } from '@/lib/navigation/useShellGuard';
import { useTheme } from '@/context/ThemeContext';

/** Org shell "Chat" section: the person's own agent chat (same screen as /chat), no back button. */
export default function ChatTab() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const allowed = useShellGuard('chat');
  const chrome = useMemo(
    () => ({ showBack: false, bottomExtra: glassBarFootprint(insets.bottom) - insets.bottom }),
    [insets.bottom]
  );
  if (!allowed) return <View style={[styles.flex, { backgroundColor: colors.background }]} />;
  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ChatProvider>
        <ChatSheetsProvider>
          <ChatHomeChromeContext.Provider value={chrome}>
            <ChatIndexScreen />
          </ChatHomeChromeContext.Provider>
        </ChatSheetsProvider>
      </ChatProvider>
      <View style={styles.nav} pointerEvents="box-none">
        <BottomNavigation activeTab="chat" glass />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  nav: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
