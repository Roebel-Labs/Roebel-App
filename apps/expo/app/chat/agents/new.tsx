import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  ChatApiError,
  createCharacterAgent,
  createOwnAgent,
  patchCharacterAgent,
  uploadAgentPicture,
} from '@/lib/chat/api';
import { setAgentView, useAgentView } from '@/lib/chat/agent-store';
import {
  MAX_AGENT_INSTRUCTIONS,
  MAX_AGENT_NAME,
  MAX_AGENT_ROLE,
  cleanAgentName,
  type AgentPersonality,
  type AgentSummary,
} from '@/lib/chat/agents';
import {
  AGENT_CHARACTERS,
  characterArt,
  characterById,
  characterRoleLine,
  shuffleCharacter,
  type AgentCharacter,
} from '@/lib/chat/characters';
import {
  AgentPictureError,
  BlackPillButton,
  CharacterFigure,
  GlassCircleButton,
  ScreenMessage,
  SettingsListSkeleton,
  chatFont,
  chatSize,
  useAgentPicturePicker,
  useChatTokens,
} from '@/components/chat';
import { SettingsHeader } from '@/components/chat/SettingsHeader';

const COLUMNS = 4;
const TILE_GAP = 10;
const PREVIEW_SIZE = 168;

const OWN_INSTRUCTIONS_PLACEHOLDER =
  'z. B. Antworte kurz und freundlich. Frag nach, wenn etwas unklar ist. Schreib Einkaufslisten als Aufzählung.';

function errorText(err: unknown, fallback: string): string {
  if (err instanceof AgentPictureError && err.message) return err.message;
  return err instanceof ChatApiError && err.message ? err.message : fallback;
}

/**
 * Agent builder. Without `botId` it adds a new agent: an own picture (name, what it is for, how it should
 * work) or one of the illustrated characters. With `botId` it changes the character of an existing own
 * agent (its chats stay).
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

  // Own picture (new agents only): the local, prepared 512 px JPEG, uploaded on "Agent erstellen".
  const pickPicture = useAgentPicturePicker();
  const [mode, setMode] = useState<'character' | 'picture'>('character');
  const [pictureUri, setPictureUri] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [customName, setCustomName] = useState('');
  const [role, setRole] = useState('');
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pictureMode = mode === 'picture' && !editing;

  const choosePicture = async () => {
    if (picking || busy) return;
    Haptics.selectionAsync().catch(() => {});
    setError(null);
    setPicking(true);
    try {
      const uri = await pickPicture();
      if (uri) {
        setPictureUri(uri);
        setMode('picture');
        if (!personalityTouched) setPersonality('standard');
      } else if (pictureUri) {
        // Cancelled, but a picture is already there: show it again.
        setMode('picture');
      }
    } catch (err) {
      setError(errorText(err, 'Die Fotoauswahl konnte nicht geöffnet werden.'));
    } finally {
      setPicking(false);
    }
  };

  const choose = (c: AgentCharacter) => {
    Haptics.selectionAsync().catch(() => {});
    setMode('character');
    setError(null);
    setCharacter(c);
    if (!nameTouched) setName(c.name);
    if (!personalityTouched) setPersonality(c.personality);
  };

  const shownName = cleanAgentName(name) || character.name;
  const chosen = personalities.find((p) => p.key === personality) ?? null;
  const tile = Math.floor((win.width - chatSize.screenPadH * 2 - TILE_GAP * (COLUMNS - 1)) / COLUMNS);

  const customNameClean = cleanAgentName(customName);
  const canCreateOwn = Boolean(pictureUri && customNameClean);

  const submitOwn = async () => {
    if (!account || busy) return;
    if (!pictureUri) {
      setError('Wähle zuerst ein Bild aus.');
      return;
    }
    if (!customNameClean) {
      setError('Gib deinem Agenten einen Namen.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadAgentPicture(account, pictureUri);
      const res = await createOwnAgent(account, {
        imageUrl: uploaded.url,
        name: customNameClean,
        role: role.trim(),
        instructions: instructions.trim(),
        personality,
      });
      setAgentView(account, res.view);
      void boot.refresh();
      if (res.createdId) router.replace(`/chat/agents/${res.createdId}` as Href);
      else if (router.canGoBack()) router.back();
      else router.replace('/chat/agents' as Href);
    } catch (err) {
      setError(errorText(err, 'Der Agent konnte nicht erstellt werden.'));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (pictureMode) {
      await submitOwn();
      return;
    }
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
        title={editing ? (editing.characterId ? 'Figur ändern' : 'Figur wählen') : 'Agent hinzufügen'}
        right={
          <GlassCircleButton accessibilityLabel="Zufällige Figur" onPress={() => choose(shuffleCharacter(character.id))}>
            <Feather name="shuffle" size={20} color={t.icon} />
          </GlassCircleButton>
        }
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {pictureMode ? (
          <>
            <View style={styles.previewWrap}>
              {pictureUri ? (
                <View style={[styles.preview, { backgroundColor: t.chipBackground }]}>
                  <Image source={{ uri: pictureUri }} style={styles.previewImage} contentFit="cover" accessible={false} />
                </View>
              ) : (
                <View style={[styles.preview, styles.previewEmpty, { borderColor: t.separator, backgroundColor: t.groupedBackground }]}>
                  <Feather name="image" size={36} color={t.textTertiary} />
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                disabled={picking || busy}
                onPress={() => void choosePicture()}
                style={({ pressed }) => [styles.pictureBtn, { backgroundColor: t.chipBackground, opacity: pressed ? 0.7 : 1 }]}
              >
                {picking ? <ActivityIndicator size="small" color={t.textSecondary} /> : <Feather name="image" size={16} color={t.textPrimary} />}
                <Text style={[styles.pictureBtnText, { color: t.textPrimary }]}>{pictureUri ? 'Anderes Bild' : 'Bild wählen'}</Text>
              </Pressable>
            </View>

            <TextInput
              value={customName}
              onChangeText={setCustomName}
              placeholder="Name deines Agenten"
              placeholderTextColor={t.placeholder}
              maxLength={MAX_AGENT_NAME}
              returnKeyType="done"
              selectionColor={t.link}
              style={[styles.nameInput, { color: t.textPrimary }]}
              accessibilityLabel="Name des Agenten"
            />

            <Text style={[styles.label, { color: t.textSecondary }]}>Wofür ist dein Agent da?</Text>
            <View style={[styles.field, { backgroundColor: t.groupedBackground }]}>
              <TextInput
                value={role}
                onChangeText={setRole}
                placeholder="z. B. Hilft mir beim Kochen und plant die Woche"
                placeholderTextColor={t.placeholder}
                maxLength={MAX_AGENT_ROLE}
                returnKeyType="done"
                selectionColor={t.link}
                style={[styles.input, { color: t.textPrimary }]}
                accessibilityLabel="Wofür dein Agent da ist"
              />
            </View>

            <Text style={[styles.label, { color: t.textSecondary }]}>Wie soll er arbeiten?</Text>
            <View style={[styles.field, styles.fieldTall, { backgroundColor: t.groupedBackground }]}>
              <TextInput
                value={instructions}
                onChangeText={setInstructions}
                placeholder={OWN_INSTRUCTIONS_PLACEHOLDER}
                placeholderTextColor={t.placeholder}
                multiline
                maxLength={MAX_AGENT_INSTRUCTIONS}
                selectionColor={t.link}
                style={[styles.input, styles.inputTall, { color: t.textPrimary }]}
                accessibilityLabel="Wie dein Agent arbeiten soll"
              />
            </View>
            <Text style={[styles.note, styles.noteLeft, { color: t.textTertiary }]}>
              Optional. Bei allem anderen hilft dein Agent trotzdem.
            </Text>
          </>
        ) : (
          <>
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
          </>
        )}

        <Text style={[styles.label, { color: t.textSecondary }]}>{editing ? 'Figur' : 'Bild oder Figur'}</Text>
        <View style={styles.grid} accessibilityRole="radiogroup">
          {editing ? null : (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: pictureMode }}
              accessibilityLabel="Eigenes Bild"
              disabled={picking || busy}
              onPress={() => void choosePicture()}
              style={({ pressed }) => [{ width: tile, opacity: pressed ? 0.75 : 1 }]}
            >
              <View
                style={[
                  styles.tile,
                  styles.ownTile,
                  {
                    width: tile,
                    height: tile,
                    backgroundColor: t.chipBackground,
                    borderColor: pictureMode ? t.textPrimary : 'transparent',
                  },
                ]}
              >
                {pictureUri ? (
                  <Image source={{ uri: pictureUri }} style={styles.tileImage} contentFit="cover" accessible={false} />
                ) : picking ? (
                  <ActivityIndicator size="small" color={t.textSecondary} />
                ) : (
                  <Feather name="image" size={24} color={t.textSecondary} />
                )}
              </View>
              <Text
                numberOfLines={1}
                style={[styles.tileName, { color: pictureMode ? t.textPrimary : t.textSecondary }, pictureMode ? styles.tileNameOn : null]}
              >
                Eigenes Bild
              </Text>
            </Pressable>
          )}
          {AGENT_CHARACTERS.map((c) => {
            const on = !pictureMode && c.id === character.id;
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
        {error ? <Text style={[styles.error, { color: t.recordingRed }]}>{error}</Text> : null}
        <BlackPillButton
          label={editing ? 'Übernehmen' : pictureMode ? 'Agent erstellen' : `${shownName} hinzufügen`}
          onPress={submit}
          loading={busy}
          variant={pictureMode && !canCreateOwn ? 'disabled' : 'primary'}
        />
        <Text style={[styles.footNote, { color: t.textTertiary }]}>
          {pictureMode
            ? busy
              ? 'Bild wird hochgeladen …'
              : 'Du kannst Bild, Name und Aufgabe jederzeit ändern.'
            : 'Du kannst die Figur oder den Namen jederzeit ändern.'}
        </Text>
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
  error: { fontFamily: chatFont.regular, fontSize: 14, lineHeight: 19, textAlign: 'center', marginBottom: 10 },
  ownTile: { alignItems: 'center', justifyContent: 'center' },
  previewWrap: { alignItems: 'center', paddingTop: 8 },
  preview: { width: PREVIEW_SIZE, height: PREVIEW_SIZE, borderRadius: PREVIEW_SIZE / 2, overflow: 'hidden' },
  previewEmpty: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  previewImage: { width: PREVIEW_SIZE, height: PREVIEW_SIZE },
  pictureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  pictureBtnText: { fontFamily: chatFont.medium, fontSize: 15 },
  field: { borderRadius: 18, paddingHorizontal: 14, minHeight: 48, justifyContent: 'center' },
  fieldTall: { paddingVertical: 10, justifyContent: 'flex-start' },
  input: { fontFamily: chatFont.regular, fontSize: 17, paddingVertical: 0 },
  inputTall: { minHeight: 110, lineHeight: 22, textAlignVertical: 'top' },
  footNote: { fontFamily: chatFont.regular, fontSize: 13, textAlign: 'center', marginTop: 8 },
});
