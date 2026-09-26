import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { BotAvatarSpec } from '@/lib/chat/types';
import { inspirationRowLabel } from '@/lib/chat/inspiration';
import { BotAvatarStack } from './BotAvatarStack';
import { chatFont, chatSize, haloShadow, useChatTokens } from './tokens';

export type InspirationEntryRowProps = {
  count: number;
  /** Mascots of the first ideas (deduplicated by the caller), up to 3. */
  avatars: BotAvatarSpec[];
  /** Title of the top idea, shown as the preview line. */
  preview?: string | null;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Prominent first row of the chat list: "Für dich · N Ideen" → app/chat/inspiration. */
export function InspirationEntryRow({ count, avatars, preview, onPress, style }: InspirationEntryRowProps) {
  const t = useChatTokens();
  const label = inspirationRowLabel(count);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}${preview ? `, ${preview}` : ''}`}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: t.surface, transform: [{ scale: pressed ? 0.985 : 1 }] },
        haloShadow(t),
        style,
      ]}
    >
      <View style={styles.avatar}>
        {avatars.length ? (
          <BotAvatarStack specs={avatars.slice(0, 3)} size={chatSize.listAvatar} />
        ) : (
          <View style={[styles.sparkle, { backgroundColor: t.primaryButton }]}>
            <Feather name="zap" size={20} color={t.primaryButtonText} />
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text numberOfLines={1} style={[styles.title, { color: t.textPrimary }]}>
          {label}
        </Text>
        <Text numberOfLines={1} style={[styles.preview, { color: t.textSecondary }]}>
          {preview || 'Ideen, was deine Bots für dich erledigen können'}
        </Text>
      </View>
      <Feather name="chevron-right" size={22} color={t.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: chatSize.screenPadH,
    marginTop: 4,
    marginBottom: 10,
    gap: 14,
  },
  avatar: { width: chatSize.listAvatar, height: chatSize.listAvatar },
  sparkle: {
    width: chatSize.listAvatar,
    height: chatSize.listAvatar,
    borderRadius: chatSize.listAvatar / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontFamily: chatFont.semiBold, fontSize: 17, letterSpacing: -0.2 },
  preview: { fontFamily: chatFont.regular, fontSize: 15, marginTop: 3, letterSpacing: -0.1 },
});

export default InspirationEntryRow;
