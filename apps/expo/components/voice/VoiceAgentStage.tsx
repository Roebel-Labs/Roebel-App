// Voice conversation with the LiveKit voice agent (dev test, "Sprachassistent testen").
//
// !! LiveKit-only module, same rule as components/live/guest/GuestStage: importing it evaluates
// @livekit/react-native (native modules). Load it ONLY via the lazy require() in
// app/settings/dev-voice.tsx, after hasLiveKitNative() returned true.
//
// Plain livekit-client (no @livekit/components-react) so the design can change via OTA freely.
// Agent protocol (LiveKit Agents 1.x):
//   - agent state:  participant attribute `lk.agent.state` = initializing | listening | thinking | speaking
//   - transcripts:  text streams on topic `lk.transcription`; every update of one utterance is a new
//                   stream with the same `lk.segment_id` attribute → replace that row.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, cancelAnimation } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AudioSession, registerGlobals } from '@livekit/react-native';
import { DisconnectReason, Room, RoomEvent, type Participant, type TextStreamReader } from 'livekit-client';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

let globalsRegistered = false;
function ensureLiveKitGlobals() {
  if (globalsRegistered) return;
  registerGlobals();
  globalsRegistered = true;
}

export type AgentState = 'connecting' | 'initializing' | 'listening' | 'thinking' | 'speaking';
type Message = { id: string; fromUser: boolean; text: string };

export type VoiceAgentStageProps = {
  url: string;
  token: string;
  onEnd: () => void;
  onError: (message: string) => void;
};

const STATE_LABEL: Record<AgentState, string> = {
  connecting: 'Verbinde …',
  initializing: 'Mecky kommt dazu …',
  listening: 'Ich höre zu',
  thinking: 'Ich denke nach …',
  speaking: 'Mecky spricht',
};

function isAgent(p: Participant): boolean {
  return p.attributes?.['lk.agent.state'] != null || /^agent-/.test(p.identity);
}

function Orb({ state, color }: { state: AgentState; color: string }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(scale);
    const [to, ms] = state === 'speaking' ? [1.18, 380] : state === 'thinking' ? [1.06, 900] : state === 'listening' ? [1.04, 1400] : [1.02, 1800];
    scale.value = withRepeat(withSequence(
      withTiming(to, { duration: ms, easing: Easing.inOut(Easing.quad) }),
      withTiming(1, { duration: ms, easing: Easing.inOut(Easing.quad) }),
    ), -1);
  }, [state, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const dim = state === 'connecting' || state === 'initializing';
  return (
    <View style={styles.orbWrap}>
      <Animated.View style={[styles.orbHalo, { backgroundColor: color, opacity: dim ? 0.08 : 0.16 }, style]} />
      <Animated.View style={[styles.orb, { backgroundColor: color, opacity: dim ? 0.5 : 1 }, style]} />
    </View>
  );
}

export default function VoiceAgentStage({ url, token, onEnd, onError }: VoiceAgentStageProps) {
  const { colors } = useTheme();
  const roomRef = useRef<Room | null>(null);
  const cbRef = useRef({ onEnd, onError });
  cbRef.current = { onEnd, onError };

  const [state, setState] = useState<AgentState>('connecting');
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
        if (s === 'initializing' || s === 'listening' || s === 'thinking' || s === 'speaking') { setState(s); return; }
        setState('initializing');
        return;
      }
      setState(room.state === 'connected' ? 'initializing' : 'connecting');
    };

    room.registerTextStreamHandler('lk.transcription', async (reader: TextStreamReader, info: { identity: string }) => {
      const id = reader.info.attributes?.['lk.segment_id'] ?? reader.info.id;
      const fromUser = info.identity === room.localParticipant.identity;
      let text = '';
      for await (const chunk of reader) {
        if (!alive) return;
        text += chunk;
        const t = text;
        setMessages((prev) => {
          const i = prev.findIndex((m) => m.id === id);
          if (i === -1) return [...prev, { id, fromUser, text: t }];
          const next = prev.slice();
          next[i] = { id, fromUser, text: t };
          return next;
        });
      }
    });

    room
      .on(RoomEvent.ParticipantConnected, refreshAgentState)
      .on(RoomEvent.ParticipantDisconnected, refreshAgentState)
      .on(RoomEvent.ParticipantAttributesChanged, refreshAgentState)
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
      const hasAgent = [...room.remoteParticipants.values()].some(isAgent);
      if (!hasAgent) cbRef.current.onError('Der Sprachassistent ist gerade nicht erreichbar.');
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

  return (
    <View style={styles.flex}>
      <View style={styles.orbArea}>
        <Orb state={state} color={colors.primary} />
        <View style={styles.stateRow}>
          {state === 'connecting' && <ActivityIndicator size="small" color={colors.textSecondary} />}
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>
            {muted ? 'Mikrofon aus' : STATE_LABEL[state]}
          </Text>
        </View>
      </View>

      <FlatList
        ref={listRef}
        style={styles.flex}
        contentContainerStyle={styles.list}
        data={messages}
        keyExtractor={(m) => m.id}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.fromUser
                ? { alignSelf: 'flex-end', backgroundColor: colors.primary }
                : { alignSelf: 'flex-start', backgroundColor: colors.surface },
            ]}
          >
            <Text style={[styles.bubbleText, { color: item.fromUser ? '#ffffff' : colors.textPrimary }]}>{item.text}</Text>
          </View>
        )}
      />

      <View style={styles.controls}>
        <Pressable
          onPress={toggleMute}
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Mikrofon einschalten' : 'Mikrofon ausschalten'}
          style={[styles.roundBtn, { backgroundColor: colors.surface }]}
        >
          <Ionicons name={muted ? 'mic-off' : 'mic'} size={26} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={() => cbRef.current.onEnd()}
          accessibilityRole="button"
          accessibilityLabel="Gespräch beenden"
          style={[styles.roundBtn, { backgroundColor: '#E5484D' }]}
        >
          <Ionicons name="call" size={26} color="#ffffff" style={{ transform: [{ rotate: '135deg' }] }} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  orbArea: { alignItems: 'center', paddingTop: 32, paddingBottom: 16 },
  orbWrap: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center' },
  orbHalo: { position: 'absolute', width: 180, height: 180, borderRadius: 90 },
  orb: { width: 112, height: 112, borderRadius: 56 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, minHeight: 22 },
  stateText: { fontFamily: fontFamily.medium, fontSize: 15 },
  list: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 28, paddingVertical: 20 },
  roundBtn: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
});
