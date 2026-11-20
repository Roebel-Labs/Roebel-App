import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSnackbar } from '@/context/SnackbarContext';
import { useChatAccount, useChatActions, useChatBootstrap } from '@/context/ChatContext';
import {
  ChatApiError,
  deleteCharacterAgent,
  patchAgentProfile,
  patchCharacterAgent,
  uploadAgentPicture,
} from '@/lib/chat/api';
import { setAgentView, useAgentView } from '@/lib/chat/agent-store';
import {
  MAX_AGENT_INSTRUCTIONS,
  MAX_AGENT_NAME,
  MAX_AGENT_ROLE,
  agentAvatarSpec,
  agentLook,
  agentRoleLine,
  agentSince,
  cleanAgentName,
  type AgentSummary,
  type AgentView,
} from '@/lib/chat/agents';
import { agentShareUrl, characterById } from '@/lib/chat/characters';
import { findDirectThread } from '@/lib/chat/inspiration';
import {
  AgentPictureError,
  BlackPillButton,
  CharacterFigure,
  ScreenMessage,
  SettingsListSkeleton,
  chatFont,
  chatSize,
  useAgentPicturePicker,
  useChatSheets,
  useChatTokens,
} from '@/components/chat';
import { SettingsHeader } from '@/components/chat/SettingsHeader';

function errorText(err: unknown, fallback: string): string {
  if (err instanceof AgentPictureError && err.message) return err.message;
  return err instanceof ChatApiError && err.message ? err.message : fallback;
}

const OWN_INSTRUCTIONS_PLACEHOLDER =
  'z. B. Antworte kurz und freundlich. Frag nach, wenn etwas unklar ist. Schreib Einkaufslisten als Aufzählung.';

/** One agent: start a chat, rename, personality, picture or character, task, main assistant, share, remove. */
export default function ChatAgentDetailScreen() {
  const t = useChatTokens();
  const params = useLocalSearchParams<{ botId: string }>();
  const botId = typeof params.botId === 'string' ? params.botId : '';
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
  const agent = view?.agents.find((a) => a.botId === botId) ?? null;

  let body: React.ReactNode;
  if (!account || boot.hasSession === false) {
    body = <ScreenMessage text="Melde dich im Chat an, um deine Agenten zu sehen." />;
  } else if (agents.status === 'error') {
    body = <ScreenMessage text={agents.error} actionLabel="Erneut versuchen" onAction={() => void reload()} />;
  } else if (!view) {
    body = <SettingsListSkeleton rows={5} style={styles.skeleton} />;
  } else if (!agent) {
    body = <ScreenMessage title="Agent nicht gefunden" text="Diesen Agenten gibt es nicht mehr." />;
  } else {
    // Keyed by bot so the form state starts fresh for another agent.
    body = <AgentDetail key={agent.botId} agent={agent} view={view} />;
  }

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <SettingsHeader title={agent?.name ?? 'Agent'} />
      {body}
    </View>
  );
}

function AgentDetail({ agent, view }: { agent: AgentSummary; view: AgentView }) {
  const t = useChatTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showSnackbar } = useSnackbar();
  const { confirm } = useChatSheets();
  const account = useChatAccount();
  const boot = useChatBootstrap();
  const actions = useChatActions();
  const pickPicture = useAgentPicturePicker();

  const character = characterById(agent.characterId);
  // 'character' | 'picture' | 'none' (an older bot without either); presets keep their house picture.
  const look = agentLook(agent);
  const ownLook = !agent.isPreset && look !== 'character';
  const bots = useMemo(() => [...boot.presets, ...boot.bots], [boot.presets, boot.bots]);
  // Name, personality and instructions of the default assistant live on the profile, which always
  // belongs to the main assistant. A default assistant that is not the main one cannot be edited.
  const editable = agent.isMain || !agent.isPreset;
  const defaultName = agent.isMain ? view.agent.defaultName : character?.name ?? agent.name;

  const [name, setName] = useState(agent.name);
  const [instructions, setInstructions] = useState(view.agent.customInstructions);
  // Own agents without a character: what it is for and how it should work (saved on the bot).
  const [role, setRole] = useState(agent.role);
  const [botInstructions, setBotInstructions] = useState(agent.instructions ?? '');
  /** Which action is running: one at a time. */
  const [busy, setBusy] = useState<string | null>(null);

  const nameChanged = cleanAgentName(name) !== agent.name && (cleanAgentName(name) !== '' || agent.name !== defaultName);
  const instructionsChanged = agent.isMain && instructions.trim() !== view.agent.customInstructions.trim();
  const roleChanged = ownLook && role.trim() !== agent.role.trim();
  const botInstructionsChanged = ownLook && botInstructions.trim() !== (agent.instructions ?? '').trim();

  /** Runs one mutation; every agent endpoint answers with the full view. */
  const run = async (key: string, work: () => Promise<AgentView>, done?: string): Promise<boolean> => {
    if (!account || busy) return false;
    setBusy(key);
    try {
      const next = await work();
      setAgentView(account, next);
      // Names and avatars in the chat list and open threads come from the bootstrap.
      void boot.refresh();
      if (done) showSnackbar({ message: done, duration: 2500 });
      return true;
    } catch (err) {
      showSnackbar({ message: errorText(err, 'Das hat nicht geklappt.') });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveName = async () => {
    if (!account) return;
    const cleaned = cleanAgentName(name);
    const ok = await run(
      'name',
      () =>
        agent.isMain
          ? patchAgentProfile(account, { name: cleaned || null })
          : patchCharacterAgent(account, agent.botId, { name: cleaned }),
      'Name gespeichert',
    );
    if (ok && !cleaned) setName(defaultName);
    else if (ok) setName(cleaned);
  };

  const savePersonality = (key: string) => {
    if (!account || key === agent.personality) return;
    Haptics.selectionAsync().catch(() => {});
    void run(`personality:${key}`, () =>
      agent.isMain
        ? patchAgentProfile(account, { personality: key })
        : patchCharacterAgent(account, agent.botId, { personality: key }),
    );
  };

  const saveInstructions = () => {
    if (!account) return;
    void run('instructions', () => patchAgentProfile(account, { customInstructions: instructions.trim() }), 'Anweisungen gespeichert');
  };

  const saveOwnDetails = async () => {
    if (!account) return;
    const ok = await run(
      'details',
      () =>
        patchCharacterAgent(account, agent.botId, {
          ...(roleChanged ? { role: role.trim() } : {}),
          ...(botInstructionsChanged ? { instructions: botInstructions.trim() } : {}),
        }),
      'Gespeichert',
    );
    if (ok) {
      setRole(role.trim());
      setBotInstructions(botInstructions.trim());
    }
  };

  /** Own picture: pick, upload, then switch the agent to it (a character goes). */
  const changePicture = async () => {
    if (!account || busy) return;
    let uri: string | null;
    try {
      uri = await pickPicture();
    } catch (err) {
      showSnackbar({ message: errorText(err, 'Die Fotoauswahl konnte nicht geöffnet werden.') });
      return;
    }
    if (!uri) return;
    const local = uri;
    // A former character agent loses its role line on the server: show what the server keeps.
    const after: { agent?: AgentSummary } = {};
    const ok = await run(
      'picture',
      async () => {
        const uploaded = await uploadAgentPicture(account, local);
        const next = await patchCharacterAgent(account, agent.botId, { imageUrl: uploaded.url });
        after.agent = next.agents.find((a) => a.botId === agent.botId);
        return next;
      },
      'Bild gespeichert',
    );
    if (ok && after.agent) {
      setRole(after.agent.role);
      setBotInstructions(after.agent.instructions ?? '');
    }
  };

  const makeMain = async () => {
    if (!account) return;
    const ok = await confirm({
      title: `${agent.name} zum Hauptassistenten machen?`,
      message: 'Briefings und Routinen laufen dann über diesen Agenten. Deine anderen Agenten bleiben erhalten.',
      confirmLabel: 'Zum Hauptassistenten machen',
      icon: 'star-outline',
    });
    if (!ok) return;
    // The default assistant is "no own main agent" on the server.
    void run('main', () => patchAgentProfile(account, { botId: agent.isPreset ? null : agent.botId }), `${agent.name} ist jetzt dein Hauptassistent`);
  };

  const remove = async () => {
    if (!account) return;
    const ok = await confirm({
      title: `${agent.name} entfernen?`,
      message: `Chats und Routinen von ${agent.name} bleiben erhalten und laufen ab jetzt über Mecky.`,
      confirmLabel: 'Entfernen',
      destructive: true,
      icon: 'trash-outline',
    });
    if (!ok) return;
    if (busy) return;
    setBusy('remove');
    try {
      const next = await deleteCharacterAgent(account, agent.botId);
      // Leave first: this screen has nothing to show once the agent is gone.
      if (router.canGoBack()) router.back();
      else router.replace('/chat/agents' as Href);
      setAgentView(account, next);
      void boot.refresh();
      showSnackbar({ message: `${agent.name} wurde entfernt`, duration: 2500 });
    } catch (err) {
      showSnackbar({ message: errorText(err, 'Das hat nicht geklappt.') });
    } finally {
      setBusy(null);
    }
  };

  const share = () => {
    if (!character) return;
    const url = agentShareUrl(character, agent.name);
    const text = `Das ist ${agent.name}, mein Agent in Ortis.`;
    Share.share(Platform.OS === 'ios' ? { message: text, url } : { message: `${text} ${url}`, title: agent.name }).catch(() => {});
  };

  const startChat = async () => {
    if (busy) return;
    setBusy('chat');
    try {
      const existing = findDirectThread(boot.threads, agent.botId);
      const threadId = existing ? existing.id : (await actions.createThread([agent.botId])).thread.id;
      router.push(`/chat/${threadId}` as Href);
    } catch (err) {
      showSnackbar({ message: errorText(err, 'Der Chat konnte nicht geöffnet werden.') });
    } finally {
      setBusy(null);
    }
  };

  const since = agentSince(agent.since);

  const rows: {
    key: string;
    icon: keyof typeof Feather.glyphMap;
    label: string;
    onPress: () => void;
    destructive?: boolean;
  }[] = [];
  const openCharacterPicker = () =>
    router.push({ pathname: '/chat/agents/new', params: { botId: agent.botId } } as unknown as Href);
  if (!agent.isPreset) {
    if (look === 'character') {
      rows.push({ key: 'character', icon: 'refresh-cw', label: 'Figur ändern', onPress: openCharacterPicker });
      rows.push({ key: 'picture', icon: 'image', label: 'Eigenes Bild verwenden', onPress: () => void changePicture() });
    } else {
      rows.push({ key: 'picture', icon: 'image', label: 'Bild ändern', onPress: () => void changePicture() });
      rows.push({ key: 'character', icon: 'smile', label: 'Stattdessen eine Figur wählen', onPress: openCharacterPicker });
    }
  }
  if (!agent.isMain) rows.push({ key: 'main', icon: 'star', label: 'Zum Hauptassistenten machen', onPress: () => void makeMain() });
  // The public share page only exists for illustrated characters.
  if (character) rows.push({ key: 'share', icon: 'share', label: 'Teilen', onPress: share });
  if (!agent.isPreset) rows.push({ key: 'remove', icon: 'trash-2', label: 'Entfernen', onPress: () => void remove(), destructive: true });

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      >
        <CharacterFigure
          characterId={agent.characterId}
          height={260}
          fallback={agentAvatarSpec(agent, bots)}
          name={agent.name}
        />
        {look === 'none' && !agent.isPreset ? (
          <Pressable
            accessibilityRole="button"
            disabled={!!busy}
            onPress={() => void changePicture()}
            style={({ pressed }) => [styles.pictureHint, { backgroundColor: t.chipBackground, opacity: pressed ? 0.7 : 1 }]}
          >
            {busy === 'picture' ? (
              <ActivityIndicator size="small" color={t.textSecondary} />
            ) : (
              <Feather name="image" size={16} color={t.textPrimary} />
            )}
            <Text style={[styles.pictureHintText, { color: t.textPrimary }]}>
              {busy === 'picture' ? 'Wird hochgeladen …' : `Gib ${agent.name} ein Bild`}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.head}>
          <Text style={[styles.name, { color: t.textPrimary }]}>{agent.name}</Text>
          <Text style={[styles.role, { color: t.textSecondary }]}>
            {agentRoleLine(agent)}
            {character ? `. ${character.tagline}` : ''}
          </Text>
          <View style={styles.tags}>
            {agent.isMain ? (
              <View style={[styles.tag, { backgroundColor: t.primaryButton }]}>
                <Feather name="star" size={11} color={t.primaryButtonText} />
                <Text style={[styles.tagText, { color: t.primaryButtonText }]}>Hauptassistent</Text>
              </View>
            ) : null}
            {since ? <Text style={[styles.since, { color: t.textTertiary }]}>{since}</Text> : null}
          </View>
        </View>

        <BlackPillButton label="Chat starten" onPress={startChat} loading={busy === 'chat'} />

        {editable ? (
          <>
            <Text style={[styles.label, { color: t.textSecondary }]}>Name</Text>
            <View style={[styles.field, { backgroundColor: t.groupedBackground }]}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={defaultName}
                placeholderTextColor={t.placeholder}
                maxLength={MAX_AGENT_NAME}
                returnKeyType="done"
                onSubmitEditing={() => (nameChanged ? void saveName() : undefined)}
                selectionColor={t.link}
                style={[styles.input, { color: t.textPrimary }]}
                accessibilityLabel={`Name von ${agent.name}`}
              />
            </View>
            <Text style={[styles.hint, { color: t.textTertiary }]}>
              Leer lassen stellt „{defaultName}“ wieder her.
            </Text>
            {nameChanged ? (
              <BlackPillButton label="Name speichern" onPress={saveName} loading={busy === 'name'} style={styles.save} />
            ) : null}

            {view.personalities.length ? (
              <>
                <Text style={[styles.label, { color: t.textSecondary }]}>Persönlichkeit</Text>
                <View style={[styles.group, { backgroundColor: t.groupedBackground }]}>
                  {view.personalities.map((p, i) => {
                    const on = p.key === agent.personality;
                    return (
                      <Pressable
                        key={p.key}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on, disabled: !!busy }}
                        disabled={!!busy}
                        onPress={() => savePersonality(p.key)}
                        style={({ pressed }) => [
                          styles.row,
                          i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator } : null,
                          pressed ? { opacity: 0.6 } : null,
                        ]}
                      >
                        <View style={styles.rowText}>
                          <Text style={[styles.rowTitle, { color: t.textPrimary }]}>{p.title}</Text>
                          <Text style={[styles.rowSub, { color: t.textSecondary }]}>{p.description}</Text>
                        </View>
                        <View
                          style={[
                            styles.check,
                            on ? { backgroundColor: t.primaryButton, borderColor: t.primaryButton } : { borderColor: t.textTertiary },
                          ]}
                        >
                          {on ? <Ionicons name="checkmark" size={15} color={t.primaryButtonText} /> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {ownLook ? (
              <>
                <Text style={[styles.label, { color: t.textSecondary }]}>Wofür ist {agent.name} da?</Text>
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
                    accessibilityLabel={`Wofür ${agent.name} da ist`}
                  />
                </View>
                <Text style={[styles.label, { color: t.textSecondary }]}>Wie soll {agent.name} arbeiten?</Text>
                <View style={[styles.field, styles.fieldTall, { backgroundColor: t.groupedBackground }]}>
                  <TextInput
                    value={botInstructions}
                    onChangeText={setBotInstructions}
                    placeholder={OWN_INSTRUCTIONS_PLACEHOLDER}
                    placeholderTextColor={t.placeholder}
                    multiline
                    maxLength={MAX_AGENT_INSTRUCTIONS}
                    selectionColor={t.link}
                    style={[styles.input, styles.inputTall, { color: t.textPrimary }]}
                    accessibilityLabel={`Wie ${agent.name} arbeiten soll`}
                  />
                </View>
                {roleChanged || botInstructionsChanged ? (
                  <BlackPillButton label="Speichern" onPress={saveOwnDetails} loading={busy === 'details'} style={styles.save} />
                ) : null}
              </>
            ) : null}

            {agent.isMain ? (
              <>
                <Text style={[styles.label, { color: t.textSecondary }]}>Eigene Anweisungen</Text>
                <View style={[styles.field, styles.fieldTall, { backgroundColor: t.groupedBackground }]}>
                  <TextInput
                    value={instructions}
                    onChangeText={setInstructions}
                    placeholder="z. B. Antworte kurz. Frag nach, bevor du etwas verschickst."
                    placeholderTextColor={t.placeholder}
                    multiline
                    maxLength={MAX_AGENT_INSTRUCTIONS}
                    selectionColor={t.link}
                    style={[styles.input, styles.inputTall, { color: t.textPrimary }]}
                    accessibilityLabel="Eigene Anweisungen"
                  />
                </View>
                <Text style={[styles.hint, { color: t.textTertiary }]}>
                  Was dein Hauptassistent immer beachten soll: Ton, Vorlieben, was er lassen soll.
                </Text>
                {instructionsChanged ? (
                  <BlackPillButton
                    label="Anweisungen speichern"
                    onPress={saveInstructions}
                    loading={busy === 'instructions'}
                    style={styles.save}
                  />
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <Text style={[styles.note, { color: t.textSecondary }]}>
            Name und Persönlichkeit von {agent.name} kannst du ändern, sobald {agent.name} wieder dein Hauptassistent ist.
          </Text>
        )}

        {rows.length ? (
          <>
            <Text style={[styles.label, { color: t.textSecondary }]}>Aktionen</Text>
            <View style={[styles.group, { backgroundColor: t.groupedBackground }]}>
              {rows.map((row, i) => (
                <ActionRow
                  key={row.key}
                  icon={row.icon}
                  label={row.key === 'picture' && busy === 'picture' ? 'Wird hochgeladen …' : row.label}
                  loading={row.key === 'picture' && busy === 'picture'}
                  onPress={row.onPress}
                  destructive={row.destructive}
                  disabled={!!busy}
                  divider={i > 0}
                />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  disabled,
  destructive,
  divider,
  loading,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  divider?: boolean;
}) {
  const t = useChatTokens();
  const color = destructive ? t.recordingRed : t.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        divider ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator } : null,
        pressed ? { opacity: 0.6 } : null,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={t.textSecondary} /> : <Feather name={icon} size={19} color={color} />}
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  skeleton: { marginHorizontal: chatSize.screenPadH, marginTop: 8 },
  content: { paddingHorizontal: chatSize.screenPadH, paddingTop: 4 },
  head: { alignItems: 'center', paddingTop: 16, paddingBottom: 18, paddingHorizontal: 8 },
  name: { fontFamily: chatFont.bold, fontSize: 30, letterSpacing: -0.6, textAlign: 'center' },
  role: { fontFamily: chatFont.regular, fontSize: 16, lineHeight: 22, textAlign: 'center', marginTop: 4 },
  tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 10 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 24, borderRadius: 12, paddingHorizontal: 9 },
  tagText: { fontFamily: chatFont.semiBold, fontSize: 12 },
  since: { fontFamily: chatFont.regular, fontSize: 13 },
  label: { fontFamily: chatFont.medium, fontSize: 14, marginTop: 26, marginBottom: 8, marginLeft: 4 },
  field: { borderRadius: 18, paddingHorizontal: 14, minHeight: 48, justifyContent: 'center' },
  fieldTall: { paddingVertical: 10, justifyContent: 'flex-start' },
  input: { fontFamily: chatFont.regular, fontSize: 17, paddingVertical: 0 },
  inputTall: { minHeight: 96, lineHeight: 22, textAlignVertical: 'top' },
  hint: { fontFamily: chatFont.regular, fontSize: 13, lineHeight: 18, marginTop: 6, marginLeft: 4 },
  save: { marginTop: 12 },
  note: { fontFamily: chatFont.regular, fontSize: 15, lineHeight: 21, marginTop: 22, marginHorizontal: 4 },
  group: { borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: chatFont.medium, fontSize: 16 },
  rowSub: { fontFamily: chatFont.regular, fontSize: 14, lineHeight: 19, marginTop: 2 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontFamily: chatFont.medium, fontSize: 16 },
  pictureHint: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 7,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  pictureHintText: { fontFamily: chatFont.medium, fontSize: 15 },
});
