import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSnackbar } from '@/context/SnackbarContext';
import { useChatBootstrap } from '@/context/ChatContext';
import { threadTitle } from '@/lib/chat/format';
import {
  BOT_COLORS,
  BotAvatar,
  GlassCircleButton,
  GlassPillHeader,
  ShimmerBlock,
  chatFont,
  chatSize,
  useChatSheets,
} from '@/components/chat';

/** The bot's computer (ref 18). Until phase 5 there is no VM → empty state; with `vmUrl` a noVNC WebView. */
export default function ChatComputerScreen() {
  const params = useLocalSearchParams<{ threadId: string; vmUrl?: string }>();
  const threadId = typeof params.threadId === 'string' ? params.threadId : '';
  const vmUrl = typeof params.vmUrl === 'string' && /^https:\/\//i.test(params.vmUrl) ? params.vmUrl : null;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const { showSnackbar } = useSnackbar();
  const { openMenu } = useChatSheets();
  const { threads } = useChatBootstrap();
  const thread = threads.find((th) => th.id === threadId) ?? null;
  const bots = thread?.bots ?? [];
  const screenHeight = win.width / 1.6;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <GlassCircleButton accessibilityLabel="Zurück" tone="dark" onPress={() => router.back()}>
          <Feather name="chevron-left" size={26} color="#FFFFFF" />
        </GlassCircleButton>
        {thread ? (
          <GlassPillHeader avatars={bots.map((b) => b.avatar)} title={threadTitle(thread)} tone="dark" style={styles.pill} />
        ) : null}
        <View style={styles.flex} />
        <GlassCircleButton accessibilityLabel="Tastatur" tone="dark" onPress={() => showSnackbar({ message: 'Bald verfügbar' })}>
          <MaterialCommunityIcons name="keyboard-outline" size={23} color="#FFFFFF" />
        </GlassCircleButton>
        <GlassCircleButton
          accessibilityLabel="Mehr"
          tone="dark"
          style={styles.gap}
          onPress={(e) =>
            openMenu({
              anchor: e,
              items: [{ label: 'Mecky Ultra', icon: 'diamond-outline', onPress: () => router.push('/chat/ultra' as Href) }],
            })
          }
        >
          <Feather name="more-horizontal" size={24} color="#FFFFFF" />
        </GlassCircleButton>
      </View>

      <View style={styles.stage}>
        <View style={[styles.screen, { height: screenHeight }]}>
          {vmUrl ? (
            <WebView
              source={{ uri: vmUrl }}
              style={styles.webview}
              originWhitelist={['https://*']}
              allowsInlineMediaPlayback
              startInLoadingState
              renderLoading={() => (
                <View style={styles.loading} accessible accessibilityRole="progressbar" accessibilityLabel="Lädt">
                  <ShimmerBlock tone="dark" width="100%" height={screenHeight} radius={0} />
                </View>
              )}
            />
          ) : (
            <View style={styles.empty}>
              <BotAvatar
                spec={bots[0]?.avatar ?? { shape: 'circle', color: BOT_COLORS.grey, eyes: 'dots' }}
                size={44}
                style={styles.mascot}
              />
              <Text style={styles.emptyTitle}>Der Computer startet bald</Text>
              <Text style={styles.emptyText}>
                Hier siehst du bald live, wie dein Bot im Browser recherchiert und Dinge für dich erledigt.
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: chatSize.controlInset },
  pill: { marginLeft: 4, flexShrink: 1 },
  gap: { marginLeft: 10 },
  stage: { flex: 1, justifyContent: 'center' },
  screen: { width: '100%', backgroundColor: '#0E0E10', overflow: 'hidden' },
  loading: { ...StyleSheet.absoluteFillObject },
  webview: { flex: 1, backgroundColor: '#000000' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  mascot: { opacity: 0.55, marginBottom: 14 },
  emptyTitle: { fontFamily: chatFont.semiBold, fontSize: 18, color: '#F5F5F7', textAlign: 'center' },
  emptyText: { fontFamily: chatFont.regular, fontSize: 14, lineHeight: 19, color: '#8A8A8E', textAlign: 'center', marginTop: 6 },
});
