// Shared visuals for "Sprachassistent testen" — NO LiveKit imports here, so the idle screen can use
// them on every runtime. Built from the chat kit (components/chat): Mecky's figure on his colour stage,
// grey status chip, chat bubbles, glass circle controls.
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { CharacterFigure } from '@/components/chat/CharacterFigure';
import { chatFont, chatType, useChatTokens } from '@/components/chat/tokens';

export type VoiceState = 'idle' | 'connecting' | 'initializing' | 'listening' | 'thinking' | 'speaking' | 'muted';

export const VOICE_STATE_LABEL: Record<VoiceState, string> = {
  idle: 'Bereit',
  connecting: 'Verbinde …',
  initializing: 'Mecky kommt dazu …',
  listening: 'Ich höre zu',
  thinking: 'Ich denke nach …',
  speaking: 'Mecky spricht',
  muted: 'Mikrofon aus',
};

/**
 * Mecky on his stage. Breathes slowly while waiting, bounces with the agent's voice level while
 * speaking (level 0..1 from LiveKit's speaker updates).
 */
export function VoiceFigure({ state, level = 0, height }: { state: VoiceState; level?: number; height: number }) {
  const breath = useSharedValue(1);
  const voice = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(breath);
    const [to, ms] = state === 'thinking' ? [1.025, 700] : state === 'listening' ? [1.015, 1600] : [1.008, 2200];
    breath.value = withRepeat(withSequence(
      withTiming(to, { duration: ms, easing: Easing.inOut(Easing.quad) }),
      withTiming(1, { duration: ms, easing: Easing.inOut(Easing.quad) }),
    ), -1);
  }, [state, breath]);

  useEffect(() => {
    voice.value = withSpring(state === 'speaking' ? Math.min(1, level) : 0, { damping: 12, stiffness: 180 });
  }, [state, level, voice]);

  const figureStyle = useAnimatedStyle(() => ({ transform: [{ scale: breath.value + voice.value * 0.05 }] }));
  const dim = state === 'connecting' || state === 'initializing';

  return (
    <Animated.View style={[{ opacity: dim ? 0.7 : 1 }, figureStyle]}>
      <CharacterFigure characterId={null} name="Mecky" height={height} />
    </Animated.View>
  );
}

/** Grey chip under the figure: status dot + label (dot pulses while Mecky speaks or thinks). */
export function VoiceStatusChip({ state }: { state: VoiceState }) {
  const t = useChatTokens();
  const pulse = useSharedValue(1);
  const live = state === 'speaking' || state === 'thinking' || state === 'connecting' || state === 'initializing';
  useEffect(() => {
    cancelAnimation(pulse);
    pulse.value = live
      ? withRepeat(withSequence(withTiming(0.3, { duration: 550 }), withTiming(1, { duration: 550 })), -1)
      : withTiming(1, { duration: 150 });
  }, [live, pulse]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const dotColor = state === 'muted' ? t.recordingRed : state === 'idle' ? t.textTertiary : t.online;
  return (
    <View style={[styles.chip, { backgroundColor: t.chipBackground }]}>
      <Animated.View style={[styles.dot, { backgroundColor: dotColor }, dotStyle]} />
      <Text style={[styles.chipText, { color: t.chipText }]}>{VOICE_STATE_LABEL[state]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, height: 32, borderRadius: 16,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { ...chatType.caption, fontFamily: chatFont.medium },
});
