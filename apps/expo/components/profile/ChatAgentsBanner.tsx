import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import PressableScale from '@/components/PressableScale';
import { BotAvatar, BotAvatarStack } from '@/components/chat';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { threadTitle } from '@/lib/chat/format';
import { loadRecentThreadsIfSession } from '@/lib/chat/recent';
import type { BotAvatarSpec, ChatThread } from '@/lib/chat/types';

const AVATAR_SIZE = 80;
const CARD_LIGHT = '#F2F3F5';
const CARD_LIGHT_PRESSED = '#E6E8EB';
const PLACEHOLDER_LIGHT = '#D9D9D9';

const MECKY_SPEC: BotAvatarSpec = { shape: 'circle', color: '#00498B', eyes: 'dots' };

type Row = { key: string; name: string; preview: string };

const FALLBACK_ROWS: Row[] = [
  { key: 'mecky', name: 'Mecky', preview: 'Dein Team aus Agenten – frag mich alles über Röbel' },
  { key: 'recherche', name: 'Recherche', preview: 'Findet Förderungen, Wohngeld & mehr' },
];

type Props = {
  /** Active smart-account address; only used to look up an already stored chat session. */
  wallet: string | null | undefined;
};

/** "Your agents" card under the profile action grid: the two latest chat threads, taps into /chat. */
export default function ChatAgentsBanner({ wallet }: Props) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [threads, setThreads] = useState<ChatThread[] | null | undefined>(undefined);
  const [pressed, setPressed] = useState(false);
  const requestId = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const id = ++requestId.current;
      loadRecentThreadsIfSession(wallet, 2)
        .then((res) => {
          if (id === requestId.current) setThreads(res);
        })
        .catch(() => {
          if (id === requestId.current) setThreads(null);
        });
    }, [wallet]),
  );

  const loading = threads === undefined;
  const hasThreads = !!threads && threads.length > 0;
  const rows: Row[] = hasThreads
    ? threads.map((th) => ({ key: th.id, name: threadTitle(th), preview: th.lastMessagePreview ?? '' }))
    : FALLBACK_ROWS;

  const lead = hasThreads ? threads[0] : null;
  const leadSpecs = lead ? lead.bots.map((b) => b.avatar).filter(Boolean) : [];

  const cardBg = isDark ? (pressed ? colors.surface : colors.surfaceSecondary) : pressed ? CARD_LIGHT_PRESSED : CARD_LIGHT;
  const placeholderBg = isDark ? colors.surface : PLACEHOLDER_LIGHT;
  const fadeable = /^#[0-9a-f]{6}$/i.test(cardBg);

  let avatar: React.ReactNode;
  if (loading) {
    avatar = <View style={[styles.placeholder, { backgroundColor: placeholderBg }]} />;
  } else if (lead && leadSpecs.length > 1) {
    avatar = <BotAvatarStack specs={leadSpecs} size={AVATAR_SIZE} />;
  } else if (lead && leadSpecs.length === 1) {
    avatar = <BotAvatar spec={leadSpecs[0]} size={AVATAR_SIZE} />;
  } else {
    avatar = <BotAvatar spec={MECKY_SPEC} size={AVATAR_SIZE} />;
  }

  return (
    <PressableScale
      onPress={() => router.push('/chat' as any)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      haptic="light"
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`Chat mit deinen Agenten öffnen: ${rows.map((r) => r.name).join(', ')}`}
      style={[styles.card, { backgroundColor: cardBg }]}
    >
      <View style={styles.avatarWrap}>{avatar}</View>
      <View style={styles.rows}>
        {rows.map((row, i) => (
          <View key={row.key} style={[styles.row, i > 0 && !fadeable ? styles.faded : null]}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {row.name}
            </Text>
            {row.preview ? (
              <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>
                {row.preview}
              </Text>
            ) : null}
            {i > 0 && fadeable ? (
              <LinearGradient
                pointerEvents="none"
                colors={[`${cardBg}00`, `${cardBg}E6`]}
                locations={[0, 0.85]}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
          </View>
        ))}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  avatarWrap: { width: AVATAR_SIZE, height: AVATAR_SIZE, alignItems: 'center', justifyContent: 'center' },
  placeholder: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
  rows: { flex: 1, minWidth: 0, gap: 8 },
  row: { gap: 2 },
  faded: { opacity: 0.35 },
  name: { fontFamily: fontFamily.medium, fontSize: 15 },
  preview: { fontFamily: fontFamily.regular, fontSize: 14 },
});
