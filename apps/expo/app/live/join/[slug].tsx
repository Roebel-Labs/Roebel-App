// "Live dazuschalten": a viewer asks to join the livestream from their phone (camera + mic).
// Flow: explain → guest_request → doorbell (poll guest_status every 2 s) → accepted: join the LiveKit room
// → "DU BIST LIVE" → Auflegen (guest_cancel). Spec: docs/superpowers/specs/2026-11-05-live-room-design.md, Part 2.
//
// 3.7.0 SAFETY: this route file has NO LiveKit import. expo-router evaluates route modules lazily in
// production (React Navigation `getComponent`), but in development it evaluates every route at startup
// (validateRouteTreeExports), and a deep link can reach this screen on any runtime. So all LiveKit code
// lives in components/live/guest/GuestStage and is loaded with require() only after hasLiveKitNative().
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import LiveIcon from '@/components/live/LiveIcon';
import { useGoBack } from '@/hooks/useGoBack';
import {
  GUEST_NOTE_MAX, fetchShow, liveActAs, liveErrorText, type GuestRequest, type GuestStatus, type LiveShow,
} from '@/lib/live';
import { hasLiveKitNative } from '@/lib/live-guest-support';
import Doorbell from '@/components/live/guest/Doorbell';
import GuestCompanion from '@/components/live/guest/GuestCompanion';
import LoginDrawer from '@/components/LoginDrawer';
import { useLivePlayerHost } from '@/components/live/player/LivePlayerProvider';
import { F, liveStyles, useLivePalette, type LivePalette } from '@/components/live/tokens';
// Type-only: erased at compile time, does not load the module.
import type { GuestStageProps } from '@/components/live/guest/GuestStage';

// ─── Lazy LiveKit load (see header) ───
type GuestStageComponent = React.ComponentType<GuestStageProps>;
let guestStage: GuestStageComponent | null = null;
function loadGuestStage(): GuestStageComponent | null {
  if (!hasLiveKitNative()) return null;
  if (guestStage) return guestStage;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../../components/live/guest/GuestStage');
    guestStage = (mod?.default ?? null) as GuestStageComponent | null;
  } catch {
    guestStage = null;
  }
  return guestStage;
}

// ─── Defensive expo-keep-awake load (same pattern as the live room) ───
type KeepAwakeFn = (tag?: string) => Promise<void> | void;
let activateKeepAwakeAsync: KeepAwakeFn = async () => {};
let deactivateKeepAwake: KeepAwakeFn = async () => {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ka = require('expo-keep-awake');
  if (ka?.activateKeepAwakeAsync) activateKeepAwakeAsync = ka.activateKeepAwakeAsync as KeepAwakeFn;
  if (ka?.deactivateKeepAwake) deactivateKeepAwake = ka.deactivateKeepAwake as KeepAwakeFn;
} catch { /* screen may sleep */ }
const KEEP_AWAKE_TAG = 'roebel-live-guest';

const POLL_MS = 2000;
const POLL_TIMEOUT_MS = 8000;

type Phase = 'intro' | 'requesting' | 'waiting' | 'live' | 'declined' | 'ended' | 'error';

export default function LiveGuestJoinScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const L = useLivePalette();
  const styles = liveStyles(makeStyles, L);
  const barStyle = L.isDark ? 'light-content' : 'dark-content';
  const account = useActiveAccount();
  const signerRef = useRef(account);
  signerRef.current = account;

  const [supported] = useState(() => hasLiveKitNative());
  const [show, setShow] = useState<LiveShow | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('intro');
  const [note, setNote] = useState('');
  const [loginOpen, setLoginOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [conn, setConn] = useState<{ url: string; token: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();
  const [permDenied, setPermDenied] = useState(false);

  // Refs for cleanup paths (unmount / callbacks) that must not capture stale state.
  const openRequestRef = useRef<{ showId: string; requestId: string } | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // ─── Load the show ───
  useEffect(() => {
    let alive = true;
    if (!slug) { setLoading(false); return; }
    void fetchShow(String(slug)).then((r) => {
      if (!alive) return;
      setShow(r?.show ?? null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [slug]);

  const cancelRequest = useCallback(async () => {
    const open = openRequestRef.current;
    const signer = signerRef.current;
    openRequestRef.current = null;
    if (!open || !signer) return;
    await liveActAs(signer, open.showId, { action: 'guest_cancel', show_id: open.showId, request_id: open.requestId }, POLL_TIMEOUT_MS);
  }, []);

  // Leaving the screen with an open request (swipe back, app nav) withdraws it.
  useEffect(() => () => { void cancelRequest(); }, [cancelRequest]);

  // ─── While on air as a guest: silence the stream playing in the room behind this screen, or its sound
  // goes into the guest's microphone and back to the studio (echo / feedback loop). Restored on hang-up. ───
  const playerHost = useLivePlayerHost();
  useEffect(() => {
    if (phase !== 'live') return;
    let p: ReturnType<typeof playerHost.acquire> | null = null;
    try { p = playerHost.acquire(); p.muted = true; p.pause(); } catch { /* no shared player yet */ }
    return () => {
      if (!p) return;
      try { p.muted = false; p.play(); } catch { /* released meanwhile */ }
    };
  }, [phase, playerHost]);

  // ─── Keep the screen awake while waiting / live ───
  const awake = phase === 'waiting' || phase === 'live';
  useEffect(() => {
    if (!awake) return;
    void Promise.resolve(activateKeepAwakeAsync(KEEP_AWAKE_TAG)).catch(() => undefined);
    return () => { void Promise.resolve(deactivateKeepAwake(KEEP_AWAKE_TAG)).catch(() => undefined); };
  }, [awake]);

  // ─── Poll guest_status every 2 s while waiting or live (studio may end the call) ───
  const showId = show?.id ?? null;
  const polling = !!requestId && !!showId && (phase === 'waiting' || phase === 'live');
  useEffect(() => {
    if (!polling || !requestId || !showId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const signer = signerRef.current;
      if (!signer) return;
      const r = await liveActAs<GuestStatus>(
        signer, showId, { action: 'guest_status', show_id: showId, request_id: requestId }, POLL_TIMEOUT_MS,
      );
      if (!alive) return;
      if (r.ok && r.data) {
        const st = r.data.status;
        const current = phaseRef.current;
        if (st === 'accepted' && current === 'waiting' && r.data.token && r.data.livekit_url) {
          setConn({ url: r.data.livekit_url, token: r.data.token });
          setPhase('live');
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        } else if (st === 'declined') {
          openRequestRef.current = null;
          setRequestId(null);
          setPhase('declined');
          return;
        } else if (st === 'ended' || st === 'cancelled') {
          openRequestRef.current = null;
          setRequestId(null);
          setConn(null);
          setPhase(current === 'live' ? 'ended' : 'intro');
          return;
        }
      }
      timer = setTimeout(() => { void tick(); }, POLL_MS);
    };
    timer = setTimeout(() => { void tick(); }, phase === 'waiting' ? 0 : POLL_MS);
    return () => { alive = false; if (timer) clearTimeout(timer); };
    // phase is read via phaseRef inside the loop; restart only when polling turns on/off or the request changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling, requestId, showId]);

  // "Danke fürs Mitmachen!" → back to the live room after a moment.
  useEffect(() => {
    if (phase !== 'ended') return;
    const t = setTimeout(goBack, 4000);
    return () => clearTimeout(t);
  }, [phase, goBack]);

  // ─── Actions ───
  const ensurePermissions = useCallback(async (): Promise<boolean> => {
    let cam = camPerm?.granted ?? false;
    let mic = micPerm?.granted ?? false;
    try {
      if (!cam) cam = (await requestCamPerm()).granted;
      if (!mic) mic = (await requestMicPerm()).granted;
    } catch {
      // No expo-camera permission API: let WebRTC prompt when it opens the devices.
      return true;
    }
    setPermDenied(!(cam && mic));
    return cam && mic;
  }, [camPerm?.granted, micPerm?.granted, requestCamPerm, requestMicPerm]);

  const request = useCallback(async () => {
    const signer = signerRef.current;
    const s = show;
    if (!s || phase === 'requesting') return;
    if (!signer) { setLoginOpen(true); return; }
    setError(null);
    if (!(await ensurePermissions())) return;
    setPhase('requesting');
    const trimmed = note.replace(/\s+/g, ' ').trim().slice(0, GUEST_NOTE_MAX);
    const r = await liveActAs<{ request: GuestRequest }>(signer, s.id, {
      action: 'guest_request', show_id: s.id, ...(trimmed ? { note: trimmed } : {}),
    });
    const req = r.ok ? r.data?.request : null;
    if (!r.ok || !req?.id) {
      setPhase('intro');
      setError(r.ok ? 'Die Anfrage hat nicht geklappt. Bitte versuche es erneut.' : liveErrorText(r.code, r.message));
      return;
    }
    openRequestRef.current = { showId: s.id, requestId: req.id };
    setRequestId(req.id);
    setPhase('waiting');
    void Haptics.selectionAsync().catch(() => undefined);
  }, [show, phase, note, ensurePermissions, router]);

  const cancelWaiting = useCallback(async () => {
    setCancelling(true);
    await cancelRequest();
    setCancelling(false);
    setRequestId(null);
    setPhase('intro');
  }, [cancelRequest]);

  const hangUp = useCallback(() => {
    void cancelRequest();
    setRequestId(null);
    setConn(null);
    setPhase('ended');
  }, [cancelRequest]);

  const onStageDisconnected = useCallback(() => {
    void cancelRequest();
    setRequestId(null);
    setConn(null);
    setPhase('ended');
  }, [cancelRequest]);

  const onStageError = useCallback((message: string) => {
    void cancelRequest();
    setRequestId(null);
    setConn(null);
    setError(message);
    setPhase('error');
  }, [cancelRequest]);

  // ─── Render: live ───
  if (phase === 'live' && conn) {
    const Stage = loadGuestStage();
    if (Stage) {
      return (
        <View style={[styles.root, { backgroundColor: '#000' }]}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          <Stage
            url={conn.url}
            token={conn.token}
            topInset={insets.top}
            bottomInset={insets.bottom}
            onHangUp={hangUp}
            onDisconnected={onStageDisconnected}
            onError={onStageError}
            overlay={show ? (
              <GuestCompanion showId={show.id} hlsUrl={show.hls_url} topInset={insets.top} bottomInset={insets.bottom} />
            ) : null}
          />
        </View>
      );
    }
  }

  // ─── Render: everything else ───
  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={goBack} hitSlop={10} style={styles.roundBtn} accessibilityRole="button" accessibilityLabel="Zurück">
        <LiveIcon name="chevron-down" size={20} color={L.text} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>Live dazuschalten</Text>
      <View style={styles.roundBtnSpacer} />
    </View>
  );

  const message = (icon: React.ComponentProps<typeof Ionicons>['name'], title: string, sub: string, cta?: { label: string; onPress: () => void }) => (
    <View style={styles.root}>
      <StatusBar barStyle={barStyle} backgroundColor={L.bg} />
      {header}
      <Animated.View entering={FadeIn.duration(220)} style={styles.center}>
        <LiveIcon name={icon} size={40} color={L.textSecondary} />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{sub}</Text>
        <Pressable onPress={cta?.onPress ?? goBack} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>{cta?.label ?? 'Zurück zum Livestream'}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );

  if (!supported) {
    return message('cloud-download-outline', 'Bitte App aktualisieren',
      'Zum Dazuschalten brauchst du die neueste Version der Röbel App aus dem App Store bzw. Google Play.');
  }
  if (loading) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.center}><ActivityIndicator color={L.text} /></View>
      </View>
    );
  }
  if (!show) {
    return message('videocam-off-outline', 'Livestream nicht gefunden', 'Vielleicht ist die Übertragung schon vorbei.');
  }
  if (!account) {
    return (
      <>
        {message('person-circle-outline', 'Bitte anmelden', 'Zum Dazuschalten musst du angemeldet sein.',
          { label: 'Anmelden', onPress: () => setLoginOpen(true) })}
        <LoginDrawer visible={loginOpen} onClose={() => setLoginOpen(false)} />
      </>
    );
  }
  if (phase === 'declined') {
    return message('hand-left-outline', 'Diesmal hat es nicht gepasst',
      'Das Studio kann dich gerade nicht dazuschalten. Danke fürs Anfragen – vielleicht klappt es später!');
  }
  if (phase === 'ended') {
    return message('sparkles-outline', 'Danke fürs Mitmachen!', 'Du bist nicht mehr live. Wir bringen dich zurück zum Livestream.');
  }
  if (phase === 'error') {
    return message('alert-circle-outline', 'Das hat nicht geklappt', error ?? 'Bitte versuche es noch einmal.',
      { label: 'Erneut versuchen', onPress: () => { setError(null); setPhase('intro'); } });
  }
  const open = show.status === 'live' && show.guests_enabled !== false;
  if (!open && phase === 'intro') {
    return message('videocam-off-outline', 'Gerade nicht möglich', 'Dazuschalten ist nur während der Live-Übertragung möglich.');
  }

  if (phase === 'waiting') {
    return (
      <View style={styles.root}>
        <StatusBar barStyle={barStyle} backgroundColor={L.bg} />
        {header}
        <Animated.View entering={FadeIn.duration(260)} style={styles.center}>
          <Doorbell />
          <Text style={styles.title}>Warte auf das Studio …</Text>
          <Text style={styles.sub}>
            Deine Anfrage ist angekommen. Sobald das Studio dich annimmt, bist du live. Lass die App dafür geöffnet.
          </Text>
          <Pressable
            onPress={() => { void cancelWaiting(); }}
            disabled={cancelling}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed, cancelling && { opacity: 0.6 }]}
            accessibilityRole="button"
          >
            {cancelling ? <ActivityIndicator size="small" color={L.text} /> : <Text style={styles.secondaryText}>Anfrage zurückziehen</Text>}
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  // intro / requesting
  const canPreview = !!camPerm?.granted;
  return (
    <View style={styles.root}>
      <StatusBar barStyle={barStyle} backgroundColor={L.bg} />
      {header}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.preview}>
            {canPreview ? (
              <CameraView style={StyleSheet.absoluteFill} facing="front" />
            ) : (
              <Pressable onPress={() => { void ensurePermissions(); }} style={styles.previewEmpty} accessibilityRole="button">
                <LiveIcon name="videocam-outline" size={34} color={L.textTertiary} />
                <Text style={styles.previewHint}>Kamera-Vorschau anzeigen</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.kicker}>{show.title}</Text>
          <Text style={styles.lead}>
            Du wirst live in die Übertragung geschaltet, sobald das Studio dich annimmt. Kamera und Mikrofon werden übertragen.
          </Text>

          <Text style={styles.label}>Kurze Notiz fürs Studio (optional)</Text>
          <TextInput
            value={note}
            onChangeText={(t) => setNote(t.slice(0, GUEST_NOTE_MAX))}
            placeholder="z. B. Ich bin Trainerin der Wirbelwinde"
            placeholderTextColor={L.textTertiary}
            style={styles.note}
            maxLength={GUEST_NOTE_MAX}
            multiline
          />
          <Text style={styles.counter}>{`${note.length}/${GUEST_NOTE_MAX}`}</Text>

          {permDenied ? (
            <Pressable onPress={() => { void Linking.openSettings(); }} style={styles.errorBox}>
              <LiveIcon name="lock-closed-outline" size={15} color={L.errorText} />
              <Text style={styles.errorText}>
                Kamera und Mikrofon sind nicht freigegeben. Tippe hier, um die Einstellungen zu öffnen.
              </Text>
            </Pressable>
          ) : null}
          {error ? (
            <View style={styles.errorBox}>
              <LiveIcon name="information-circle-outline" size={15} color={L.errorText} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => { void request(); }}
            disabled={phase === 'requesting'}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, phase === 'requesting' && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            {phase === 'requesting'
              ? <ActivityIndicator color="#fff" />
              : (<><LiveIcon name="hand-right-outline" size={18} color="#fff" /><Text style={styles.primaryText}>Anfragen</Text></>)}
          </Pressable>
          <Text style={styles.fine}>Du kannst jederzeit auflegen. Das Studio entscheidet, wer live geht.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (L: LivePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },
  flex: { flex: 1 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingBottom: 8 },
  headerTitle: { flex: 1, color: L.text, fontSize: 16, fontFamily: F.semiBold, textAlign: 'center' },
  roundBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: L.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  roundBtnSpacer: { width: 34 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  title: { color: L.text, fontSize: 20, fontFamily: F.heading, textAlign: 'center', marginTop: 8 },
  sub: { color: L.textSecondary, fontSize: 14, fontFamily: F.regular, textAlign: 'center', lineHeight: 20 },
  scroll: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  preview: { aspectRatio: 3 / 4, maxHeight: 360, alignSelf: 'center', width: '72%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
  previewEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  previewHint: { color: L.textSecondary, fontSize: 13, fontFamily: F.medium },
  kicker: { color: L.accent, fontSize: 12, fontFamily: F.bold, letterSpacing: 1.2, marginTop: 10, textTransform: 'uppercase' },
  lead: { color: L.text, fontSize: 16, fontFamily: F.medium, lineHeight: 23 },
  label: { color: L.textSecondary, fontSize: 13, fontFamily: F.semiBold, marginTop: 6 },
  note: {
    minHeight: 64, borderRadius: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, color: L.text, fontSize: 15,
    fontFamily: F.regular, backgroundColor: L.surfaceRaised, textAlignVertical: 'top',
  },
  counter: { alignSelf: 'flex-end', color: L.textTertiary, fontSize: 11, fontFamily: F.medium, marginTop: -4 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    backgroundColor: L.errorSoft,
  },
  errorText: { flex: 1, color: L.errorText, fontSize: 13, fontFamily: F.medium },
  primaryBtn: {
    marginTop: 6, height: 50, borderRadius: 25, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: L.navyBright,
  },
  primaryText: { color: '#fff', fontSize: 16, fontFamily: F.bold },
  secondaryBtn: {
    marginTop: 14, minWidth: 200, height: 46, paddingHorizontal: 22, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
    backgroundColor: L.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: L.borderStrong,
  },
  secondaryText: { color: L.text, fontSize: 15, fontFamily: F.semiBold },
  fine: { color: L.textTertiary, fontSize: 12, fontFamily: F.regular, textAlign: 'center', marginTop: 4 },
});
