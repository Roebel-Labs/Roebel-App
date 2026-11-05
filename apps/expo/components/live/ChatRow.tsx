import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { formatSupportAmount, type ChatMessage } from '@/lib/live';
import { F, liveStyles, useLivePalette, type LivePalette } from './tokens';

function nameIndex(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function nameColor(name: string, colors: readonly string[]): string {
  return colors[nameIndex(name) % colors.length];
}

/** Avatar fallbacks keep the bright dark-theme colours in every theme (dark initial on a light disc). */
const AVATAR_COLORS = ['#7ABBF2', '#F2C14E', '#8BD3A6', '#F29E7A', '#C3A6F2', '#F27AB0', '#7AE0F2'] as const;

function Avatar({ uri, name, size }: { uri: string | null; name: string; size: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  return (
    <View style={[staticStyles.avatarFallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: nameColor(name, AVATAR_COLORS) }]}>
      <Text style={staticStyles.avatarInitial}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

/** `animate` only for messages that arrive while watching (history and recycled rows mount still). */
function ChatRowImpl({ m, own, animate }: { m: ChatMessage; own: boolean; animate: boolean }) {
  const L = useLivePalette();
  const styles = liveStyles(makeStyles, L);
  const name = m.display_name?.trim() || 'Jemand';

  if (m.kind === 'support') {
    return (
      <Animated.View entering={animate ? FadeInDown.duration(260) : undefined} style={styles.supportCard}>
        <View style={styles.supportHead}>
          <View style={styles.supportBadge}><Ionicons name="heart" size={13} color="#1B1B1B" /></View>
          <Text style={styles.supportTitle} numberOfLines={2}>
            <Text style={styles.supportName}>{name}</Text>
            {` unterstützt mit ${formatSupportAmount(m.amount_cents)}`}
          </Text>
        </View>
        {m.body ? <Text style={styles.supportBody}>{m.body}</Text> : null}
      </Animated.View>
    );
  }

  if (m.kind === 'system') {
    return (
      <Animated.View entering={animate ? FadeInDown.duration(220) : undefined} style={styles.systemRow}>
        <Ionicons name="megaphone-outline" size={14} color={L.accent} />
        <Text style={styles.systemText}>{m.body}</Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={animate ? FadeInDown.duration(200) : undefined} style={[styles.row, m.featured_at ? styles.rowFeatured : null]}>
      <Avatar uri={m.avatar_url} name={name} size={26} />
      <Text style={styles.text}>
        <Text style={[styles.name, { color: own ? L.text : nameColor(name, L.nameColors) }]}>{own ? `${name} (du)` : name}</Text>
        {'  '}
        <Text style={styles.body}>{m.body}</Text>
      </Text>
      {m.featured_at ? <Ionicons name="pin" size={13} color={L.goldText} style={styles.pin} /> : null}
    </Animated.View>
  );
}

const ChatRow = memo(ChatRowImpl);
export default ChatRow;

/** Featured message pinned above the chat list. */
export function PinnedMessage({ m }: { m: ChatMessage }) {
  const L = useLivePalette();
  const styles = liveStyles(makeStyles, L);
  const name = m.display_name?.trim() || 'Jemand';
  return (
    <Animated.View entering={FadeInDown.duration(240)} style={styles.pinned}>
      <Ionicons name="pin" size={14} color={L.goldText} />
      <Text style={styles.pinnedText} numberOfLines={2}>
        <Text style={styles.pinnedName}>{name}</Text>
        {'  '}
        {m.kind === 'support' ? `unterstützt mit ${formatSupportAmount(m.amount_cents)}${m.body ? ` · ${m.body}` : ''}` : m.body}
      </Text>
    </Animated.View>
  );
}

// Avatar fallback lives outside the palette (fixed colours), so it keeps a static sheet.
const staticStyles = StyleSheet.create({
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#121212', fontSize: 12, fontFamily: F.bold },
});

const makeStyles = (L: LivePalette) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 5 },
  rowFeatured: { backgroundColor: L.goldSoft },
  text: { flex: 1, fontSize: 14, lineHeight: 20 },
  name: { fontFamily: F.semiBold, fontSize: 14 },
  body: { color: L.text, fontFamily: F.regular, fontSize: 14 },
  pin: { marginTop: 3 },
  supportCard: {
    marginHorizontal: 12, marginVertical: 6, padding: 12, borderRadius: 14, backgroundColor: L.navy,
    borderWidth: 1, borderColor: 'rgba(242,193,78,0.55)', gap: 6,
  },
  supportHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  supportBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: L.gold, alignItems: 'center', justifyContent: 'center' },
  supportTitle: { flex: 1, color: L.onNavy, fontSize: 14, fontFamily: F.medium },
  supportName: { color: L.gold, fontFamily: F.bold },
  supportBody: { color: L.onNavy, fontSize: 14, lineHeight: 20, fontFamily: F.regular, paddingLeft: 30 },
  systemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginVertical: 4, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, backgroundColor: L.infoSoft,
  },
  systemText: { flex: 1, color: L.textSecondary, fontSize: 13, fontFamily: F.medium },
  pinned: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 8, paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 12, backgroundColor: L.goldSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: L.goldBorder,
  },
  pinnedText: { flex: 1, color: L.text, fontSize: 13, fontFamily: F.regular },
  pinnedName: { color: L.goldText, fontFamily: F.semiBold },
});
