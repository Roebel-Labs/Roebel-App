// The guest's "on air" view: joins the LiveKit room the studio opened for this request, publishes
// front camera + microphone and shows the studio's return picture (if it publishes video).
//
// !! LiveKit-only module. Importing it evaluates @livekit/react-native (native modules), which throws
// on the 3.7.0 runtime. It must ONLY be loaded via the lazy require() in app/live/join/[slug].tsx,
// after hasLiveKitNative() returned true. Never import it statically from anywhere.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import LiveIcon from '@/components/live/LiveIcon';
import { AudioSession, registerGlobals, VideoTrack } from '@livekit/react-native';
import {
  LocalVideoTrack, Room, RoomEvent, Track,
  type Participant, type RemoteTrack, type RemoteTrackPublication, type RemoteParticipant, type TrackPublication,
} from 'livekit-client';
import { F, VIDEO as LIVE } from '../tokens';

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

let globalsRegistered = false;
/** registerGlobals() exactly once per process, only when a guest actually connects. */
function ensureLiveKitGlobals() {
  if (globalsRegistered) return;
  registerGlobals();
  globalsRegistered = true;
}

type TrackRef = { participant: Participant; publication: TrackPublication; source: Track.Source };

export type GuestStageProps = {
  url: string;
  token: string;
  topInset: number;
  bottomInset: number;
  /** "Auflegen" pressed: the screen sends guest_cancel; this component disconnects on unmount. */
  onHangUp: () => void;
  /** The room closed on its own (studio ended / network lost for good). */
  onDisconnected: () => void;
  onError: (message: string) => void;
};

function LiveDot() {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withSequence(
      withTiming(0.3, { duration: 650, easing: Easing.inOut(Easing.quad) }),
      withTiming(1, { duration: 650, easing: Easing.inOut(Easing.quad) }),
    ), -1);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.liveDot, style]} />;
}

export default function GuestStage({ url, token, topInset, bottomInset, onHangUp, onDisconnected, onError }: GuestStageProps) {
  const roomRef = useRef<Room | null>(null);
  const leavingRef = useRef(false);
  const cbRef = useRef({ onDisconnected, onError });
  cbRef.current = { onDisconnected, onError };

  const [connected, setConnected] = useState(false);
  const [localRef, setLocalRef] = useState<TrackRef | null>(null);
  const [remoteRef, setRemoteRef] = useState<TrackRef | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [front, setFront] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    ensureLiveKitGlobals();
    const room = new Room({ adaptiveStream: true, dynacast: true, videoCaptureDefaults: { facingMode: 'user' } });
    roomRef.current = room;

    const refreshLocal = () => {
      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      setLocalRef(pub?.track ? { participant: room.localParticipant, publication: pub, source: Track.Source.Camera } : null);
    };
    const refreshRemote = () => {
      for (const p of room.remoteParticipants.values()) {
        for (const pub of p.trackPublications.values()) {
          if (pub.kind === Track.Kind.Video && pub.track) {
            setRemoteRef({ participant: p, publication: pub, source: pub.source });
            return;
          }
        }
      }
      setRemoteRef(null);
    };

    room
      .on(RoomEvent.LocalTrackPublished, refreshLocal)
      .on(RoomEvent.LocalTrackUnpublished, refreshLocal)
      .on(RoomEvent.TrackSubscribed, (_t: RemoteTrack, _p: RemoteTrackPublication, _rp: RemoteParticipant) => refreshRemote())
      .on(RoomEvent.TrackUnsubscribed, refreshRemote)
      .on(RoomEvent.ParticipantDisconnected, refreshRemote)
      .on(RoomEvent.Disconnected, () => {
        if (!alive || leavingRef.current) return;
        cbRef.current.onDisconnected();
      });

    void (async () => {
      try {
        await AudioSession.startAudioSession();
        await room.connect(url, token);
        if (!alive) return;
        setConnected(true);
        await room.localParticipant.setMicrophoneEnabled(true);
        await room.localParticipant.setCameraEnabled(true, { facingMode: 'user' });
        if (!alive) return;
        refreshLocal();
        refreshRemote();
      } catch (e) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : '';
        cbRef.current.onError(/permission|NotAllowed/i.test(msg)
          ? 'Kamera oder Mikrofon sind nicht freigegeben. Bitte erlaube den Zugriff in den Einstellungen.'
          : 'Die Verbindung zum Studio hat nicht geklappt. Bitte versuche es noch einmal.');
      }
    })();

    return () => {
      alive = false;
      leavingRef.current = true;
      roomRef.current = null;
      void room.disconnect().catch(() => undefined);
      void Promise.resolve(AudioSession.stopAudioSession()).catch(() => undefined);
    };
  }, [url, token]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room || busy) return;
    setBusy(true);
    try {
      await room.localParticipant.setMicrophoneEnabled(!micOn);
      setMicOn(!micOn);
    } catch { /* keep the old state */ }
    setBusy(false);
  }, [micOn, busy]);

  const toggleCam = useCallback(async () => {
    const room = roomRef.current;
    if (!room || busy) return;
    setBusy(true);
    try {
      await room.localParticipant.setCameraEnabled(!camOn, { facingMode: front ? 'user' : 'environment' });
      setCamOn(!camOn);
    } catch { /* keep the old state */ }
    setBusy(false);
  }, [camOn, front, busy]);

  const flip = useCallback(async () => {
    const room = roomRef.current;
    if (!room || busy || !camOn) return;
    const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
    if (!(track instanceof LocalVideoTrack)) return;
    setBusy(true);
    try {
      await track.restartTrack({ facingMode: front ? 'environment' : 'user' });
      setFront(!front);
    } catch { /* camera stays as it was */ }
    setBusy(false);
  }, [front, camOn, busy]);

  const hangUp = useCallback(() => {
    leavingRef.current = true;
    onHangUp();
  }, [onHangUp]);

  return (
    <View style={styles.root}>
      {localRef && camOn ? (
        <VideoTrack trackRef={localRef as any} style={FILL} objectFit="cover" mirror={front} zOrder={0} />
      ) : (
        <View style={styles.camOff}>
          <LiveIcon name={camOn ? 'videocam-outline' : 'videocam-off-outline'} size={40} color={LIVE.textTertiary} />
          <Text style={styles.camOffText}>{camOn ? 'Kamera startet …' : 'Kamera aus'}</Text>
        </View>
      )}

      <View style={[styles.top, { top: topInset + 10 }]} pointerEvents="none">
        {connected ? (
          <View style={styles.livePill}>
            <LiveDot />
            <Text style={styles.livePillText}>DU BIST LIVE</Text>
          </View>
        ) : (
          <View style={styles.connectingPill}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.connectingText}>Verbinde mit dem Studio …</Text>
          </View>
        )}
      </View>

      {remoteRef ? (
        <View style={[styles.returnFeed, { top: topInset + 52 }]}>
          <VideoTrack trackRef={remoteRef as any} style={FILL} objectFit="cover" zOrder={1} />
          <Text style={styles.returnLabel}>Studio</Text>
        </View>
      ) : null}

      <View style={[styles.controls, { paddingBottom: Math.max(bottomInset, 16) + 8 }]}>
        <ControlButton icon={micOn ? 'mic' : 'mic-off'} label={micOn ? 'Mikro aus' : 'Mikro an'} active={!micOn} onPress={() => { void toggleMic(); }} />
        <ControlButton icon={camOn ? 'videocam' : 'videocam-off'} label={camOn ? 'Kamera aus' : 'Kamera an'} active={!camOn} onPress={() => { void toggleCam(); }} />
        <ControlButton icon="camera-reverse-outline" label="Kamera wechseln" disabled={!camOn} onPress={() => { void flip(); }} />
        <Pressable onPress={hangUp} style={({ pressed }) => [styles.hangUp, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel="Auflegen">
          <LiveIcon name="call" size={22} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          <Text style={styles.hangUpText}>Auflegen</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ControlButton({ icon, label, onPress, active, disabled }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; active?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [styles.ctrl, active && styles.ctrlActive, disabled && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <LiveIcon name={icon} size={22} color={active ? '#1B1B1B' : '#fff'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  camOff: { ...FILL, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: LIVE.bg },
  camOffText: { color: LIVE.textSecondary, fontSize: 14, fontFamily: F.medium },
  top: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: LIVE.red, paddingHorizontal: 12, height: 30, borderRadius: 15,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  livePillText: { color: '#fff', fontSize: 13, fontFamily: F.bold, letterSpacing: 1 },
  connectingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: LIVE.scrim, paddingHorizontal: 12, height: 30, borderRadius: 15,
  },
  connectingText: { color: '#fff', fontSize: 13, fontFamily: F.semiBold },
  returnFeed: {
    position: 'absolute', right: 12, width: 112, height: 63, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000',
    borderWidth: StyleSheet.hairlineWidth, borderColor: LIVE.borderStrong,
  },
  returnLabel: {
    position: 'absolute', left: 6, bottom: 4, color: '#fff', fontSize: 10, fontFamily: F.bold, letterSpacing: 0.6,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3,
  },
  controls: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14,
    paddingTop: 16, backgroundColor: 'rgba(0,0,0,0.35)',
  },
  ctrl: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  ctrlActive: { backgroundColor: '#fff' },
  hangUp: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 52, paddingHorizontal: 18, borderRadius: 26, backgroundColor: LIVE.red,
  },
  hangUpText: { color: '#fff', fontSize: 15, fontFamily: F.bold },
});
