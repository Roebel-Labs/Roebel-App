import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import * as ImagePicker from 'expo-image-picker';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useTheme } from '@/context/ThemeContext';
import { useVerificationContext } from '@/context/VerificationContext';
import { fontFamily } from '@/constants/theme';
import { useGoBack } from '@/hooks/useGoBack';
import { ArrowLeftIcon } from '@/components/Icons';
import MeckyNotFound from '@/components/MeckyNotFound';
import BottomDrawer from '@/components/BottomDrawer';
import ConfirmationDrawer from '@/components/ConfirmationDrawer';
import FilePickerSheet, { type PickedFile } from '@/components/forum/FilePickerSheet';
import StatusChip from '@/components/vorhaben/StatusChip';
import { displayNames, fetchTaskDetail, vorhabenAction, type ActivityRow, type TaskAttachment, type TaskDetail } from '@/lib/vorhaben';
import { FINAL_TASK_STATUSES, formatAmount, TASK_STATUS_LABELS, taskTone, type TaskStatus } from '@/lib/vorhaben-labels';
import type { VorhabenAction } from '@/lib/signed-request';
import { personRoleFor } from '@/lib/nostr/vorhaben-events';
import { uploadMediaFile } from '@/lib/upload-media';
import { FORUM_ATTACHMENTS_BUCKET, uploadForumFileFromBase64 } from '@/lib/forum-attachments';
import { formatRelativeTimestamp } from '@/lib/utils';

const PROPOSER_INACTIVE_MS = 7 * 24 * 3600 * 1000;
const UPLOAD_TIMEOUT_MS = 60000;
const TX_RE = /^0x[0-9a-fA-F]{64}$/;
type Drawer = null | 'apply' | 'proof' | 'changes' | 'cancel' | 'approve';
type ProofItem = { type: 'image' | 'pdf'; url: string; label: string };

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const statusLabel = (s: string | null) => (s ? TASK_STATUS_LABELS[s as TaskStatus] ?? s : '');

export default function TaskTicketScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const goBack = useGoBack();
  const account = useActiveAccount();
  const { hasAttesterNFT } = useVerificationContext();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [noAccount, setNoAccount] = useState(false);

  const [applyNote, setApplyNote] = useState('');
  const [changesText, setChangesText] = useState('');
  const [cancelText, setCancelText] = useState('');
  const [comment, setComment] = useState('');
  const [proofText, setProofText] = useState('');
  const [proofTx, setProofTx] = useState('');
  const [proofItems, setProofItems] = useState<ProofItem[]>([]);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await fetchTaskDetail(id);
      setDetail(d);
      setLoadError(null);
      if (d) {
        const wallets = [
          d.task.assignee_wallet ?? '', ...d.applications.map((a) => a.applicant_wallet), ...d.activity.map((a) => a.actor_wallet),
        ].filter(Boolean);
        setNames(await displayNames(wallets));
      }
    } catch {
      setLoadError('Verbindung fehlgeschlagen. Bitte später erneut versuchen.');
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (account) { setNoAccount(false); return; }
    const t = setTimeout(() => setNoAccount(true), 4000);
    return () => clearTimeout(t);
  }, [account]);

  /** One signed action; true on success (then reloads). Errors land in `actionError` or the open drawer. */
  const run = async (action: VorhabenAction, payload: Record<string, unknown>, inDrawer = false): Promise<boolean> => {
    if (busyRef.current || !account || !detail) return false;
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    setDrawerError(null);
    try {
      // Person-signed path (NSP-13): the role this screen acts in and the status it saw.
      const role = personRoleFor(action, account.address.toLowerCase() === detail.proposal.proposer);
      const ctx = role ? { proposalKey: detail.proposal.key, role, status: detail.task.status } : undefined;
      const r = await vorhabenAction(account, action, { taskId: detail.task.id, ...payload }, ctx);
      if (!r.ok) {
        const msg = r.code === 'NETWORK_ERROR' ? 'Keine Verbindung. Bitte versuche es erneut.' : r.message;
        if (inDrawer) setDrawerError(msg); else setActionError(msg);
        if (['CONFLICT', 'BAD_STATUS', 'STATE_MISMATCH', 'SEQ_CONFLICT'].includes(r.code)) await load();
        return false;
      }
      await load();
      return true;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const openDrawer = (d: Drawer) => { setDrawerError(null); setDrawer(d); };
  const closeDrawer = () => { if (!busyRef.current && !uploadingRef.current) setDrawer(null); };

  const nameOf = (w: string | null | undefined) => (w ? names.get(w.toLowerCase()) ?? 'Unbekannt' : 'Unbekannt');

  const header = (right?: React.ReactNode) => (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <Pressable onPress={goBack} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Zurück">
        <ArrowLeftIcon size={24} color={colors.textPrimary} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Aufgabe</Text>
      <View style={styles.headerButton}>{right}</View>
    </View>
  );

  if (loadError && !detail) {
    return <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>{header()}<MeckyNotFound title={loadError} /></SafeAreaView>;
  }
  if (loaded && !detail) {
    return <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>{header()}<MeckyNotFound title="Aufgabe nicht gefunden" /></SafeAreaView>;
  }
  if (!detail) {
    return <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>{header()}<ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} /></SafeAreaView>;
  }

  const { task, proposal, applications, activity } = detail;
  const me = account?.address?.toLowerCase() ?? null;
  const isProposer = !!me && me === proposal.proposer;
  const isAssignee = !!me && !!task.assignee_wallet && me === task.assignee_wallet.toLowerCase();
  const openApps = applications.filter((a) => a.status === 'offen');
  const applied = !!me && openApps.some((a) => a.applicant_wallet.toLowerCase() === me);
  const proposerApplied = openApps.some((a) => a.applicant_wallet.toLowerCase() === proposal.proposer);
  const firstAppMs = openApps.reduce<number | null>((min, a) => {
    const t = new Date(a.created_at).getTime();
    return Number.isFinite(t) && (min === null || t < min) ? t : min;
  }, null);
  const inactive = firstAppMs !== null && Date.now() - firstAppMs > PROPOSER_INACTIVE_MS;
  const isOpen = task.status === 'offen';
  // UI gating mirrors the server rules (task-machine.ts) for convenience only; the server decides.
  const canApply = !!me && isOpen && !applied && proposal.stage !== 'abgelehnt';
  const canAssign = !!me && isOpen && openApps.length > 0
    && (proposerApplied ? hasAttesterNFT && !isProposer : isProposer || (hasAttesterNFT && inactive));
  const canStart = isAssignee && task.status === 'vergeben';
  const canProof = isAssignee && task.status === 'in_arbeit';
  const hasProof = activity.some((a) => a.kind === 'proof');
  const canReview = !!me && hasAttesterNFT && !isAssignee && task.status === 'eingereicht';
  const canCancel = !!me && (isProposer || hasAttesterNFT) && !FINAL_TASK_STATUSES.includes(task.status);

  const pickPhoto = async () => {
    if (uploadingRef.current || !account) return;
    if (proofItems.length + (proofTx.trim() ? 1 : 0) >= 5) { setDrawerError('Höchstens 5 Nachweise.'); return; }
    let res: ImagePicker.ImagePickerResult;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setDrawerError('Bitte erlaube den Zugriff auf deine Fotos.'); return; }
      res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    } catch {
      setDrawerError('Die Fotoauswahl konnte nicht geöffnet werden.');
      return;
    }
    if (res.canceled || !res.assets[0]) return;
    uploadingRef.current = true;
    setUploading(true);
    setDrawerError(null);
    try {
      const asset = res.assets[0];
      const url = await withTimeout(uploadMediaFile(asset.uri, account.address, 'image', 'vorhaben', asset.mimeType ?? undefined), UPLOAD_TIMEOUT_MS);
      if (!url) { setDrawerError('Foto konnte nicht hochgeladen werden.'); return; }
      setProofItems((items) => [...items, { type: 'image', url, label: asset.fileName ?? 'Foto' }]);
    } catch {
      setDrawerError('Foto konnte nicht hochgeladen werden.');
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  // The file picker is its own modal; close the drawer first so two modals never stack (iOS).
  const openFilePicker = () => {
    if (uploadingRef.current) return;
    if (proofItems.length + (proofTx.trim() ? 1 : 0) >= 5) { setDrawerError('Höchstens 5 Nachweise.'); return; }
    setDrawer(null);
    setTimeout(() => setPickerOpen(true), 350);
  };
  const closeFilePicker = () => {
    setPickerOpen(false);
    setTimeout(() => setDrawer('proof'), 350);
  };
  const onFilePicked = async (file: PickedFile) => {
    const mime = file.mime.toLowerCase();
    if (mime !== 'application/pdf' && !mime.startsWith('image/')) {
      setDrawerError('Als Nachweis gehen nur PDF-Dateien oder Bilder.');
      return;
    }
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setUploading(true);
    setDrawerError(null);
    try {
      const up = await withTimeout(
        uploadForumFileFromBase64(file.base64, mime, file.name, file.size, FORUM_ATTACHMENTS_BUCKET, 'vorhaben'), UPLOAD_TIMEOUT_MS);
      if (!up) { setDrawerError('Datei konnte nicht hochgeladen werden.'); return; }
      setProofItems((items) => [...items, { type: mime === 'application/pdf' ? 'pdf' : 'image', url: up.url, label: up.file_name }]);
    } catch {
      setDrawerError('Datei konnte nicht hochgeladen werden.');
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  const sendProof = async () => {
    const tx = proofTx.trim();
    if (tx && !TX_RE.test(tx)) { setDrawerError('Der Transaktions-Hash ist ungültig.'); return; }
    const attachments: TaskAttachment[] = [...proofItems.map((p) => ({ type: p.type, url: p.url })), ...(tx ? [{ type: 'tx' as const, hash: tx }] : [])];
    if (attachments.length < 1) { setDrawerError('Bitte hänge mindestens einen Nachweis an.'); return; }
    if (attachments.length > 5) { setDrawerError('Höchstens 5 Nachweise.'); return; }
    const ok = await run('task_proof', { body: proofText.trim(), attachments }, true);
    if (ok) { setProofText(''); setProofTx(''); setProofItems([]); setDrawer(null); }
  };

  const primary = (label: string, onPress: () => void, key: string) => (
    <Pressable key={key} disabled={busy} onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}>
      {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.primaryText, { color: colors.onPrimary }]}>{label}</Text>}
    </Pressable>
  );
  const secondary = (label: string, onPress: () => void, key: string, color?: string) => (
    <Pressable key={key} disabled={busy} onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: busy ? 0.6 : pressed ? 0.7 : 1 }]}>
      <Text style={[styles.secondaryText, { color: color ?? colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );

  const actions: React.ReactNode[] = [];
  if (canApply) actions.push(primary('Bewerben', () => openDrawer('apply'), 'apply'));
  if (applied && isOpen) actions.push(secondary('Bewerbung zurückziehen', () => run('task_withdraw', {}), 'withdraw'));
  if (canStart) actions.push(primary('Aufgabe starten', () => run('task_start', {}), 'start'));
  if (canProof) {
    actions.push(secondary('Fortschritt melden', () => openDrawer('proof'), 'proof'));
    actions.push(primary('Zur Abnahme einreichen', () => run('task_submit', {}), 'submit'));
  }
  if (canReview) {
    actions.push(primary('Abnehmen', () => openDrawer('approve'), 'approve'));
    actions.push(secondary('Nachbesserung anfordern', () => openDrawer('changes'), 'changes'));
  }

  const deadline = task.deadline ? `bis ${format(new Date(task.deadline), 'd. MMM', { locale: de })}` : null;

  const renderAttachment = (a: TaskAttachment, i: number) => {
    if (a.type === 'image' && a.url) {
      return (
        <Pressable key={i} onPress={() => Linking.openURL(a.url!)} accessibilityRole="imagebutton" accessibilityLabel="Bild öffnen">
          <Image source={{ uri: a.url }} style={[styles.thumb, { backgroundColor: colors.surfaceSecondary }]} />
        </Pressable>
      );
    }
    const label = a.type === 'pdf' ? 'PDF öffnen' : 'Transaktion ansehen';
    const url = a.type === 'pdf' ? a.url : a.hash ? `https://gnosisscan.io/tx/${a.hash}` : undefined;
    if (!url) return null;
    return (
      <Pressable key={i} onPress={() => Linking.openURL(url)} accessibilityRole="link"
        style={({ pressed }) => [styles.attachRow, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
        <Text style={[styles.attachText, { color: colors.primary }]}>{label}</Text>
      </Pressable>
    );
  };

  const renderActivity = (a: ActivityRow) => {
    const status = a.kind === 'status_change' || a.to_status
      ? a.from_status ? `Status: ${statusLabel(a.from_status)} → ${statusLabel(a.to_status)}` : `Status: ${statusLabel(a.to_status)}`
      : null;
    return (
      <View key={a.id} style={[styles.activity, { borderColor: colors.border }]}>
        <View style={styles.activityHead}>
          <Text style={[styles.activityName, { color: colors.textPrimary }]} numberOfLines={1}>
            {nameOf(a.actor_wallet)}{a.kind === 'proof' ? ' · Nachweis' : ''}
          </Text>
          <Text style={[styles.activityTime, { color: colors.textSecondary }]}>{formatRelativeTimestamp(a.created_at)}</Text>
        </View>
        {status && <Text style={[styles.activityStatus, { color: colors.textSecondary }]}>{status}</Text>}
        {!!a.body && <Text style={[styles.body, { color: colors.textPrimary }]}>{a.body}</Text>}
        {a.attachments.length > 0 && <View style={styles.attachList}>{a.attachments.map(renderAttachment)}</View>}
      </View>
    );
  };

  const input = (value: string, onChange: (s: string) => void, placeholder: string, multiline = true, maxLength = multiline ? 4000 : 66) => (
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textTertiary}
      multiline={multiline} maxLength={maxLength} autoCapitalize={multiline ? 'sentences' : 'none'} autoCorrect={multiline}
      style={[multiline ? styles.textArea : styles.textField, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]} />
  );

  const textDrawer = (
    which: 'apply' | 'changes' | 'cancel', title: string, value: string, onChange: (s: string) => void,
    placeholder: string, cta: string, required: boolean, submit: () => Promise<void>,
  ) => (
    <BottomDrawer visible={drawer === which} onClose={closeDrawer} keyboardAware>
      <View style={styles.drawer}>
        <Text style={[styles.drawerTitle, { color: colors.textPrimary }]}>{title}</Text>
        {input(value, onChange, placeholder, true, which === 'apply' ? 1000 : 4000)}
        {drawerError && <Text style={[styles.error, { color: colors.error }]}>{drawerError}</Text>}
        <Pressable disabled={busy || (required && !value.trim())} onPress={submit} accessibilityRole="button"
          style={({ pressed }) => [styles.primary, { backgroundColor: which === 'cancel' ? colors.error : colors.primary, opacity: busy || (required && !value.trim()) ? 0.5 : pressed ? 0.85 : 1 }]}>
          {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.primaryText, { color: colors.onPrimary }]}>{cta}</Text>}
        </Pressable>
      </View>
    </BottomDrawer>
  );

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {header(canCancel ? (
          <Pressable onPress={() => openDrawer('cancel')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Aufgabe abbrechen"
            style={styles.headerButton}>
            <Text style={[styles.more, { color: colors.textPrimary }]}>⋯</Text>
          </Pressable>
        ) : undefined)}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.push(`/proposal/${proposal.key}` as any)} accessibilityRole="link">
            <Text style={[styles.link, { color: colors.primary }]}>Zu Vorschlag #{proposal.number}</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{task.title}</Text>
          <View style={styles.metaRow}>
            <StatusChip label={TASK_STATUS_LABELS[task.status] ?? task.status} tone={taskTone(task.status)} />
            <Text style={[styles.reward, { color: colors.textPrimary }]}>{formatAmount(task.reward_amount, task.reward_asset)}</Text>
            {deadline && <Text style={[styles.meta, { color: colors.textSecondary }]}>{deadline}</Text>}
          </View>
          {task.assignee_wallet && (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>Zuständig: {nameOf(task.assignee_wallet)}</Text>
          )}

          {!!task.description && <Text style={[styles.body, { color: colors.textPrimary }]}>{task.description}</Text>}

          {task.acceptance_criteria.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Abnahmekriterien</Text>
              {task.acceptance_criteria.map((c) => (
                <View key={c.id} style={styles.bulletRow}>
                  <Text style={[styles.body, { color: colors.textSecondary }]}>•</Text>
                  <Text style={[styles.body, styles.flex, { color: colors.textPrimary }]}>{c.text}</Text>
                </View>
              ))}
            </View>
          )}

          {canAssign && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Bewerbungen</Text>
              {openApps.map((a) => (
                <View key={a.id} style={[styles.applicant, { borderColor: colors.border }]}>
                  <View style={styles.flex}>
                    <Text style={[styles.activityName, { color: colors.textPrimary }]}>{nameOf(a.applicant_wallet)}</Text>
                    {!!a.note && <Text style={[styles.meta, { color: colors.textSecondary }]}>{a.note}</Text>}
                  </View>
                  {a.applicant_wallet.toLowerCase() !== me && (
                    <Pressable disabled={busy} onPress={() => run('task_assign', { applicant: a.applicant_wallet.toLowerCase() })}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.primary, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}>
                      <Text style={[styles.smallButtonText, { color: colors.onPrimary }]}>Auswählen</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}

          {canProof && !hasProof && (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>Hänge vor dem Einreichen mindestens einen Nachweis an.</Text>
          )}
          {loadError && (
            <View style={[styles.banner, { backgroundColor: colors.errorBackground }]}>
              <Text style={[styles.meta, { color: colors.error }]}>{loadError} Angezeigt wird der letzte Stand.</Text>
            </View>
          )}
          {actionError && <Text style={[styles.error, { color: colors.error }]}>{actionError}</Text>}
          {actions.length > 0 && <View style={styles.actions}>{actions}</View>}
          {!account && noAccount && (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>Bitte melde dich an, um mitzumachen.</Text>
          )}

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Verlauf</Text>
            {activity.length === 0
              ? <Text style={[styles.meta, { color: colors.textSecondary }]}>Noch keine Einträge.</Text>
              : activity.map(renderActivity)}
          </View>
        </ScrollView>

        {account && (
          <View style={[styles.commentBar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
            <TextInput value={comment} onChangeText={setComment} placeholder="Kommentar schreiben…" placeholderTextColor={colors.textTertiary}
              multiline maxLength={4000}
              style={[styles.commentInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]} />
            <Pressable disabled={busy || !comment.trim()} accessibilityRole="button" accessibilityLabel="Kommentar senden"
              onPress={async () => { if (await run('task_comment', { body: comment.trim() })) setComment(''); }}
              style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.primary, opacity: busy || !comment.trim() ? 0.5 : pressed ? 0.85 : 1 }]}>
              <Text style={[styles.smallButtonText, { color: colors.onPrimary }]}>Senden</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>

      {textDrawer('apply', 'Bewerben', applyNote, setApplyNote, 'Warum passt du dazu?', 'Bewerbung senden', false, async () => {
        if (await run('task_apply', { note: applyNote.trim() }, true)) { setApplyNote(''); setDrawer(null); }
      })}
      {textDrawer('changes', 'Nachbesserung anfordern', changesText, setChangesText, 'Was fehlt noch?', 'Nachbesserung anfordern', true, async () => {
        if (await run('task_request_changes', { body: changesText.trim() }, true)) { setChangesText(''); setDrawer(null); }
      })}
      {textDrawer('cancel', 'Aufgabe abbrechen', cancelText, setCancelText, 'Warum wird die Aufgabe abgebrochen?', 'Aufgabe abbrechen', true, async () => {
        if (await run('task_cancel', { body: cancelText.trim() }, true)) { setCancelText(''); setDrawer(null); }
      })}

      <BottomDrawer visible={drawer === 'proof'} onClose={closeDrawer} keyboardAware>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.drawer}>
          <Text style={[styles.drawerTitle, { color: colors.textPrimary }]}>Fortschritt melden</Text>
          <Text style={[styles.drawerHint, { color: colors.textSecondary }]}>
            Nachweise (Fotos, Dateien, Transaktions-Hash) sind öffentlich einsehbar und werden im öffentlichen Protokoll verlinkt. Dein Text bleibt in der App.
          </Text>
          {input(proofText, setProofText, 'Was hast du erledigt?')}
          <View style={styles.attachButtons}>
            {secondary('Foto anhängen', pickPhoto, 'photo')}
            {secondary('Datei anhängen', openFilePicker, 'file')}
          </View>
          {uploading && <ActivityIndicator color={colors.primary} />}
          {proofItems.map((p, i) => (
            <View key={p.url} style={[styles.applicant, { borderColor: colors.border }]}>
              <Text style={[styles.meta, styles.flex, { color: colors.textPrimary }]} numberOfLines={1}>
                {p.type === 'pdf' ? 'PDF' : 'Bild'} · {p.label}
              </Text>
              <Pressable onPress={() => setProofItems((items) => items.filter((_, j) => j !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Entfernen">
                <Text style={[styles.meta, { color: colors.error }]}>Entfernen</Text>
              </Pressable>
            </View>
          ))}
          {input(proofTx, setProofTx, 'Transaktions-Hash (optional)', false)}
          {drawerError && <Text style={[styles.error, { color: colors.error }]}>{drawerError}</Text>}
          <Pressable disabled={busy || uploading} onPress={sendProof} accessibilityRole="button"
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: busy || uploading ? 0.5 : pressed ? 0.85 : 1 }]}>
            {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Nachweis senden</Text>}
          </Pressable>
        </ScrollView>
      </BottomDrawer>

      <FilePickerSheet visible={pickerOpen} onClose={closeFilePicker} onPicked={onFilePicked}
        onError={(m) => setDrawerError(m)} />

      <ConfirmationDrawer
        visible={drawer === 'approve'}
        title="Aufgabe abnehmen?"
        message={drawerError ?? 'Danach wird die Auszahlung freigegeben.'}
        variant="success"
        confirmText="Abnehmen"
        isLoading={busy}
        onConfirm={async () => { if (await run('task_approve', {}, true)) setDrawer(null); }}
        onCancel={closeDrawer}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  more: { fontFamily: fontFamily.semiBold, fontSize: 22, lineHeight: 24 },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  link: { fontFamily: fontFamily.medium, fontSize: 13 },
  title: { fontFamily: fontFamily.heading, fontSize: 22, lineHeight: 28 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  reward: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  meta: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21 },
  section: { gap: 8, marginTop: 6 },
  sectionTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  bulletRow: { flexDirection: 'row', gap: 8 },
  applicant: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  actions: { gap: 10 },
  primary: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  secondary: { height: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, flexGrow: 1 },
  secondaryText: { fontFamily: fontFamily.medium, fontSize: 15 },
  smallButton: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  smallButtonText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  error: { fontFamily: fontFamily.medium, fontSize: 14 },
  banner: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  activity: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  activityHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  activityName: { flexShrink: 1, fontFamily: fontFamily.semiBold, fontSize: 14 },
  activityTime: { fontFamily: fontFamily.regular, fontSize: 12 },
  activityStatus: { fontFamily: fontFamily.medium, fontSize: 13 },
  attachList: { gap: 8 },
  thumb: { width: 160, height: 120, borderRadius: 10 },
  attachRow: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  attachText: { fontFamily: fontFamily.medium, fontSize: 14 },
  commentBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  commentInput: { flex: 1, minHeight: 40, maxHeight: 120, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontFamily: fontFamily.regular, fontSize: 15 },
  drawer: { paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  drawerTitle: { fontFamily: fontFamily.semiBold, fontSize: 18 },
  drawerHint: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18, marginTop: -4 },
  textArea: { minHeight: 96, maxHeight: 200, borderWidth: 1, borderRadius: 12, padding: 12, fontFamily: fontFamily.regular, fontSize: 15, textAlignVertical: 'top' },
  textField: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontFamily: fontFamily.regular, fontSize: 14 },
  attachButtons: { flexDirection: 'row', gap: 10 },
});
