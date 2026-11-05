import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { RundownItem, VoteResults } from '@/lib/live';
import LiveSheet from './LiveSheet';
import { F, liveStyles, useLivePalette, type LivePalette } from './tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  items: RundownItem[];
  results: VoteResults | null;
  myVote: string | null;
  busyItemId: string | null;
  loggedIn: boolean;
  error: string | null;
  onVote: (item: RundownItem) => void;
  onLogin: () => void;
};

function Bar({ share, mine }: { share: number; mine: boolean }) {
  const L = useLivePalette();
  const styles = liveStyles(makeStyles, L);
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(share, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [share, w]);
  const style = useAnimatedStyle(() => ({ width: `${Math.round(w.value * 100)}%` }));
  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, mine && styles.barFillMine, style]} />
    </View>
  );
}

export default function VoteSheet({ visible, onClose, items, results, myVote, busyItemId, loggedIn, error, onVote, onLogin }: Props) {
  const L = useLivePalette();
  const styles = liveStyles(makeStyles, L);
  const total = results?.total ?? 0;
  const votesFor = (id: string) => results?.items.find((r) => r.item_id === id)?.votes ?? 0;
  return (
    <LiveSheet
      visible={visible}
      onClose={onClose}
      title="Publikumsliebling"
      subtitle="Wer hat dich heute am meisten begeistert? Eine Stimme pro Person, du kannst sie jederzeit ändern. Ein Meinungsbild, keine Wertung der Jury."
      maxHeight="88%"
    >
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {!loggedIn ? (
          <Pressable onPress={onLogin} style={({ pressed }) => [styles.login, pressed && { opacity: 0.85 }]} accessibilityRole="button">
            <Ionicons name="log-in-outline" size={17} color="#fff" />
            <Text style={styles.loginText}>Anmelden zum Abstimmen</Text>
          </Pressable>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {items.length === 0 ? <Text style={styles.empty}>Sobald die ersten Paare getanzt haben, kannst du hier abstimmen.</Text> : null}
        {items.map((item) => {
          const mine = myVote === item.id;
          const votes = votesFor(item.id);
          const share = total > 0 ? votes / total : 0;
          return (
            <Pressable
              key={item.id}
              onPress={() => onVote(item)}
              disabled={!loggedIn || busyItemId != null}
              style={({ pressed }) => [styles.item, mine && styles.itemMine, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityState={{ selected: mine }}
            >
              <View style={styles.itemHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                  {item.subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{item.subtitle}</Text> : null}
                </View>
                {busyItemId === item.id ? (
                  <ActivityIndicator size="small" color={L.text} />
                ) : mine ? (
                  <View style={styles.mineTag}><Ionicons name="checkmark" size={13} color="#fff" /><Text style={styles.mineText}>Deine Stimme</Text></View>
                ) : (
                  <Text style={styles.pct}>{total > 0 ? `${Math.round(share * 100)} %` : ''}</Text>
                )}
              </View>
              <Bar share={share} mine={mine} />
            </Pressable>
          );
        })}
        {total > 0 ? <Text style={styles.footer}>{`Meinungsbild · ${total} ${total === 1 ? 'Stimme' : 'Stimmen'} · aktualisiert sich live`}</Text> : null}
      </ScrollView>
    </LiveSheet>
  );
}

const makeStyles = (L: LivePalette) => StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  login: {
    height: 48, borderRadius: 24, backgroundColor: L.navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 6,
  },
  loginText: { color: '#fff', fontSize: 15, fontFamily: F.semiBold },
  error: { color: L.isDark ? '#FF8A8A' : '#B91C1C', fontSize: 13, fontFamily: F.medium },
  empty: { color: L.textSecondary, fontSize: 14, fontFamily: F.medium, textAlign: 'center', padding: 16 },
  item: { padding: 12, borderRadius: 14, backgroundColor: L.surfaceRaised, gap: 10, borderWidth: 1, borderColor: 'transparent' },
  itemMine: { borderColor: L.accent, backgroundColor: L.navySoft },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: L.text, fontSize: 15, fontFamily: F.semiBold },
  subtitle: { color: L.textSecondary, fontSize: 12, fontFamily: F.regular },
  pct: { color: L.textSecondary, fontSize: 14, fontFamily: F.semiBold, fontVariant: ['tabular-nums'] },
  mineTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: L.navyBright, paddingHorizontal: 8, height: 24, borderRadius: 12 },
  mineText: { color: '#fff', fontSize: 11, fontFamily: F.semiBold },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: L.barTrack, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: L.barFill },
  barFillMine: { backgroundColor: L.accent },
  footer: { color: L.textTertiary, fontSize: 12, fontFamily: F.medium, textAlign: 'center', marginTop: 4 },
});
