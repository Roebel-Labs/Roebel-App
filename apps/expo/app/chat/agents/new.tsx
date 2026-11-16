import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSnackbar } from '@/context/SnackbarContext';
import { useChatAccount, useChatBootstrap } from '@/context/ChatContext';
import { ChatApiError, createCharacterAgent, patchCharacterAgent } from '@/lib/chat/api';
import { setAgentView, useAgentView } from '@/lib/chat/agent-store';
import { MAX_AGENT_NAME, cleanAgentName, type AgentPersonality, type AgentSummary } from '@/lib/chat/agents';
import {
  AGENT_CHARACTERS,
  characterArt,
  characterById,
  characterRoleLine,
  shuffleCharacter,
  type AgentCharacter,
} from '@/lib/chat/characters';
import {
  BlackPillButton,
  CharacterFigure,
  GlassCircleButton,
  ScreenMessage,
  SettingsListSkeleton,
  chatFont,
  chatSize,
  useChatTokens,
} from '@/components/chat';
import { SettingsHeader } from '@/components/chat/SettingsHeader';

const COLUMNS = 4;
const TILE_GAP = 10;

/**
 * Character picker. Without `botId` it adds a new agent; with `botId` it changes the character of an
 * existing own agent (its chats stay).
 */
export default function ChatAgentPickerScreen() {
  const t = useChatTokens();
  const params = useLocalSearchParams<{ botId?: string }>();
  const botId = typeof params.botId === 'string' && params.botId ? params.botId : null;
  const account = useChatAccount();
  const boot = useChatBootstrap();
  const agents = useAgentView(account);

  const { reload } = agents;
  useFocusEffect(
    useCallback(() => {
      void reload(true);
    }, [reload]),
  );

  const view = agents.view;
  const editing = botId ? view?.agents.find((a) => a.botId === botId && !a.isPreset) ?? null : null;

  // The picker brings its own header (with the shuffle button); every other state gets the plain one.
  let state: React.ReactNode = null;
  if (!account || boot.hasSession === false) {
    state = <ScreenMessage text="Melde dich im Chat an, um einen Agenten hinzuzufügen." />;
  } else if (agents.status === 'error') {
    state = <ScreenMessage text={agents.error} actionLabel="Erneut versuchen" onAction={() => void reload()} />;
  } else if (!view) {
    state = <SettingsListSkeleton rows={5} style={styles.skeleton} />;
  } else if (botId && !editing) {
    state = <ScreenMessage title="Agent nicht gefunden" text="Diesen Agenten gibt es nicht mehr." />;
  }

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      {state || !view ? (
        <>
          <SettingsHeader title={botId ? 'Figur ändern' : 'Agent hinzufügen'} />
          {state}
        </>
      ) : (
        <Picker key={botId ?? 'new'} editing={editing} personalities={view.personalities} />
      )}
    </View>
  );
}

function Picker({ editing, personalities }: { editing: AgentSummary | null; personalities: AgentPersonality[] }) {
  const t = useChatTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const { showSnackbar } = useSnackbar();
  const account = useChatAccount();
  const boot = useChatBootstrap();

  const first = characterById(editing?.characterId) ?? AGENT_CHARACTERS[0];
  const [character, setCharacter] = useState<AgentCharacter>(first);
  // The name and the personality follow the character until the person chooses their own.
  const ownName = Boolean(editing && editing.name !== first.name);
  const [name, setName] = useState(editing?.name ?? first.name);
  const [nameTouched, setNameTouched] = useState(ownName);
  const [personality, setPersonality] = useState(editing?.personality ?? first.personality);
  const [personalityTouched, setPersonalityTouched] = useState(Boolean(editing));
  // The main assistant's personality lives on the profile (agent detail screen), not on the bot.
  const withPersonality = !editing?.isMain;
  const [busy, setBusy] = useState(false);

  const choose = (c: AgentCharacter) => {
    Haptics.selectionAsync().catch(() => {});
    setCharacter(c);
    if (!nameTouched) setName(c.name);
    if (!personalityTouched) setPersonality(c.personality);
  };

  const shownName = cleanAgentName(name) || character.name;
  const chosen = personalities.find((p) => p.key === personality) ?? null;
  const tile = Math.floor((win.width - chatSize.screenPadH * 2 - TILE_GAP * (COLUMNS - 1)) / COLUMNS);

  const submit = async () => {
    if (!account || busy) return;
    setBusy(true);
    try {
      if (editing) {
        const next = await patchCharacterAgent(account, editing.botId, {
          character: character.id,
          name: shownName,
          ...(withPersonality ? { personality } : {}),
        });
        setAgentView(account, next);
        void boot.refresh();
        if (router.canGoBack()) router.back();
        else router.replace(`/chat/agents/${editing.botId}` as Href);
      } else {
        const res = await createCharacterAgent(account, { character: character.id, name: shownName, personality });
        setAgentView(account, res.view);
        void boot.refresh();
        // Replace the picker so "back" from the new agent leads to the roster.
        if (res.createdId) router.replace(`/chat/agents/${res.createdId}` as Href);
        else if (router.canGoBack()) router.back();
        else router.replace('/chat/agents' as Href);
      }
    } catch (err) {
      showSnackbar({ message: err instanceof ChatApiError && err.message ? err.message : 'Das hat nicht geklappt.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SettingsHeader
        title={editing ? 'Figur ändern' : 'Agent hinzufügen'}
        right={
          <GlassCircleButton accessibilityLabel="Zufällige Figur" onPress={() => choose(shuffleCharacter(character.id))}>
            <Feather name="shuffle" size={20} color={t.icon} />
          </GlassCircleButton>
        }
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <CharacterFigure characterId={character.id} height={220} />

        <TextInput
          value={name}
          onChangeText={(v) => {
            setName(v);
            setNameTouched(true);
          }}
          onBlur={() => {
            if (!name.trim()) {
              setName(character.name);
              setNameTouched(false);
            }
          }}
          placeholder={character.name}
          placeholderTextColor={t.placeholder}
          maxLength={MAX_AGENT_NAME}
          returnKeyType="done"
          selectionColor={t.link}
          style={[styles.nameInput, { color: t.textPrimary }]}
          accessibilityLabel="Name des Agenten"
        />
        <Text style={[styles.role, { color: t.textSecondary }]}>
          {characterRoleLine(character)}. {character.tagline}
        </Text>
        <Text style={[styles.note, { color: t.textTertiary }]}>Bei allem anderen hilft {shownName} trotzdem.</Text>

        <Text style={[styles.label, { color: t.textSecondary }]}>Figur</Text>
        <View style={styles.grid} accessibilityRole="radiogroup">
          {AGENT_CHARACTERS.map((c) => {
            const on = c.id === character.id;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${c.name}, ${characterRoleLine(c)}`}
                onPress={() => choose(c)}
                style={({ pressed }) => [{ width: tile, opacity: pressed ? 0.75 : 1 }]}
              >
                <View
                  style={[
                    styles.tile,
                    { width: tile, height: tile, backgroundColor: c.color, borderColor: on ? t.textPrimary : 'transparent' },
                  ]}
                >
                  <Image
                    source={{ uri: characterArt(c.id).tile }}
                    style={styles.tileImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    accessible={false}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.tileName, { color: on ? t.textPrimary : t.textSecondary }, on ? styles.tileNameOn : null]}
                >
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {withPersonality && personalities.length ? (
          <>
            <Text style={[styles.label, { color: t.textSecondary }]}>Persönlichkeit</Text>
            <View style={styles.chips}>
              {personalities.map((p) => {
                const on = p.key === personality;
                return (
                  <Pressable
                    key={p.key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setPersonality(p.key);
                      setPersonalityTouched(true);
                    }}
                    style={({ pressed }) => [
                      styles.chip,
                      { backgroundColor: on ? t.primaryButton : t.chipBackground, opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    {on ? <Ionicons name="checkmark" size={15} color={t.primaryButtonText} /> : null}
                    <Text style={[styles.chipText, { color: on ? t.primaryButtonText : t.textSecondary }]}>{p.title}</Text>
                  </Pressable>
                );
              })}
            </View>
            {chosen ? <Text style={[styles.note, styles.noteLeft, { color: t.textTertiary }]}>{chosen.description}</Text> : null}
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: t.background }]}>
        <BlackPillButton
          label={editing ? 'Übernehmen' : `${shownName} hinzufügen`}
          onPress={submit}
          loading={busy}
        />
        <Text style={[styles.footNote, { color: t.textTertiary }]}>Du kannst die Figur oder den Namen jederzeit ändern.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  skeleton: { marginHorizontal: chatSize.screenPadH, marginTop: 8 },
  content: { paddingHorizontal: chatSize.screenPadH, paddingTop: 4, paddingBottom: 24 },
  nameInput: {
    fontFamily: chatFont.bold,
    fontSize: 30,
    letterSpacing: -0.6,
    textAlign: 'center',
    marginTop: 14,
    paddingVertical: 4,
  },
  role: { fontFamily: chatFont.regular, fontSize: 16, lineHeight: 22, textAlign: 'center', marginTop: 2, paddingHorizontal: 8 },
  note: { fontFamily: chatFont.regular, fontSize: 14, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  noteLeft: { textAlign: 'left', marginLeft: 4, marginTop: 10 },
  label: { fontFamily: chatFont.medium, fontSize: 14, marginTop: 26, marginBottom: 10, marginLeft: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: TILE_GAP, rowGap: 12 },
  tile: { borderRadius: 20, borderWidth: 2.5, overflow: 'hidden' },
  tileImage: { flex: 1 },
  tileName: { fontFamily: chatFont.regular, fontSize: 13, textAlign: 'center', marginTop: 5 },
  tileNameOn: { fontFamily: chatFont.semiBold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, borderRadius: 18, paddingHorizontal: 14 },
  chipText: { fontFamily: chatFont.medium, fontSize: 15 },
  footer: { paddingHorizontal: 22, paddingTop: 10 },
  footNote: { fontFamily: chatFont.regular, fontSize: 13, textAlign: 'center', marginTop: 8 },
});
