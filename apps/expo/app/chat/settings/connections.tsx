import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSnackbar } from '@/context/SnackbarContext';
import { useChatActions } from '@/context/ChatContext';
import { ChatApiError, type ChatConnector } from '@/lib/chat/api';
import { buildMcpHeaders, connectorSubtitle, googleResultFromUrl, isLikelyMcpUrl } from '@/lib/chat/connections';
import { BlackPillButton, SettingsListSkeleton, ShimmerLine, chatFont, chatSize, useChatSheets, useChatTokens, type ChatTokens } from '@/components/chat';
import { SettingsHeader } from '@/components/chat/SettingsHeader';

const GOOGLE_MESSAGES = {
  ok: 'Google ist verbunden.',
  error: 'Google konnte nicht verbunden werden.',
  cancelled: 'Google-Verbindung abgebrochen.',
} as const;

function statusDot(c: ChatConnector, t: ChatTokens): string {
  if (c.status === 'active') return t.online;
  if (c.status === 'error') return t.recordingRed;
  return t.textTertiary;
}

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/** "Verbindungen": the user's MCP servers and Google, which bots with the 'connectors' key can use. */
export default function ChatConnectionsScreen() {
  const t = useChatTokens();
  const insets = useSafeAreaInsets();
  const { showSnackbar } = useSnackbar();
  const { confirm } = useChatSheets();
  const { fetchConnectors, addMcpConnector, deleteConnector, refreshConnector, startGoogleConnect } = useChatActions();
  const params = useLocalSearchParams<{ google?: string }>();

  const [items, setItems] = useState<ChatConnector[] | null>(null);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [auth, setAuth] = useState('');
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchConnectors();
      setItems(res.connectors);
      setGoogleAvailable(res.googleAvailable);
      setError(null);
    } catch (err) {
      setError(errorText(err, 'Verbindungen konnten nicht geladen werden.'));
    }
  }, [fetchConnectors]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Opened via the OAuth deep link (Android may route it here directly).
  useEffect(() => {
    const r = params.google;
    if (r === 'ok' || r === 'error' || r === 'cancelled') showSnackbar({ message: GOOGLE_MESSAGES[r] });
  }, [params.google, showSnackbar]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const google = items?.find((c) => c.kind === 'google') ?? null;
  const mcp = items?.filter((c) => c.kind === 'mcp') ?? [];

  const connectGoogle = async () => {
    if (!googleAvailable) {
      showSnackbar({ message: 'Google-Verbindung ist bald verfügbar.' });
      return;
    }
    setGoogleBusy(true);
    try {
      const returnUrl = Linking.createURL('chat/settings/connections');
      const authUrl = await startGoogleConnect(returnUrl);
      const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl, { showInRecents: true });
      const outcome = result.type === 'success' ? googleResultFromUrl(result.url) : null;
      if (outcome) showSnackbar({ message: GOOGLE_MESSAGES[outcome] });
      await load();
    } catch (err) {
      if (err instanceof ChatApiError && err.status === 503) {
        setGoogleAvailable(false);
        showSnackbar({ message: 'Google-Verbindung ist bald verfügbar.' });
      } else {
        showSnackbar({ message: errorText(err, 'Google konnte nicht verbunden werden.') });
      }
    } finally {
      setGoogleBusy(false);
    }
  };

  const remove = async (c: ChatConnector) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const ok = await confirm({
      title: 'Verbindung trennen?',
      message: `„${c.name}“ wird entfernt. Deine Bots können sie dann nicht mehr nutzen.`,
      confirmLabel: 'Trennen',
      destructive: true,
      icon: 'link-outline',
    });
    if (!ok) return;
    setBusyId(c.id);
    const prev = items;
    setItems((list) => list?.filter((x) => x.id !== c.id) ?? null);
    try {
      await deleteConnector(c.id);
    } catch (err) {
      setItems(prev);
      showSnackbar({ message: errorText(err, 'Trennen fehlgeschlagen.') });
    } finally {
      setBusyId(null);
    }
  };

  const refresh = async (c: ChatConnector) => {
    setBusyId(c.id);
    try {
      const fresh = await refreshConnector(c.id);
      setItems((list) => list?.map((x) => (x.id === c.id ? fresh : x)) ?? null);
      showSnackbar({ message: fresh.status === 'active' ? 'Werkzeuge aktualisiert.' : fresh.lastError || 'Verbindung gestört.' });
    } catch (err) {
      showSnackbar({ message: errorText(err, 'Aktualisieren fehlgeschlagen.') });
    } finally {
      setBusyId(null);
    }
  };

  const add = async () => {
    const n = name.trim();
    const u = url.trim();
    if (!n) return setFormError('Bitte gib einen Namen ein.');
    if (!isLikelyMcpUrl(u)) return setFormError('Bitte gib eine vollständige https-Adresse ein.');
    setFormError(null);
    setAdding(true);
    try {
      const created = await addMcpConnector({ name: n, url: u, headers: buildMcpHeaders(auth) });
      setItems((list) => [...(list ?? []), created]);
      setName('');
      setUrl('');
      setAuth('');
      setFormOpen(false);
      showSnackbar({ message: `„${created.name}“ verbunden · ${connectorSubtitle(created)}` });
    } catch (err) {
      setFormError(errorText(err, 'Der MCP-Server konnte nicht verbunden werden.'));
    } finally {
      setAdding(false);
    }
  };

  const renderRow = (c: ChatConnector) => (
    <View key={c.id} style={[styles.row, { backgroundColor: t.bubbleBot }]}>
      <View style={[styles.dot, { backgroundColor: statusDot(c, t) }]} />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: t.textPrimary }]} numberOfLines={1}>
          {c.name}
        </Text>
        <Text
          style={[styles.meta, { color: c.status === 'error' ? t.recordingRed : t.textSecondary }]}
          numberOfLines={2}
        >
          {connectorSubtitle(c)}
        </Text>
      </View>
      {busyId === c.id ? (
        <ShimmerLine width={44} height={10} />
      ) : (
        <>
          {c.kind === 'mcp' ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Werkzeuge aktualisieren" hitSlop={8} onPress={() => refresh(c)} style={styles.icon}>
              <Feather name="refresh-cw" size={17} color={t.textSecondary} />
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Verbindung trennen" hitSlop={8} onPress={() => remove(c)} style={styles.icon}>
            <Feather name="trash-2" size={18} color={t.textSecondary} />
          </Pressable>
        </>
      )}
    </View>
  );

  const inputStyle = [styles.input, { color: t.textPrimary, backgroundColor: t.groupedBackground }];

  let body: React.ReactNode;
  if (items === null && !error) {
    body = (
      <SettingsListSkeleton rows={3} withIcon style={styles.skeleton} />
    );
  } else if (items === null && error) {
    body = (
      <View style={styles.center}>
        <Text style={[styles.emptyText, { color: t.textSecondary }]}>{error}</Text>
        <BlackPillButton label="Erneut versuchen" onPress={load} style={styles.retry} />
      </View>
    );
  } else {
    body = (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textTertiary} />}
      >
        <Text style={[styles.intro, { color: t.textSecondary }]}>
          Verbinde Dienste, die deine Bots für dich nutzen dürfen. Alles, was etwas verändert oder verschickt, fragt vorher
          nach deiner Freigabe.
        </Text>

        <Text style={[styles.section, { color: t.textSecondary }]}>Google</Text>
        {google ? (
          renderRow(google)
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Google verbinden"
            disabled={googleBusy}
            onPress={connectGoogle}
            style={({ pressed }) => [styles.row, { backgroundColor: t.bubbleBot, opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="mail" size={18} color={t.icon} style={styles.leadIcon} />
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: t.textPrimary }]}>Google verbinden</Text>
              <Text style={[styles.meta, { color: t.textSecondary }]}>Gmail, Kalender und Drive</Text>
            </View>
            {googleBusy ? (
              <ShimmerLine width={44} height={10} accessibilityLabel="Google wird verbunden" />
            ) : googleAvailable ? (
              <Feather name="chevron-right" size={20} color={t.textSecondary} />
            ) : (
              <View style={[styles.chip, { backgroundColor: t.chipBackground }]}>
                <Text style={[styles.chipText, { color: t.chipText }]}>Bald verfügbar</Text>
              </View>
            )}
          </Pressable>
        )}

        <Text style={[styles.section, { color: t.textSecondary }]}>MCP-Server</Text>
        {mcp.length ? mcp.map(renderRow) : (
          <Text style={[styles.hint, { color: t.textSecondary }]}>
            Noch keine MCP-Server. Viele Dienste bieten eine MCP-Adresse an, z. B. für Notizen, Aufgaben oder Wissen.
          </Text>
        )}

        {formOpen ? (
          <View style={[styles.form, { backgroundColor: t.bubbleBot }]}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name, z. B. Notion"
              placeholderTextColor={t.placeholder}
              maxLength={60}
              style={inputStyle}
              accessibilityLabel="Name des MCP-Servers"
            />
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="https://…/mcp"
              placeholderTextColor={t.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              maxLength={2000}
              style={inputStyle}
              accessibilityLabel="Adresse des MCP-Servers"
            />
            <TextInput
              value={auth}
              onChangeText={setAuth}
              placeholder="Authorization (optional)"
              placeholderTextColor={t.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              maxLength={4000}
              style={inputStyle}
              accessibilityLabel="Authorization-Header, optional"
            />
            <Text style={[styles.formNote, { color: t.textSecondary }]}>
              Der Schlüssel wird verschlüsselt gespeichert und nie wieder angezeigt.
            </Text>
            {formError ? <Text style={[styles.formError, { color: t.recordingRed }]}>{formError}</Text> : null}
            <View style={styles.formButtons}>
              <Pressable accessibilityRole="button" onPress={() => { setFormOpen(false); setFormError(null); }} style={styles.cancel}>
                <Text style={[styles.cancelText, { color: t.textSecondary }]}>Abbrechen</Text>
              </Pressable>
              <BlackPillButton label="Hinzufügen" onPress={add} loading={adding} style={styles.addButton} />
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setFormOpen(true)}
            style={({ pressed }) => [styles.addRow, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Feather name="plus" size={18} color={t.link} />
            <Text style={[styles.addRowText, { color: t.link }]}>MCP-Server hinzufügen</Text>
          </Pressable>
        )}
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: t.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SettingsHeader title="Verbindungen" />
      {body}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  skeleton: { marginHorizontal: chatSize.screenPadH, marginTop: 8 },
  retry: { marginTop: 18, alignSelf: 'stretch' },
  list: { paddingHorizontal: chatSize.screenPadH, gap: 8 },
  intro: { fontFamily: chatFont.regular, fontSize: 15, lineHeight: 21, marginTop: 4, marginBottom: 4 },
  section: { fontFamily: chatFont.medium, fontSize: 13, marginTop: 14, marginBottom: 2, marginLeft: 4 },
  hint: { fontFamily: chatFont.regular, fontSize: 14, lineHeight: 20, marginHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  leadIcon: { width: 20 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: chatFont.medium, fontSize: 16 },
  meta: { fontFamily: chatFont.regular, fontSize: 13, marginTop: 3 },
  icon: { padding: 4 },
  chip: { height: 24, borderRadius: 12, paddingHorizontal: 9, justifyContent: 'center' },
  chipText: { fontFamily: chatFont.medium, fontSize: 12 },
  form: { borderRadius: 20, padding: 14, gap: 10, marginTop: 4 },
  input: { fontFamily: chatFont.regular, fontSize: 16, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  formNote: { fontFamily: chatFont.regular, fontSize: 12, lineHeight: 17, marginHorizontal: 2 },
  formError: { fontFamily: chatFont.regular, fontSize: 14, lineHeight: 19, marginHorizontal: 2 },
  formButtons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 2 },
  cancel: { paddingHorizontal: 8, paddingVertical: 10 },
  cancelText: { fontFamily: chatFont.medium, fontSize: 15 },
  addButton: { minWidth: 140 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 4, marginTop: 2 },
  addRowText: { fontFamily: chatFont.medium, fontSize: 16 },
  empty: { flex: 1 },
  emptyText: { fontFamily: chatFont.regular, fontSize: 15, lineHeight: 21, textAlign: 'center' },
});
