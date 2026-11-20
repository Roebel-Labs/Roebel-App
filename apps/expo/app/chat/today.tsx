import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSnackbar } from '@/context/SnackbarContext';
import { useChatAccount, useChatBootstrap } from '@/context/ChatContext';
import {
  ChatApiError,
  buildPersona,
  dismissSuggestion,
  fetchBriefing,
  fetchSuggestions,
  startSuggestion,
} from '@/lib/chat/api';
import {
  allSuggestions,
  briefingDocForViewer,
  briefingLabel,
  briefingPlainText,
  dayLine,
  greeting,
  normalizeBriefing,
  scheduleText,
  suggestionRows,
  visibleSections,
  type Briefing,
  type PersonaStatus,
  type Suggestion,
  type SuggestionFilter,
  type SuggestionSection,
} from '@/lib/chat/persona';
import {
  BlackPillButton,
  FileSheet,
  InspirationSkeleton,
  ScreenMessage,
  chatFont,
  chatSize,
  useChatSheets,
  useChatTokens,
} from '@/components/chat';
import { SettingsHeader } from '@/components/chat/SettingsHeader';

interface Data {
  briefing: Briefing;
  sections: SuggestionSection[];
  status: PersonaStatus;
}

const FILTERS: { id: SuggestionFilter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'quick', label: 'Schnell erledigt' },
  { id: 'routine', label: 'Routinen' },
];

function errorText(err: unknown, fallback: string): string {
  return err instanceof ChatApiError && err.message ? err.message : fallback;
}

/** "Dein Tag": today's briefing points and the suggestions derived from the personal wiki. */
export default function ChatTodayScreen() {
  const t = useChatTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showSnackbar } = useSnackbar();
  const { openMenu } = useChatSheets();
  const account = useChatAccount();
  const boot = useChatBootstrap();

  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<SuggestionFilter>('all');
  /** Started or dismissed on this screen. */
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    if (!account) return;
    const seq = ++loadSeq.current;
    // The suggestions carry the wiki status and decide between content and the empty state; the
    // briefing is an extra and may be missing.
    const [sug, brief] = await Promise.allSettled([fetchSuggestions(account), fetchBriefing(account)]);
    if (seq !== loadSeq.current) return;
    if (sug.status === 'rejected') {
      setError(errorText(sug.reason, 'Dein Tag konnte nicht geladen werden.'));
      return;
    }
    setError(null);
    setData({
      sections: sug.value.sections,
      status: sug.value.status,
      briefing: brief.status === 'fulfilled' ? brief.value : normalizeBriefing(null),
    });
  }, [account]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // While the wiki is being built the progress moves on its own (only while this screen is in front).
  const state = data?.status.state;
  useFocusEffect(
    useCallback(() => {
      if (state !== 'building') return undefined;
      const timer = setInterval(() => void load(), 6000);
      return () => clearInterval(timer);
    }, [state, load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const hide = (id: string) => setHidden((h) => new Set(h).add(id));

  const start = async (s: Suggestion) => {
    if (!account || busyId) return;
    setBusyId(s.id);
    try {
      const r = await startSuggestion(account, s.id);
      hide(s.id);
      if (!r.routine) {
        // No routine was created: the server opened a task thread and the client sends the brief.
        // The new task thread has to be in the thread list before its screen opens.
        await boot.refresh();
        router.push({
          pathname: '/chat/[threadId]',
          params: { threadId: r.threadId, prefill: r.prompt || s.prompt, autoSend: '1' },
        } as unknown as Href);
      } else {
        const threadId = r.threadId;
        void boot.refresh();
        showSnackbar({
          message: `Routine eingerichtet: ${r.routine?.title || s.title}`,
          actionLabel: 'Öffnen',
          onAction: () => router.push(`/chat/${threadId}` as Href),
        });
      }
    } catch (err) {
      showSnackbar({ message: errorText(err, 'Das hat nicht geklappt.') });
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (s: Suggestion) => {
    if (!account || busyId) return;
    setBusyId(s.id);
    try {
      await dismissSuggestion(account, s.id);
      hide(s.id);
    } catch (err) {
      showSnackbar({ message: errorText(err, 'Ausblenden fehlgeschlagen.') });
    } finally {
      setBusyId(null);
    }
  };

  const build = async () => {
    if (!account || building) return;
    setBuilding(true);
    try {
      await buildPersona(account, 'full');
    } catch (err) {
      // 409 = a build is already running: just show its progress.
      if (!(err instanceof ChatApiError && err.status === 409)) {
        showSnackbar({ message: errorText(err, 'Der Aufbau konnte nicht gestartet werden.') });
      }
    } finally {
      await load();
      setBuilding(false);
    }
  };

  const everything = useMemo(() => (data ? allSuggestions(data.sections) : []), [data]);
  const total = everything.filter((s) => !hidden.has(s.id)).length;
  const hasQuick = everything.some((s) => s.quick && s.kind === 'task' && !hidden.has(s.id));
  const hasRoutine = everything.some((s) => s.kind === 'routine' && !hidden.has(s.id));
  const activeFilter: SuggestionFilter = (filter === 'quick' && !hasQuick) || (filter === 'routine' && !hasRoutine) ? 'all' : filter;
  const rows = useMemo(
    () => (data ? suggestionRows(visibleSections(data.sections, hidden, activeFilter)) : []),
    [data, hidden, activeFilter],
  );

  let body: React.ReactNode;
  if (!account || boot.hasSession === false) {
    body = <ScreenMessage text="Melde dich im Chat an, um deinen Tag zu sehen." />;
  } else if (!data && error) {
    body = <ScreenMessage text={error} actionLabel="Erneut versuchen" onAction={() => void load()} />;
  } else if (!data) {
    body = <InspirationSkeleton style={styles.skeleton} />;
  } else {
    const { briefing, status } = data;
    const now = new Date();
    const needsSetup = (status.state === 'empty' || status.state === 'error') && total === 0;
    body = (
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textTertiary} />}
      >
        <Text style={[styles.date, { color: t.textSecondary }]}>{dayLine(now)}</Text>
        <Text style={[styles.title, { color: t.textPrimary }]}>
          {greeting(now.getHours())}
          {briefing.name ? `, ${briefing.name}` : ''}.
        </Text>

        {briefing.items.length ? (
          <View style={[styles.card, { backgroundColor: t.bubbleBot }]}>
            {briefing.items.map((it, i) => {
              const label = briefingLabel(it.label);
              const task = it.task && !hidden.has(it.task.id) ? it.task : null;
              return (
                <View
                  key={`${i}-${label}`}
                  style={[styles.point, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator } : null]}
                >
                  <Text style={[styles.pointText, { color: t.textPrimary }]}>
                    {label ? <Text style={styles.pointLabel}>{label}: </Text> : null}
                    {briefingPlainText(it.text)}
                  </Text>
                  {task ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={!!busyId}
                      hitSlop={6}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        void start(task);
                      }}
                      style={({ pressed }) => [styles.pointAction, { opacity: pressed || busyId === task.id ? 0.5 : 1 }]}
                    >
                      <Text style={[styles.pointActionText, { color: t.link }]}>
                        {busyId === task.id ? 'Einen Moment …' : task.kind === 'routine' ? 'Routine einrichten' : 'Jetzt angehen'}
                      </Text>
                      <Feather name="arrow-right" size={15} color={t.link} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {briefing.doc ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setDocOpen(true);
            }}
            style={({ pressed }) => [styles.docRow, { backgroundColor: t.chipBackground, opacity: pressed ? 0.75 : 1 }]}
          >
            <Feather name="file-text" size={17} color={t.textPrimary} />
            <Text style={[styles.docLabel, { color: t.textPrimary }]}>Ganzes Briefing lesen</Text>
            <Feather name="chevron-right" size={18} color={t.textTertiary} />
          </Pressable>
        ) : null}

        {status.state === 'building' ? <BuildProgress status={status} /> : null}

        {needsSetup ? (
          <Onboarding
            status={status}
            busy={building}
            onBuild={() => void build()}
            onConnect={() => router.push('/chat/settings/connections' as Href)}
          />
        ) : null}

        {status.state === 'ready' && total === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: t.textPrimary }]}>Gerade keine Vorschläge</Text>
            <Text style={[styles.emptyText, { color: t.textSecondary }]}>
              Sobald Ortis in deinen Quellen etwas findet, das sich lohnt, erscheint es hier.
            </Text>
          </View>
        ) : null}

        {total > 0 ? (
          <>
            <Text style={[styles.sub, { color: t.textPrimary }]}>Dabei kann ich dir helfen</Text>
            {hasQuick || hasRoutine ? (
              <View style={styles.chips}>
                {FILTERS.filter((f) => f.id === 'all' || (f.id === 'quick' ? hasQuick : hasRoutine)).map((f) => {
                  const on = f.id === activeFilter;
                  return (
                    <Pressable
                      key={f.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setFilter(f.id);
                      }}
                      style={({ pressed }) => [
                        styles.chip,
                        { backgroundColor: on ? t.primaryButton : t.chipBackground, opacity: pressed ? 0.8 : 1 },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: on ? t.primaryButtonText : t.textSecondary }]}>{f.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {rows.map((row) => {
              if (row.type === 'section') {
                return (
                  <Text key={row.key} style={[styles.sectionTitle, { color: t.textPrimary }]}>
                    {row.title}
                  </Text>
                );
              }
              if (row.type === 'group') {
                return (
                  <Text key={row.key} style={[styles.groupTitle, { color: t.textSecondary }]}>
                    {row.title}
                  </Text>
                );
              }
              const s = row.item;
              const busy = busyId === s.id;
              const schedule = s.kind === 'routine' ? scheduleText(s.schedule) : '';
              return (
                <Pressable
                  key={row.key}
                  onLongPress={() =>
                    openMenu({
                      title: s.title,
                      items: [{ label: 'Ausblenden', icon: 'eye-off-outline', destructive: true, onPress: () => void dismiss(s) }],
                    })
                  }
                  delayLongPress={300}
                  style={[styles.sug, { backgroundColor: t.bubbleBot }]}
                >
                  <View style={styles.sugHead}>
                    <View style={[styles.sugIcon, { backgroundColor: t.surface }]}>
                      <Feather name={s.kind === 'routine' ? 'clock' : 'edit-3'} size={16} color={t.textPrimary} />
                    </View>
                    <View style={styles.sugText}>
                      <Text style={[styles.sugTitle, { color: t.textPrimary }]}>
                        {s.title}
                        {s.fresh ? <Text style={[styles.fresh, { color: t.newDivider }]}>  Neu</Text> : null}
                      </Text>
                      {s.reason || schedule ? (
                        <Text style={[styles.sugReason, { color: t.textSecondary }]}>
                          {[s.reason, schedule].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.sugActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !!busyId }}
                      disabled={!!busyId}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        void start(s);
                      }}
                      style={({ pressed }) => [
                        styles.sugBtn,
                        { backgroundColor: t.primaryButton, opacity: pressed || (busyId && !busy) ? 0.6 : 1 },
                      ]}
                    >
                      <Text style={[styles.sugBtnText, { color: t.primaryButtonText }]}>
                        {busy ? 'Einen Moment …' : s.kind === 'routine' ? 'Einrichten' : 'Jetzt angehen'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !!busyId }}
                      disabled={!!busyId}
                      hitSlop={6}
                      onPress={() => void dismiss(s)}
                      style={({ pressed }) => [styles.sugGhost, { opacity: pressed ? 0.5 : 1 }]}
                    >
                      <Text style={[styles.sugGhostText, { color: t.textSecondary }]}>Ausblenden</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            })}

            {rows.length === 0 ? (
              <Text style={[styles.emptyText, styles.filterEmpty, { color: t.textSecondary }]}>
                Keine Vorschläge in dieser Ansicht.
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    );
  }

  const doc = data?.briefing.doc ?? null;
  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <SettingsHeader title="Dein Tag" />
      {body}
      <FileSheet
        visible={docOpen && !!doc}
        onClose={() => setDocOpen(false)}
        name={data?.briefing.title ?? 'Tagesbriefing'}
        content={doc ? briefingDocForViewer(doc) : null}
      />
    </View>
  );
}

function BuildProgress({ status }: { status: PersonaStatus }) {
  const t = useChatTokens();
  const pct = Math.round(status.progress * 100);
  return (
    <View style={[styles.card, styles.cardPad, { backgroundColor: t.bubbleBot }]} accessibilityRole="progressbar">
      <View style={styles.buildRow}>
        <Text style={[styles.buildLabel, { color: t.textPrimary }]} numberOfLines={2}>
          {status.stageLabel || 'Ortis baut dein Wiki auf …'}
        </Text>
        <Text style={[styles.buildPct, { color: t.textSecondary }]}>{pct} %</Text>
      </View>
      <View style={[styles.track, { backgroundColor: t.separator }]}>
        <View style={[styles.fill, { backgroundColor: t.textPrimary, width: `${Math.max(3, pct)}%` }]} />
      </View>
      <Text style={[styles.buildHint, { color: t.textSecondary }]}>
        Das dauert ein paar Minuten. Du kannst die App in der Zwischenzeit weiter nutzen.
      </Text>
    </View>
  );
}

/** Empty state as in Ortis Studio: what the wiki is, which sources are connected, build or connect. */
function Onboarding({
  status,
  busy,
  onBuild,
  onConnect,
}: {
  status: PersonaStatus;
  busy: boolean;
  onBuild: () => void;
  onConnect: () => void;
}) {
  const t = useChatTokens();
  const failed = status.state === 'error';
  const connected = status.sources.google;
  const sources: { label: string; value: string; ok: boolean }[] = [
    { label: 'Google (Kalender, Gmail)', value: connected ? 'Verbunden' : 'Nicht verbunden', ok: connected },
    { label: 'Röbel App', value: 'Immer verbunden', ok: true },
    { label: 'Importe aus Claude oder ChatGPT', value: String(status.sources.imports), ok: status.sources.imports > 0 },
  ];
  return (
    <View style={[styles.card, styles.cardPad, { backgroundColor: t.bubbleBot }]}>
      <Text style={[styles.onboardTitle, { color: t.textPrimary }]}>
        {failed ? 'Das Wiki konnte nicht aufgebaut werden' : 'Lern mich kennen'}
      </Text>
      <Text style={[styles.onboardText, { color: t.textSecondary }]}>
        {failed
          ? `${status.error || 'Beim Aufbau ist etwas schiefgegangen.'} Du kannst es einfach noch einmal versuchen.`
          : 'Ortis baut aus deinen verbundenen Quellen ein persönliches Wiki: wer du bist, woran du arbeitest und mit wem. Daraus entstehen dein Tagesbriefing und Vorschläge für Aufgaben und Routinen.'}
      </Text>
      <View style={styles.sources}>
        {sources.map((s, i) => (
          <View
            key={s.label}
            style={[styles.sourceRow, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator } : null]}
          >
            <Text style={[styles.sourceLabel, { color: t.textPrimary }]}>{s.label}</Text>
            <Text style={[styles.sourceValue, { color: s.ok ? t.check : t.textSecondary }]}>{s.value}</Text>
          </View>
        ))}
      </View>
      <BlackPillButton label={failed ? 'Erneut aufbauen' : 'Wiki jetzt aufbauen'} onPress={onBuild} loading={busy} />
      {!connected ? (
        <Pressable accessibilityRole="button" onPress={onConnect} hitSlop={6} style={styles.connect}>
          <Text style={[styles.connectText, { color: t.textPrimary }]}>Google verbinden</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  skeleton: { marginHorizontal: chatSize.screenPadH, marginTop: 8 },
  content: { paddingHorizontal: chatSize.screenPadH, paddingTop: 4 },
  date: { fontFamily: chatFont.regular, fontSize: 15 },
  title: { fontFamily: chatFont.bold, fontSize: 30, letterSpacing: -0.6, marginTop: 2, marginBottom: 16 },
  card: { borderRadius: 22, overflow: 'hidden', marginBottom: 12 },
  cardPad: { padding: 16 },
  point: { paddingHorizontal: 16, paddingVertical: 13 },
  pointText: { fontFamily: chatFont.regular, fontSize: 16, lineHeight: 22 },
  pointLabel: { fontFamily: chatFont.semiBold },
  pointAction: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start' },
  pointActionText: { fontFamily: chatFont.medium, fontSize: 15 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, borderRadius: 24, paddingHorizontal: 16, marginBottom: 12 },
  docLabel: { flex: 1, fontFamily: chatFont.medium, fontSize: 16 },
  buildRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  buildLabel: { flex: 1, fontFamily: chatFont.medium, fontSize: 16, lineHeight: 21 },
  buildPct: { fontFamily: chatFont.regular, fontSize: 15 },
  track: { height: 4, borderRadius: 2, marginTop: 12, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  buildHint: { fontFamily: chatFont.regular, fontSize: 14, lineHeight: 19, marginTop: 10 },
  onboardTitle: { fontFamily: chatFont.semiBold, fontSize: 19, letterSpacing: -0.2 },
  onboardText: { fontFamily: chatFont.regular, fontSize: 15, lineHeight: 21, marginTop: 6 },
  sources: { marginVertical: 14 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
  sourceLabel: { flex: 1, fontFamily: chatFont.regular, fontSize: 15 },
  sourceValue: { fontFamily: chatFont.medium, fontSize: 14 },
  connect: { alignSelf: 'center', paddingVertical: 12 },
  connectText: { fontFamily: chatFont.medium, fontSize: 16 },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 16, gap: 6 },
  emptyTitle: { fontFamily: chatFont.semiBold, fontSize: 18 },
  emptyText: { fontFamily: chatFont.regular, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  filterEmpty: { paddingVertical: 24 },
  sub: { fontFamily: chatFont.semiBold, fontSize: 20, letterSpacing: -0.3, marginTop: 14, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: { height: 34, borderRadius: 17, paddingHorizontal: 14, justifyContent: 'center' },
  chipText: { fontFamily: chatFont.medium, fontSize: 14 },
  sectionTitle: { fontFamily: chatFont.semiBold, fontSize: 18, letterSpacing: -0.2, marginTop: 20, marginBottom: 2 },
  groupTitle: { fontFamily: chatFont.medium, fontSize: 14, marginTop: 14, marginBottom: 8, marginLeft: 4 },
  sug: { borderRadius: 22, padding: 14, marginBottom: 8 },
  sugHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sugIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sugText: { flex: 1, minWidth: 0 },
  sugTitle: { fontFamily: chatFont.medium, fontSize: 16, lineHeight: 21 },
  fresh: { fontFamily: chatFont.semiBold, fontSize: 12 },
  sugReason: { fontFamily: chatFont.regular, fontSize: 14, lineHeight: 19, marginTop: 3 },
  sugActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12, marginLeft: 44 },
  sugBtn: { height: 36, borderRadius: 18, paddingHorizontal: 16, justifyContent: 'center' },
  sugBtnText: { fontFamily: chatFont.semiBold, fontSize: 15 },
  sugGhost: { height: 36, justifyContent: 'center' },
  sugGhostText: { fontFamily: chatFont.medium, fontSize: 15 },
});
