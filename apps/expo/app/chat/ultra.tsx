import React from 'react';
import { Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useSnackbar } from '@/context/SnackbarContext';
import { UltraPaywall, useChatTokens } from '@/components/chat';

const AGB_URL = 'https://www.roebel.app/agb';
const DATENSCHUTZ_URL = 'https://www.roebel.app/datenschutz';

/** Ultra paywall (ref 19). Inert until RevenueCat lands (phase 4). */
export default function ChatUltraScreen() {
  const t = useChatTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showSnackbar } = useSnackbar();
  const soon = () => showSnackbar({ message: 'Bald verfügbar' });
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/chat' as Href);
  };

  return (
    <>
      <Stack.Screen options={{ presentation: 'modal', headerShown: false }} />
      <ScrollView
        style={[styles.root, { backgroundColor: t.sheetBackground }]}
        contentContainerStyle={{ paddingTop: Platform.OS === 'ios' ? 0 : insets.top, paddingBottom: insets.bottom + 16 }}
        showsVerticalScrollIndicator={false}
      >
        <UltraPaywall
          price="29,99 €/Monat"
          onSubscribe={soon}
          onRestore={soon}
          onClose={close}
          onTerms={() => WebBrowser.openBrowserAsync(AGB_URL).catch(() => {})}
          onPrivacy={() => WebBrowser.openBrowserAsync(DATENSCHUTZ_URL).catch(() => {})}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
