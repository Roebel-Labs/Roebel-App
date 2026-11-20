/**
 * Ausweis-Designer on the phone. Without params: the org's designs and "Neuer Ausweis".
 * `?new=1`: pick a template, then edit. `?draft=<id>`: edit that draft.
 * Drafting works for every owner/admin org while the designer is on (status `designer`),
 * independent of the register; publishing needs the register on and the org registered.
 * Every change autosaves 2 s after the last edit; a newer version from another device asks
 * "keep mine / load theirs". Never shows a wallet address.
 */
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import type { CardDesign, CardTemplate } from '@roebel/card-design';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useUser } from '@/context/UserContext';
import { fontFamily } from '@/constants/theme';
import { CredentialScreenFrame, CredentialStatus } from '@/components/credentials/CredentialScreenFrame';
import EditorCanvas from '@/components/credentials/designer/EditorCanvas';
import AddSheet, { pickImage } from '@/components/credentials/designer/AddSheet';
import PropsSheet from '@/components/credentials/designer/PropsSheet';
import TemplateSheet, { EMPTY_CARD, TemplateGrid } from '@/components/credentials/designer/TemplateSheet';
import DraftList from '@/components/credentials/designer/DraftList';
import { editorReducer, initialEditorState, useAutosave, type EditorAction } from '@/lib/card-design/editor-state';
import { holderValues, useHolder } from '@/lib/card-design/holder-values';
import { usePublishGate } from '@/lib/card-design/publish-gate';
import { useDesignerOpen } from '@/lib/card-design/designer-status';
import {
  designErrorMessage, fetchDraft, generateDesignBackground, generateDesignSticker, publishDraft, saveDraft, uploadDesignAsset,
  type AssetKind, type DesignKind, type DraftWithDesign,
} from '@/lib/credreg/designs';
import type { SigningAccount } from '@/lib/signed-request';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KIND_LABELS: Record<DesignKind, string> = { membership: 'Mitgliedschaft', role: 'Amt', badge: 'Abzeichen' };
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type EditorInit = {
  draftId: string | null;
  accountId: string;
  name: string;
  kind: DesignKind;
  template: string | null;
  design: CardDesign;
  revision: number;
  liveVersion: number | null;
  typeId: string | null;
};

export default function DesignerScreen() {
  const params = useLocalSearchParams<{ draft?: string; new?: string }>();
  const draftId = typeof params.draft === 'string' && UUID.test(params.draft) ? params.draft : null;
  const isNew = params.new === '1';
  const account = useActiveAccount();
  const { activeAccount, roleInActiveAccount } = useAccount();
  const open = useDesignerOpen();
  const orgId = activeAccount?.account_type === 'organisation' ? activeAccount.id : null;
  const isAdmin = roleInActiveAccount === 'owner' || roleInActiveAccount === 'admin';
  const title = 'Ausweis-Designer';

  if (open === null) return <Frame title={title}><CredentialStatus loading /></Frame>;
  if (!open) return <Frame title={title}><CredentialStatus title="Noch nicht verfügbar" message="Der Ausweis-Designer ist noch nicht freigeschaltet." /></Frame>;
  if (!account) return <Frame title={title}><CredentialStatus title="Bitte anmelden" message="Melde dich an, um Ausweise zu gestalten." /></Frame>;
  if (draftId) return <DraftLoader account={account} draftId={draftId} fallbackOrg={orgId} />;
  if (!orgId || !isAdmin) {
    return <Frame title={title}><CredentialStatus title="Keine Berechtigung" message="Ausweise gestalten können Inhaber:innen und Admins einer Organisation." /></Frame>;
  }
  if (isNew) return <NewDesign account={account} accountId={orgId} />;
  return (
    <Frame title={title}>
      <ScrollView contentContainerStyle={styles.page}>
        <DraftList account={account} accountId={orgId} />
      </ScrollView>
    </Frame>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return <CredentialScreenFrame title={title}>{children}</CredentialScreenFrame>;
}

function DraftLoader({ account, draftId, fallbackOrg }: { account: SigningAccount; draftId: string; fallbackOrg: string | null }) {
  const [state, setState] = useState<{ draft: DraftWithDesign } | { error: string } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchDraft(account, draftId).then((res) => {
      if (alive) setState(res.ok ? { draft: res.data } : { error: designErrorMessage(res, 'draft') });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.address, draftId]);
  if (!state) return <Frame title="Ausweis-Designer"><CredentialStatus loading /></Frame>;
  if ('error' in state) return <Frame title="Ausweis-Designer"><CredentialStatus title="Nicht verfügbar" message={state.error} /></Frame>;
  const d = state.draft;
  const accountId = d.accountId ?? fallbackOrg;
  if (!accountId) return <Frame title="Ausweis-Designer"><CredentialStatus title="Nicht verfügbar" message="Wechsle zuerst zur Organisation dieses Entwurfs." /></Frame>;
  return (
    <Editor
      account={account}
      init={{ draftId: d.id, accountId, name: d.name, kind: d.kind, template: d.template, design: d.design, revision: d.revision, liveVersion: d.liveVersion, typeId: d.typeId }}
    />
  );
}

function NewDesign({ account, accountId }: { account: SigningAccount; accountId: string }) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const [picked, setPicked] = useState<{ template: CardTemplate | null } | null>(null);
  if (!picked) {
    return (
      <Frame title="Neuer Ausweis">
        <ScrollView contentContainerStyle={styles.page}>
          <Text style={[styles.lead, { color: colors.textSecondary }]}>Wähle eine Vorlage. Alles darauf lässt sich danach ändern.</Text>
          <TemplateGrid width={width - 32} onPick={(template) => setPicked({ template })} />
        </ScrollView>
      </Frame>
    );
  }
  const t = picked.template;
  return (
    <Editor
      account={account}
      init={{
        draftId: null, accountId, name: t && t.format === 'stamp' ? 'Abzeichen' : 'Mitgliedsausweis',
        kind: t && t.format === 'stamp' ? 'badge' : 'membership', template: t?.id ?? null, design: t ? t.design : EMPTY_CARD,
        revision: 0, liveVersion: null, typeId: null,
      }}
    />
  );
}

type Sheet = 'add' | 'props' | 'templates' | null;

function Editor({ account, init }: { account: SigningAccount; init: EditorInit }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const { user } = useUser();
  const holder = useHolder(account.address, user?.display_name || user?.username || null);
  const [state, dispatch] = useReducer(editorReducer, init, (i) => {
    const s = initialEditorState(i.design, i.revision);
    // A new design is saved (created) right away.
    return i.draftId ? s : { ...s, dirty: true };
  });
  const [name, setName] = useState(init.name);
  const [kind, setKind] = useState<DesignKind>(init.kind);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<'publish' | 'test' | null>(null);
  const [touching, setTouching] = useState(false);
  const draftIdRef = useRef<string | null>(init.draftId);
  const [draftId, setDraftId] = useState<string | null>(init.draftId);
  const [liveVersion, setLiveVersion] = useState(init.liveVersion);
  const kindFixed = init.typeId !== null;
  const meta = useRef({ name, kind });
  meta.current = { name, kind };

  const save = useCallback(
    async (design: CardDesign, baseRevision: number) => {
      const res = await saveDraft(account, {
        accountId: init.accountId,
        draftId: draftIdRef.current ?? undefined,
        baseRevision,
        name: meta.current.name.trim(),
        kind: meta.current.kind,
        template: init.template,
        design,
      });
      if (res.ok) {
        if (!draftIdRef.current) {
          draftIdRef.current = res.data.id;
          setDraftId(res.data.id);
          // The route stays as it is: changing its params would swap NewDesign for DraftLoader and
          // remount the editor (lost undo history, uploads in flight, a running gesture).
        }
        setLiveVersion(res.data.liveVersion);
      }
      return res;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account.address, init.accountId, init.template],
  );
  const autosave = useAutosave(state, dispatch, save);
  const gate = usePublishGate(init.accountId);

  // fn and select run in the reducer on the latest design: two quick changes never overwrite each other.
  const apply = useCallback(
    (fn: (d: CardDesign) => CardDesign, select?: (d: CardDesign) => string | null) => dispatch({ type: 'apply', fn, select }),
    [],
  );

  // Leaving (back, swipe, hardware back): save first; if that is not possible, ask.
  const navigation = useNavigation();
  const leaveState = useRef(state);
  leaveState.current = state;
  const leaving = useRef(false);
  const flushRef = useRef(autosave.flush);
  flushRef.current = autosave.flush;
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        const s = leaveState.current;
        if (leaving.current || (!s.dirty && !s.conflict)) return;
        e.preventDefault();
        const leave = () => {
          leaving.current = true;
          navigation.dispatch(e.data.action);
        };
        void flushRef.current().then((ok) => {
          if (ok) return leave();
          Alert.alert('Änderungen nicht gespeichert', 'Deine letzten Änderungen konnten nicht gespeichert werden.', [
            { text: 'Bleiben', style: 'cancel' },
            { text: 'Trotzdem verlassen', style: 'destructive', onPress: leave },
          ]);
        });
      }),
    [navigation],
  );

  const upload = useCallback(
    async (assetKind: AssetKind) => {
      const img = await pickImage();
      if (!img) return null;
      if (img.size !== null && img.size > MAX_IMAGE_BYTES) {
        return { ok: false as const, code: 'TOO_LARGE', message: 'Das Bild ist zu groß (höchstens 8 MB).' };
      }
      return uploadDesignAsset(account, { accountId: init.accountId, kind: assetKind, uri: img.uri, mime: img.mime });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account.address, init.accountId],
  );

  const generate = useMemo(
    () => ({
      background: (prompt: string) => generateDesignBackground(account, init.accountId, prompt),
      sticker: (prompt: string) => generateDesignSticker(account, init.accountId, prompt),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account.address, init.accountId],
  );

  const sendToPhone = async () => {
    if (busy) return;
    setBusy('test');
    const ok = await autosave.flush();
    setBusy(null);
    if (!ok || !draftIdRef.current) {
      setNotice(autosave.error ?? 'Erst speichern, dann testen.');
      return;
    }
    router.push(`/org/credentials/design-test?draft=${draftIdRef.current}` as any);
  };

  const publish = async () => {
    if (busy || !gate.allowed) return;
    setBusy('publish');
    setNotice(null);
    const ok = await autosave.flush();
    if (!ok || !draftIdRef.current) {
      setBusy(null);
      setNotice(autosave.error ?? 'Der Entwurf ist noch nicht gespeichert.');
      return;
    }
    const res = await publishDraft(account, draftIdRef.current);
    setBusy(null);
    if (!res.ok) {
      setNotice(designErrorMessage(res));
      return;
    }
    router.push(`/org/credentials/approve/${res.data.actionId}` as any);
  };

  const values = useMemo(
    () => holderValues({ verifiedName: holder.verifiedName, displayName: holder.displayName, validUntil: null, acceptedAt: null }),
    [holder],
  );
  const selectedLayer = state.selected ? state.design.layers.find((l) => l.id === state.selected) ?? null : null;
  const cardWidth = Math.min(screenWidth - 32, 560);
  const saveLabel =
    autosave.status === 'saving' ? 'Speichert …' : autosave.status === 'error' ? 'Nicht gespeichert – erneut versuchen' : state.dirty ? 'Ungespeichert' : 'Gespeichert';
  const d = (a: EditorAction) => dispatch(a);

  return (
    <Frame title={draftId ? 'Ausweis bearbeiten' : 'Neuer Ausweis'}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" scrollEnabled={!touching && !state.gestureBase}>
        <TextInput
          value={name}
          onChangeText={(v) => { setName(v.slice(0, 60)); dispatch({ type: 'touch' }); }}
          placeholder="Name des Ausweises"
          placeholderTextColor={colors.textTertiary}
          style={[styles.nameInput, { color: colors.textPrimary, borderColor: colors.border }]}
          accessibilityLabel="Name des Ausweises"
        />
        <View style={styles.chips}>
          {(Object.keys(KIND_LABELS) as DesignKind[]).map((k) => (
            <Pressable
              key={k}
              disabled={kindFixed}
              onPress={() => { setKind(k); dispatch({ type: 'touch' }); }}
              style={[styles.chip, { borderColor: kind === k ? colors.primary : colors.border }, kindFixed && kind !== k && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel={KIND_LABELS[k]}
              accessibilityState={{ selected: kind === k, disabled: kindFixed }}
            >
              <Text style={[styles.chipText, { color: colors.textPrimary }]}>{KIND_LABELS[k]}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.statusRow}>
          <Pressable onPress={autosave.status === 'error' ? autosave.retry : undefined} accessibilityRole="text">
            <Text style={[styles.saveState, { color: autosave.status === 'error' ? colors.error : colors.textSecondary }]}>{saveLabel}</Text>
          </Pressable>
          <View style={styles.undoRow}>
            <SmallButton label="Rückgängig" disabled={state.past.length === 0} onPress={() => d({ type: 'undo' })} />
            <SmallButton label="Wiederholen" disabled={state.future.length === 0} onPress={() => d({ type: 'redo' })} />
          </View>
        </View>

        <EditorCanvas
          design={state.design}
          selected={state.selected}
          width={cardWidth}
          values={values}
          dispatch={dispatch}
          onTouching={setTouching}
        />
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Tippen wählt aus, ziehen verschiebt, mit zwei Fingern vergrößern und drehen.
        </Text>

        <View style={styles.toolbar}>
          <ToolButton label="Vorlagen" onPress={() => setSheet('templates')} />
          <ToolButton label="Hinzufügen" onPress={() => setSheet('add')} />
          <ToolButton label="Bearbeiten" disabled={!selectedLayer} onPress={() => setSheet('props')} />
        </View>

        {notice ? <Text style={[styles.notice, { color: colors.error }]}>{notice}</Text> : null}
        <Pressable
          onPress={sendToPhone}
          style={[styles.secondary, { borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Auf mein Handy senden"
        >
          {busy === 'test' ? <ActivityIndicator color={colors.primary} /> : <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Auf mein Handy senden</Text>}
        </Pressable>
        <Pressable
          onPress={publish}
          disabled={!gate.allowed || busy !== null}
          style={[styles.primary, { backgroundColor: colors.primary }, (!gate.allowed || busy !== null) && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel={liveVersion ? 'Update veröffentlichen' : 'Veröffentlichen'}
          accessibilityState={{ disabled: !gate.allowed || busy !== null }}
        >
          {busy === 'publish' ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.primaryText, { color: colors.onPrimary }]}>{liveVersion ? 'Update veröffentlichen' : 'Veröffentlichen'}</Text>
          )}
        </Pressable>
        {!gate.allowed && gate.reason ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{gate.reason}</Text> : null}
      </ScrollView>

      <TemplateSheet
        visible={sheet === 'templates'}
        onClose={() => setSheet(null)}
        width={screenWidth - 48}
        onPick={(design) => { apply(() => design); dispatch({ type: 'select', id: null }); }}
      />
      <AddSheet visible={sheet === 'add'} onClose={() => setSheet(null)} design={state.design} apply={apply} upload={upload} generate={generate} />
      <PropsSheet
        visible={sheet === 'props'}
        onClose={() => setSheet(null)}
        layer={selectedLayer}
        apply={(fn) => apply(fn)}
        onDeleted={() => { dispatch({ type: 'select', id: null }); setSheet(null); }}
      />
      {state.conflict ? (
        <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
          <View style={[styles.dialog, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.dialogTitle, { color: colors.textPrimary }]}>Auf einem anderen Gerät geändert</Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Dieser Entwurf wurde inzwischen woanders bearbeitet. Welche Version soll bleiben?
            </Text>
            <Pressable
              onPress={() => dispatch({ type: 'keepMine' })}
              style={[styles.primary, { backgroundColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel="Meine Version behalten"
            >
              <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Meine Version behalten</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const server = state.conflict!;
                setName(server.name);
                setKind(server.kind);
                dispatch({ type: 'replace', design: server.design, revision: server.revision });
              }}
              style={[styles.secondary, { borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Andere Version laden"
            >
              <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Andere Version laden</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Frame>
  );
}

function SmallButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.small, { borderColor: colors.border }, disabled && styles.disabled]} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}>
      <Text style={[styles.smallText, { color: colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

function ToolButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.tool, { backgroundColor: colors.surface, borderColor: colors.border }, disabled && styles.disabled]} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}>
      <Text style={[styles.toolText, { color: colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  lead: { fontSize: 15, fontFamily: fontFamily.regular },
  nameInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, fontSize: 17, fontFamily: fontFamily.semiBold },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 14, fontFamily: fontFamily.medium },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  saveState: { fontSize: 13, fontFamily: fontFamily.medium },
  undoRow: { flexDirection: 'row', gap: 8 },
  small: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  smallText: { fontSize: 13, fontFamily: fontFamily.medium },
  hint: { fontSize: 13, fontFamily: fontFamily.regular },
  toolbar: { flexDirection: 'row', gap: 8 },
  tool: { flex: 1, borderWidth: 1, borderRadius: 12, alignItems: 'center', paddingVertical: 12 },
  toolText: { fontSize: 14, fontFamily: fontFamily.semiBold },
  notice: { fontSize: 14, fontFamily: fontFamily.medium },
  primary: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  primaryText: { fontSize: 16, fontFamily: fontFamily.semiBold },
  secondary: { paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center', alignSelf: 'stretch' },
  secondaryText: { fontSize: 16, fontFamily: fontFamily.semiBold },
  disabled: { opacity: 0.45 },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 12, alignSelf: 'stretch' },
  dialogTitle: { fontSize: 18, fontFamily: fontFamily.heading },
});
