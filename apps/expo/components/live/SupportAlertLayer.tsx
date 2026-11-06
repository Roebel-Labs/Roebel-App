// In-app Unterstützen alert over the player. By Max's decision (2026-11-05) Unterstützen is NEVER part of
// the stream picture or the recording (dancers watch it later): app viewers see it only as this layer.
import React, { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { formatSupportAmount, type ChatMessage } from '@/lib/live';
import { F } from './tokens';

const SHOW_MS = 5200;
const MAX_QUEUE = 20;

export type SupportAlertHandle = { push: (m: ChatMessage) => void };

/** Without top / height the layer fills its parent (the stage's video box). */
type Props = { top?: number; height?: number };

/** Queue of support alerts, one at a time, centred over the video (touches pass through). */
const SupportAlertLayer = forwardRef<SupportAlertHandle, Props>(function SupportAlertLayer({ top, height }, ref) {
  const [queue, setQueue] = useState<ChatMessage[]>([]);
  const seen = useRef(new Set<string>());

  const push = useCallback((m: ChatMessage) => {
    if (m.kind !== 'support' || seen.current.has(m.id)) return;
    seen.current.add(m.id);
    setQueue((q) => (q.length >= MAX_QUEUE ? q : [...q, m]));
  }, []);
  useImperativeHandle(ref, () => ({ push }), [push]);

  const current = queue[0] ?? null;
  useEffect(() => {
    if (!current) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    const t = setTimeout(() => setQueue((q) => q.slice(1)), SHOW_MS);
    return () => clearTimeout(t);
  }, [current]);

  return (
    <View pointerEvents="none" style={[styles.layer, top != null && height != null ? { top, height } : styles.fill]}>
      {current ? (
        <Animated.View key={current.id} entering={FadeInDown.duration(320)} exiting={FadeOutUp.duration(260)} style={styles.card}>
          <View style={styles.heart}>
            <Ionicons name="heart" size={18} color="#1B1B1B" />
          </View>
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={1}>
              {current.display_name || 'Jemand'} unterstützt mit {formatSupportAmount(current.amount_cents)}
            </Text>
            {current.body ? <Text style={styles.message} numberOfLines={2}>{current.body}</Text> : null}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
});

export default SupportAlertLayer;

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  fill: { top: 0, bottom: 0 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, maxWidth: 420, paddingVertical: 12, paddingLeft: 12, paddingRight: 18,
    borderRadius: 18, backgroundColor: '#F2C14E',
  },
  heart: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.55)' },
  body: { flexShrink: 1, gap: 2 },
  title: { color: '#1B1B1B', fontSize: 15, fontFamily: F.bold },
  message: { color: '#1B1B1B', fontSize: 13, lineHeight: 18, fontFamily: F.medium, opacity: 0.85 },
});
