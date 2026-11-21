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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { AudioSession, registerGlobals } from '@livekit/react-native';
import { DisconnectReason, Room, RoomEvent, type Participant, type TextStreamReader } from 'livekit-client';
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
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    let alive = true;
    ensureLiveKitGlobals();
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

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

  const state: VoiceState = muted ? 'muted' : agentState;

  return (
    <View style={styles.flex}>
      <View style={styles.figure}>
        <VoiceFigure state={state} level={level} height={figureHeight} />
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
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 28, paddingTop: 12 },
  endBtn: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
});
