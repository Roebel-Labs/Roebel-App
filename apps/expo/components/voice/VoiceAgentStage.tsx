// Voice conversation with the LiveKit voice agent (dev test, "Sprachassistent testen").
//
// !! LiveKit-only module, same rule as components/live/guest/GuestStage: importing it evaluates
// @livekit/react-native (native modules). Load it ONLY via the lazy require() in
// app/settings/dev-voice.tsx, after hasLiveKitNative() returned true.
//
// Plain livekit-client (no @livekit/components-react), visuals from VoiceFigure (chat kit), so the
// design can change via OTA freely. Agent protocol (LiveKit Agents 1.x):
//   - agent state:  participant attribute `lk.agent.state` = initializing | listening | thinking | speaking
//   - transcripts:  text streams on topic `lk.transcription`; every update of one utterance is a new
//                   stream with the same `lk.segment_id` attribute → replace that row.
//   - voice level:  RoomEvent.ActiveSpeakersChanged → participant.audioLevel (0..1)
//   - camera:       optional local camera track; the worker (agents/mecky-voice) shows Mecky the
//                   latest frame whenever the user starts speaking (back camera by default).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { AudioSession, registerGlobals, VideoTrack } from '@livekit/react-native';
import {
  DisconnectReason, LocalVideoTrack, Room, RoomEvent, Track,
  type Participant, type TextStreamReader, type TrackPublication,
} from 'livekit-client';
import { GlassCircleButton } from '@/components/chat/GlassCircleButton';
import { MessageBubble, BubbleText } from '@/components/chat/MessageBubble';
import { chatSize, useChatTokens } from '@/components/chat/tokens';
import { VoiceFigure, VoiceStatusChip, type VoiceState } from './VoiceFigure';

let globalsRegistered = false;
function ensureLiveKitGlobals() {
  if (globalsRegistered) return;
  registerGlobals();
  globalsRegistered = true;
}

type Message = { id: string; fromUser: boolean; text: string };
type TrackRef = { participant: Participant; publication: TrackPublication; source: Track.Source };

export type VoiceAgentStageProps = {
  url: string;
  token: string;
  figureHeight: number;
  bottomInset: number;
  onEnd: () => void;
  onError: (message: string) => void;
};

function isAgent(p: Participant): boolean {
  return p.attributes?.['lk.agent.state'] != null || /^agent-/.test(p.identity);
}

export default function VoiceAgentStage({ url, token, figureHeight, bottomInset, onEnd, onError }: VoiceAgentStageProps) {
  const t = useChatTokens();
  const roomRef = useRef<Room | null>(null);
  const cbRef = useRef({ onEnd, onError });
  cbRef.current = { onEnd, onError };

  const [agentState, setAgentState] = useState<Exclude<VoiceState, 'idle' | 'muted'>>('connecting');
  const [level, setLevel] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [muted, setMuted] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [front, setFront] = useState(false);
  const [camBusy, setCamBusy] = useState(false);
  const [camRef, setCamRef] = useState<TrackRef | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    let alive = true;
    ensureLiveKitGlobals();
    const room = new Room({ adaptiveStream: true, dynacast: true, videoCaptureDefaults: { facingMode: 'environment' } });
    roomRef.current = room;

    const refreshCam = () => {
      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      setCamRef(pub?.track && !pub.isMuted ? { participant: room.localParticipant, publication: pub, source: Track.Source.Camera } : null);
    };

    const refreshAgentState = () => {
      for (const p of room.remoteParticipants.values()) {
        if (!isAgent(p)) continue;
        const s = p.attributes?.['lk.agent.state'];
        setAgentState(s === 'listening' || s === 'thinking' || s === 'speaking' ? s : 'initializing');
        return;
      }
      setAgentState(room.state === 'connected' ? 'initializing' : 'connecting');
    };

    room.registerTextStreamHandler('lk.transcription', async (reader: TextStreamReader, info: { identity: string }) => {
      const id = reader.info.attributes?.['lk.segment_id'] ?? reader.info.id;
      const fromUser = info.identity === room.localParticipant.identity;
      let text = '';
      for await (const chunk of reader) {
        if (!alive) return;
        text += chunk;
        const next = text;
        setMessages((prev) => {
          const i = prev.findIndex((m) => m.id === id);
          if (i === -1) return [...prev, { id, fromUser, text: next }];
          const copy = prev.slice();
          copy[i] = { id, fromUser, text: next };
          return copy;
        });
      }
    });

    room
      .on(RoomEvent.ParticipantConnected, refreshAgentState)
      .on(RoomEvent.ParticipantDisconnected, refreshAgentState)
      .on(RoomEvent.ParticipantAttributesChanged, refreshAgentState)
      .on(RoomEvent.LocalTrackPublished, refreshCam)
      .on(RoomEvent.LocalTrackUnpublished, refreshCam)
      .on(RoomEvent.TrackMuted, refreshCam)
      .on(RoomEvent.TrackUnmuted, refreshCam)
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const agent = speakers.find(isAgent);
        setLevel(agent ? agent.audioLevel : 0);
      })
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        if (!alive) return;
        if (reason !== DisconnectReason.CLIENT_INITIATED) cbRef.current.onError('Die Verbindung ist abgebrochen.');
      });

    void (async () => {
      try {
        await AudioSession.startAudioSession();
        await room.connect(url, token);
        if (!alive) return;
        await room.localParticipant.setMicrophoneEnabled(true);
        refreshAgentState();
      } catch (e) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : '';
        cbRef.current.onError(/permission|NotAllowed/i.test(msg)
          ? 'Das Mikrofon ist nicht freigegeben. Bitte erlaube den Zugriff in den Einstellungen.'
          : 'Die Verbindung zum Sprachassistenten hat nicht geklappt.');
      }
    })();

    // No agent after 20 s → the worker is not running / not deployed.
    const watchdog = setTimeout(() => {
      if (!alive) return;
      if (![...room.remoteParticipants.values()].some(isAgent)) {
        cbRef.current.onError('Mecky ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.');
      }
    }, 20_000);

    return () => {
      alive = false;
      clearTimeout(watchdog);
      roomRef.current = null;
      room.unregisterTextStreamHandler('lk.transcription');
      void room.disconnect().catch(() => undefined);
      void Promise.resolve(AudioSession.stopAudioSession()).catch(() => undefined);
    };
  }, [url, token]);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(muted);
      setMuted(!muted);
    } catch { /* keep state */ }
  }, [muted]);

  const toggleCam = useCallback(async () => {
    const room = roomRef.current;
    if (!room || camBusy) return;
    setCamBusy(true);
    try {
      Haptics.selectionAsync().catch(() => {});
      await room.localParticipant.setCameraEnabled(!camOn, { facingMode: front ? 'user' : 'environment' });
      setCamOn(!camOn);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/permission|NotAllowed/i.test(msg)) cbRef.current.onError('Die Kamera ist nicht freigegeben. Bitte erlaube den Zugriff in den Einstellungen.');
    }
    setCamBusy(false);
  }, [camOn, front, camBusy]);

  const flipCam = useCallback(async () => {
    const room = roomRef.current;
    if (!room || camBusy || !camOn) return;
    const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
    if (!(track instanceof LocalVideoTrack)) return;
    setCamBusy(true);
    try {
      await track.restartTrack({ facingMode: front ? 'environment' : 'user' });
      setFront(!front);
    } catch { /* camera stays as it was */ }
    setCamBusy(false);
  }, [front, camOn, camBusy]);

  const state: VoiceState = muted ? 'muted' : agentState;
  const showCam = camOn && camRef != null;

  return (
    <View style={styles.flex}>
      <View style={styles.figure}>
        {showCam ? (
          <View style={[styles.camBox, { height: figureHeight, backgroundColor: '#000000' }]}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- livekit TrackReference shape */}
            <VideoTrack trackRef={camRef as any} style={styles.camFill} objectFit="cover" mirror={front} />
            <View style={styles.camFlip}>
              <GlassCircleButton size={40} accessibilityLabel="Kamera wechseln" onPress={flipCam}>
                <Feather name="refresh-cw" size={18} color={t.icon} />
              </GlassCircleButton>
            </View>
          </View>
        ) : (
          <VoiceFigure state={state} level={level} height={figureHeight} />
        )}
      </View>
      <VoiceStatusChip state={state} />

      <FlatList
        ref={listRef}
        style={styles.flex}
        contentContainerStyle={styles.list}
        data={messages}
        keyExtractor={(m) => m.id}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <MessageBubble role={item.fromUser ? 'user' : 'bot'}>
            <BubbleText role={item.fromUser ? 'user' : 'bot'}>{item.text}</BubbleText>
          </MessageBubble>
        )}
      />

      <View style={[styles.controls, { paddingBottom: bottomInset + 12 }]}>
        <GlassCircleButton
          size={60}
          accessibilityLabel={muted ? 'Mikrofon einschalten' : 'Mikrofon ausschalten'}
          onPress={toggleMute}
        >
          <Feather name={muted ? 'mic-off' : 'mic'} size={24} color={muted ? t.recordingRed : t.icon} />
        </GlassCircleButton>
        <GlassCircleButton
          size={60}
          accessibilityLabel={camOn ? 'Kamera ausschalten' : 'Kamera einschalten – Mecky sieht mit'}
          onPress={toggleCam}
        >
          <Feather name={camOn ? 'video' : 'video-off'} size={24} color={t.icon} />
        </GlassCircleButton>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Gespräch beenden"
          hitSlop={6}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            cbRef.current.onEnd();
          }}
          style={({ pressed }) => [styles.endBtn, { backgroundColor: t.recordingRed, opacity: pressed ? 0.85 : 1 }]}
        >
          <Feather name="phone-off" size={24} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  figure: { paddingHorizontal: chatSize.screenPadH, paddingTop: 8, paddingBottom: 14 },
  list: { paddingHorizontal: chatSize.screenPadH, paddingTop: 16, paddingBottom: 8, gap: 8 },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 24, paddingTop: 12 },
  camBox: { borderRadius: 24, overflow: 'hidden' },
  camFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  camFlip: { position: 'absolute', top: 12, right: 12 },
  endBtn: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
});
