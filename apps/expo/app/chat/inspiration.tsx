import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSnackbar } from '@/context/SnackbarContext';
import { useChatActions, useChatBootstrap, useInspiration } from '@/context/ChatContext';
import { ChatApiError } from '@/lib/chat/api';
import { showChatMenu } from '@/lib/chat/menu';
import {
  ME_AUDIENCE,
  findDirectThread,
  starterText,
  type InspirationAudience,
  type InspirationTask,
} from '@/lib/chat/inspiration';
import {
  BlackPillButton,
  GlassCircleButton,
  InspirationCard,
  chatFont,
  chatSize,
  useChatTokens,
  InspirationSkeleton,
} from '@/components/chat';

/** "Für dich": ranked ideas what the bots can do for the viewer or one of their organisations. */
export default function ChatInspirationScreen() {
  const t = useChatTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showSnackbar } = useSnackbar();
  const params = useLocalSearchParams<{ audience?: string }>();
  const [audienceKey, setAudienceKey] = useState(
    typeof params.audience === 'string' && params.audience ? params.audience : ME_AUDIENCE,
  );
  const boot = useChatBootstrap();
  const actions = useChatActions();
  const insp = useInspiration(audienceKey);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Keep the chip row while another chip's feed loads.
  const [chips, setChips] = useState<InspirationAudience[]>([]);
  if (insp.audiences.length && insp.audiences !== chips && JSON.stringify(insp.audiences) !== JSON.stringify(chips)) {
    setChips(insp.audiences);
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/chat' as Href));

  const launch = useCallback(
    async (task: InspirationTask, asRoutine: boolean) => {
      if (busyId) return;
      if (task.locked) {
        router.push('/chat/ultra' as Href);
        return;
      }
      const botId = task.bot?.id ?? boot.presets[0]?.id;
      if (!botId) {
        showSnackbar({ message: 'Dieser Bot ist gerade nicht verfügbar.' });
        return;
      }
      setBusyId(task.id);
      try {
        const existing = findDirectThread(boot.threads, botId);
        const threadId = existing ? existing.id : (await actions.createThread([botId])).thread.id;
        router.push({
          pathname: '/chat/[threadId]',
          params: { threadId, prefill: starterText(task, asRoutine), autoSend: '1' },
        } as unknown as Href);
      } catch (err) {
        showSnackbar({ message: err instanceof ChatApiError ? err.message : 'Der Chat konnte nicht geöffnet werden.' });
      } finally {
        setBusyId(null);
      }
    },
    [busyId, boot.presets, boot.threads, actions, router, showSnackbar],
  );

  const askDismiss = (task: InspirationTask) => {
    showChatMenu(
      [
        {
          label: 'Nicht relevant',
          destructive: true,
          run: () => {
            insp
              .dismiss(task.id)
              .then(() => showSnackbar({ message: 'Idee ausgeblendet' }))
              .catch((err: unknown) =>
                showSnackbar({ message: err instanceof ChatApiError ? err.message : 'Ausblenden fehlgeschlagen.' }),
              );
          },
        },
      ],
      task.title,
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await insp.refresh();
    setRefreshing(false);
  };

  const selectChip = (key: string) => {
    if (key === audienceKey) return;
    Haptics.selectionAsync().catch(() => {});
    setAudienceKey(key);
  };

  const header = (
    <View>
      <Text style={[styles.title, { color: t.textPrimary }]}>Für dich</Text>
      <Text style={[styles.subtitle, { color: t.textSecondary }]}>
        Aufgaben, die deine Bots jetzt für dich übernehmen können.
      </Text>
      {chips.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipScroller}
        >
          {chips.map((a) => {
            const active = a.key === audienceKey;
            return (
              <Pressable
                key={a.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => selectChip(a.key)}
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: active ? t.primaryButton : t.chipBackground, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.chipText, { color: active ? t.primaryButtonText : t.textSecondary }]}
                >
                  {a.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.chipSpacer} />
      )}
    </View>
  );

  let emptyState: React.ReactNode = null;
  if (boot.hasSession === false) {
    emptyState = <Message text="Melde dich im Chat an, um Ideen zu sehen." />;
  } else if (insp.status === 'error') {
    emptyState = (
      <View style={styles.center}>
        <Text style={[styles.emptyText, { color: t.textSecondary }]}>
          {insp.error ?? 'Die Ideen konnten nicht geladen werden.'}
        </Text>
        <BlackPillButton label="Erneut versuchen" onPress={() => insp.refresh()} style={styles.retry} />
      </View>
    );
  } else if (insp.status !== 'ready') {
    emptyState = (
      <InspirationSkeleton />
    );
  } else {
    emptyState = <Message text="Gerade keine neuen Ideen. Schau bald wieder vorbei." />;
  }

  return (
    <View style={[styles.flex, { backgroundColor: t.background }]}>
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <GlassCircleButton accessibilityLabel="Zurück" onPress={back}>
          <Feather name="chevron-left" size={26} color={t.icon} />
        </GlassCircleButton>
      </View>
      <FlatList
        data={insp.status === 'ready' ? insp.tasks : []}
        keyExtractor={(task) => task.id}
        ListHeaderComponent={header}
        ListEmptyComponent={emptyState}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
        ItemSeparatorComponent={Separator}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textSecondary} />}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeIn.duration(220).delay(Math.min(index, 6) * 40)}>
            <InspirationCard
              task={item}
              busy={busyId === item.id}
              onPress={() => launch(item, false)}
              onRoutinePress={item.recurring ? () => launch(item, true) : undefined}
              onLongPress={() => askDismiss(item)}
            />
          </Animated.View>
        )}
      />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

function Message({ text }: { text: string }) {
  const t = useChatTokens();
  return (
    <View style={styles.center}>
      <Text style={[styles.emptyText, { color: t.textSecondary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 4 },
  list: { paddingHorizontal: chatSize.screenPadH, paddingTop: 8 },
  title: { fontFamily: chatFont.bold, fontSize: 32, letterSpacing: -0.6, marginTop: 4 },
  subtitle: { fontFamily: chatFont.regular, fontSize: 16, lineHeight: 21, marginTop: 4, letterSpacing: -0.1 },
  chipScroller: { marginHorizontal: -chatSize.screenPadH, marginTop: 16, marginBottom: 18 },
  chips: { paddingHorizontal: chatSize.screenPadH, gap: 8 },
  chip: { height: 36, borderRadius: 18, paddingHorizontal: 16, justifyContent: 'center', maxWidth: 220 },
  chipText: { fontFamily: chatFont.medium, fontSize: 15, letterSpacing: -0.1 },
  chipSpacer: { height: 20 },
  separator: { height: 14 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 24, gap: 16 },
  emptyText: { fontFamily: chatFont.regular, fontSize: 16, lineHeight: 21, textAlign: 'center' },
  retry: { alignSelf: 'center', minWidth: 200 },
});
