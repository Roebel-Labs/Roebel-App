import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useChatAccount, useChatBootstrap } from '@/context/ChatContext';
import { useAgentView } from '@/lib/chat/agent-store';
import { agentAvatarSpec, agentRoleLine, agentSubtitle, sortRoster, type AgentSummary } from '@/lib/chat/agents';
import { AGENT_CHARACTERS } from '@/lib/chat/characters';
import { CharacterFigure, ScreenMessage, SettingsListSkeleton, chatFont, chatSize, useChatTokens } from '@/components/chat';
import { SettingsHeader } from '@/components/chat/SettingsHeader';

type Cell = { type: 'agent'; agent: AgentSummary } | { type: 'add' } | { type: 'filler' };

const FIGURE_HEIGHT = 148;

/** "Meine Agenten": the main assistant and every own agent (character, own picture, or an older bot). */
export default function ChatAgentsScreen() {
  const t = useChatTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const account = useChatAccount();
  const boot = useChatBootstrap();
  const agents = useAgentView(account);
  const [refreshing, setRefreshing] = useState(false);

  const { reload } = agents;
  useFocusEffect(
    useCallback(() => {
      void reload(true);
    }, [reload]),
  );

  const bots = useMemo(() => [...boot.presets, ...boot.bots], [boot.presets, boot.bots]);
  const cells = useMemo<Cell[]>(() => {
    if (!agents.view) return [];
    const list: Cell[] = sortRoster(agents.view.agents).map((agent) => ({ type: 'agent', agent }));
    list.push({ type: 'add' });
    // Two columns: an odd count gets an invisible cell so the last card keeps its width.
    if (list.length % 2 === 1) list.push({ type: 'filler' });
    return list;
  }, [agents.view]);

  const onRefresh = async () => {
    setRefreshing(true);
    await reload(true);
    setRefreshing(false);
  };

  const open = (href: string) => {
    Haptics.selectionAsync().catch(() => {});
    router.push(href as Href);
  };

  let body: React.ReactNode;
  if (!account || boot.hasSession === false) {
    body = <ScreenMessage text="Melde dich im Chat an, um deine Agenten zu sehen." />;
  } else if (agents.status === 'error') {
    body = <ScreenMessage text={agents.error} actionLabel="Erneut versuchen" onAction={() => void reload()} />;
  } else if (!agents.view) {
    body = <SettingsListSkeleton rows={5} withIcon style={styles.skeleton} />;
  } else {
    body = (
      <FlatList
        data={cells}
        numColumns={2}
        keyExtractor={(cell, i) => (cell.type === 'agent' ? cell.agent.botId : `${cell.type}-${i}`)}
        columnWrapperStyle={styles.columns}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textTertiary} />}
        ListHeaderComponent={
          <Text style={[styles.intro, { color: t.textSecondary }]}>
            Jeder Agent hat ein eigenes Thema und hilft dir trotzdem bei allem. Dein Hauptassistent kümmert sich um
            Briefings und Routinen.
          </Text>
        }
        renderItem={({ item }) => {
          if (item.type === 'filler') return <View style={styles.cell} />;
          if (item.type === 'add') {
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Agent hinzufügen"
                onPress={() => open('/chat/agents/new')}
                style={({ pressed }) => [styles.cell, { opacity: pressed ? 0.75 : 1 }]}
              >
                <View style={[styles.addStage, { borderColor: t.separator, backgroundColor: t.groupedBackground }]}>
                  <Feather name="plus" size={30} color={t.textSecondary} />
                </View>
                <Text numberOfLines={1} style={[styles.name, { color: t.textPrimary }]}>
                  Agent hinzufügen
                </Text>
                <Text numberOfLines={1} style={[styles.role, { color: t.textSecondary }]}>
                  Eigenes Bild oder {AGENT_CHARACTERS.length} Figuren
                </Text>
              </Pressable>
            );
          }
          const agent = item.agent;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${agent.name}, ${agentSubtitle(agent)}`}
              onPress={() => open(`/chat/agents/${agent.botId}`)}
              style={({ pressed }) => [styles.cell, { opacity: pressed ? 0.75 : 1 }]}
            >
              <View>
                <CharacterFigure
                  characterId={agent.characterId}
                  height={FIGURE_HEIGHT}
                  fallback={agentAvatarSpec(agent, bots)}
                  name={agent.name}
                />
                {agent.isMain ? (
                  <View style={[styles.badge, { backgroundColor: t.primaryButton }]}>
                    <Feather name="star" size={11} color={t.primaryButtonText} />
                    <Text style={[styles.badgeText, { color: t.primaryButtonText }]}>Hauptassistent</Text>
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={1} style={[styles.name, { color: t.textPrimary }]}>
                {agent.name}
              </Text>
              <Text numberOfLines={2} style={[styles.role, { color: t.textSecondary }]}>
                {agentRoleLine(agent)}
              </Text>
            </Pressable>
          );
        }}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <SettingsHeader title="Meine Agenten" />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  skeleton: { marginHorizontal: chatSize.screenPadH, marginTop: 8 },
  list: { paddingHorizontal: chatSize.screenPadH, rowGap: 20 },
  columns: { gap: 12 },
  intro: { fontFamily: chatFont.regular, fontSize: 15, lineHeight: 21, marginTop: 4 },
  cell: { flex: 1, minWidth: 0 },
  addStage: {
    height: FIGURE_HEIGHT,
    borderRadius: 28,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    left: 10,
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 9,
  },
  badgeText: { fontFamily: chatFont.semiBold, fontSize: 12 },
  name: { fontFamily: chatFont.semiBold, fontSize: 17, letterSpacing: -0.2, marginTop: 10 },
  role: { fontFamily: chatFont.regular, fontSize: 14, lineHeight: 19, marginTop: 2 },
});
