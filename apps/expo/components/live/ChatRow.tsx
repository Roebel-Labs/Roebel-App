import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { formatSupportAmount, type ChatMessage } from '@/lib/live';
import { F, liveStyles, useLivePalette, VIDEO, type LivePalette } from './tokens';

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

export function Avatar({ uri, name, size }: { uri: string | null; name: string; size: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  return (
    <View style={[staticStyles.avatarFallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: nameColor(name, AVATAR_COLORS) }]}>
      <Text style={staticStyles.avatarInitial}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

type RowProps = {
  m: ChatMessage;
  own: boolean;
  /** Only for messages that arrive while watching (history and recycled rows mount still). */
  animate: boolean;
  /** Author blocked on this device: keep the name, hide the text. */
  blocked?: boolean;
  /** Long-press → report / block sheet (not passed for your own rows). */
  onLongPress?: (m: ChatMessage) => void;
  /** 'overlay' = white text over the video (live room stage); default follows the app theme. */
  variant?: 'theme' | 'overlay';
};

/** Gold amount tag after the name (a real View chip: centred label, fixed height, rounded). */
function MoneyChip({ cents }: { cents: number | null }) {
  return (
    <View style={staticStyles.moneyChip}>
      <Text style={staticStyles.moneyChipText}>{formatSupportAmount(cents)}</Text>
    </View>
  );
}

/** YouTube-Live-style row: avatar + muted name + message inline, no bubbles. */
function ChatRowImpl({ m, own, animate, blocked = false, onLongPress, variant = 'theme' }: RowProps) {
  const L = useLivePalette();
  const themed = liveStyles(makeStyles, L);
  const styles = variant === 'overlay' ? overlayStyles : themed;
  const name = m.display_name?.trim() || 'Jemand';

  if (m.kind === 'system') {
    return (
      <Animated.View entering={animate ? FadeInDown.duration(220) : undefined} style={styles.systemRow}>
        <Ionicons name="megaphone-outline" size={13} color={variant === 'overlay' ? 'rgba(255,255,255,0.7)' : L.textTertiary} />
        <Text style={styles.systemText}>{m.body}</Text>
      </Animated.View>
    );
  }

  const support = m.kind === 'support';
  const longPress = onLongPress && !own && !m.pending ? () => onLongPress(m) : undefined;
  const nameText = own ? `${name} (du)` : name;
  const bodyNode = blocked
    ? <Text style={styles.hidden}>[Nachricht ausgeblendet]</Text>
    : <Text style={styles.body}>{m.body}</Text>;
  return (
    <Animated.View entering={animate ? FadeInDown.duration(200) : undefined} style={m.pending ? staticStyles.pending : null}>
      <Pressable
        onLongPress={longPress}
        delayLongPress={350}
        disabled={!longPress}
        style={({ pressed }) => [
          styles.row,
          support && styles.rowSupport,
          m.featured_at ? styles.rowFeatured : null,
          pressed && longPress ? styles.rowPressed : null,
        ]}
      >
        <Avatar uri={blocked ? null : m.avatar_url} name={name} size={variant === 'overlay' ? 22 : 24} />
        {support ? (
          // Support rows: name + amount tag on one line, the greeting below.
          <View style={styles.supportCol}>
            <View style={styles.supportHead}>
              <Text style={[styles.name, own && styles.nameOwn, styles.nameShrink]} numberOfLines={1}>{nameText}</Text>
              <MoneyChip cents={m.amount_cents} />
            </View>
            {blocked || m.body ? <Text style={styles.text}>{bodyNode}</Text> : null}
          </View>
        ) : (
          <Text style={styles.text}>
            <Text style={[styles.name, own && styles.nameOwn]}>{nameText}</Text>
            {'  '}
            {bodyNode}
          </Text>
        )}
        {m.featured_at ? <Ionicons name="pin" size={13} color={variant === 'overlay' ? VIDEO.gold : L.goldText} style={styles.pin} /> : null}
      </Pressable>
    </Animated.View>
  );
}

const ChatRow = memo(ChatRowImpl);
export default ChatRow;

/** Featured message pinned above the chat list. */
export function PinnedMessage({ m, variant = 'theme' }: { m: ChatMessage; variant?: 'theme' | 'overlay' }) {
  const L = useLivePalette();
  const themed = liveStyles(makeStyles, L);
  const styles = variant === 'overlay' ? overlayStyles : themed;
  const name = m.display_name?.trim() || 'Jemand';
  return (
    <Animated.View entering={FadeInDown.duration(240)} style={styles.pinned}>
      <Ionicons name="pin" size={14} color={variant === 'overlay' ? VIDEO.gold : L.goldText} />
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
  pending: { opacity: 0.55 },
  moneyChip: {
    height: 18, paddingHorizontal: 6, borderRadius: 4, marginLeft: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F2C14E',
  },
  moneyChipText: { color: '#1B1B1B', fontSize: 11, lineHeight: 14, fontFamily: F.bold, textAlign: 'center', includeFontPadding: false },
});

const SHADOW = { textShadowColor: 'rgba(0,0,0,0.65)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 } as const;

/** Over the video: white text with a soft shadow, gold-tinted support rows. */
const overlayStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingLeft: 6, paddingRight: 6, paddingVertical: 3,
    borderLeftWidth: 2, borderLeftColor: 'transparent', borderRadius: 8,
  },
  rowSupport: { borderLeftColor: VIDEO.gold, backgroundColor: 'rgba(242,193,78,0.16)' },
  rowFeatured: { backgroundColor: 'rgba(242,193,78,0.24)' },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.10)' },
  text: { flex: 1, fontSize: 14, lineHeight: 19, paddingTop: 1 },
  supportCol: { flex: 1, gap: 1 },
  supportHead: { flexDirection: 'row', alignItems: 'center', minHeight: 20 },
  name: { color: 'rgba(255,255,255,0.78)', fontFamily: F.semiBold, fontSize: 13, ...SHADOW },
  nameShrink: { flexShrink: 1 },
  nameOwn: { color: '#FFFFFF' },
  body: { color: '#FFFFFF', fontFamily: F.regular, fontSize: 14, ...SHADOW },
  hidden: { color: 'rgba(255,255,255,0.55)', fontFamily: F.regular, fontStyle: 'italic', fontSize: 13 },
  pin: { marginTop: 3 },
  systemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 8, paddingVertical: 4 },
  systemText: { flex: 1, color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 18, fontFamily: F.regular, fontStyle: 'italic', ...SHADOW },
  pinned: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(242,193,78,0.55)',
  },
  pinnedText: { flex: 1, color: '#FFFFFF', fontSize: 13, fontFamily: F.regular },
  pinnedName: { color: VIDEO.gold, fontFamily: F.semiBold },
});

const makeStyles = (L: LivePalette) => StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingLeft: 14, paddingRight: 14, paddingVertical: 4,
    borderLeftWidth: 2, borderLeftColor: 'transparent',
  },
  rowSupport: { borderLeftColor: L.goldBorder, backgroundColor: L.isDark ? 'rgba(242,193,78,0.05)' : 'rgba(242,193,78,0.08)' },
  rowFeatured: { backgroundColor: L.goldSoft },
  rowPressed: { backgroundColor: L.surfaceRaised },
  text: { flex: 1, fontSize: 14, lineHeight: 20, paddingTop: 1 },
  supportCol: { flex: 1, gap: 2 },
  supportHead: { flexDirection: 'row', alignItems: 'center', minHeight: 21 },
  name: { color: L.textSecondary, fontFamily: F.semiBold, fontSize: 13 },
  nameShrink: { flexShrink: 1 },
  nameOwn: { color: L.text },
  body: { color: L.text, fontFamily: F.regular, fontSize: 14 },
  hidden: { color: L.textTertiary, fontFamily: F.regular, fontStyle: 'italic', fontSize: 13 },
  pin: { marginTop: 3 },
  systemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16, paddingVertical: 5 },
  systemText: { flex: 1, color: L.textTertiary, fontSize: 13, lineHeight: 18, fontFamily: F.regular, fontStyle: 'italic' },
  pinned: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 8, paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 12, backgroundColor: L.goldSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: L.goldBorder,
  },
  pinnedText: { flex: 1, color: L.text, fontSize: 13, fontFamily: F.regular },
  pinnedName: { color: L.goldText, fontFamily: F.semiBold },
});
