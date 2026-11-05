// Twitch-style supporter board: sticky horizontal strip at the top of the chat, top 10 by total.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { formatSupportAmount, type Supporter } from '@/lib/live';
import { F, liveStyles, useLivePalette, type LivePalette } from '../tokens';

type Props = { supporters: Supporter[]; onPress?: (s: Supporter) => void };

export default function SupportersStrip({ supporters, onPress }: Props) {
  const L = useLivePalette();
  const styles = liveStyles(makeStyles, L);
  if (!supporters.length) return null;
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Ionicons name="heart" size={13} color={L.goldText} style={styles.lead} accessibilityLabel="Unterstützer" />
        {supporters.map((s, i) => (
          <Pressable
            key={s.key}
            onPress={onPress ? () => onPress(s) : undefined}
            disabled={!onPress}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
            accessibilityLabel={`${s.name}, ${formatSupportAmount(s.totalCents)}`}
          >
            {i < 3 ? (
              <View style={styles.rank}><Text style={styles.rankText}>{i + 1}</Text></View>
            ) : null}
            <Text style={styles.name} numberOfLines={1}>{s.name}</Text>
            <Text style={styles.amount}>{formatSupportAmount(s.totalCents)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const makeStyles = (L: LivePalette) => StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border },
  content: { alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  lead: { marginRight: 2 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingLeft: 4, paddingRight: 10, borderRadius: 14,
    backgroundColor: L.goldSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: L.goldBorder, maxWidth: 200,
  },
  pressed: { opacity: 0.75 },
  rank: { width: 20, height: 20, borderRadius: 10, backgroundColor: L.gold, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: '#1B1B1B', fontSize: 11, fontFamily: F.bold },
  name: { flexShrink: 1, color: L.text, fontSize: 12, fontFamily: F.semiBold, marginLeft: 4 },
  amount: { color: L.goldText, fontSize: 12, fontFamily: F.bold, fontVariant: ['tabular-nums'] },
});
