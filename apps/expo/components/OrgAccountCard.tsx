import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import ThumbsVote from '@/components/ThumbsVote';
import type { Account } from '@/lib/types';

const CARD_WIDTH = 168;
const COVER_HEIGHT = 100;
const AVATAR_SIZE = 56;

type Props = {
  account: Account;
  upCount: number | null;
};

/**
 * Uber-Eats-style org-account card: a cover image with the account's logo as a
 * circular avatar (thick white border) overlapping the bottom, the name below
 * (medium weight) and a read-only thumbs-up count.
 */
export default function OrgAccountCard({ account, upCount }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/account/[id]' as any, params: { id: account.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
      accessibilityLabel={`${account.name} ansehen`}
    >
      <View style={[styles.coverWrap, { backgroundColor: colors.cardPlaceholder }]}>
        {account.cover_url ? (
          <Image
            source={{ uri: account.cover_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </View>

      <View style={[styles.avatarWrap, { borderColor: colors.background }]}>
        {account.avatar_url ? (
          <Image
            source={{ uri: account.avatar_url }}
            style={styles.avatarImage}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.surface }]}>
            <Text style={[styles.avatarInitial, { color: colors.textPrimary }]}>
              {(account.name[0] || '?').toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {account.name}
        </Text>
        <ThumbsVote upCount={upCount ?? 0} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    marginRight: 12,
  },
  coverWrap: {
    width: CARD_WIDTH,
    height: COVER_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
  },
  avatarWrap: {
    position: 'absolute',
    top: COVER_HEIGHT - AVATAR_SIZE / 2,
    left: (CARD_WIDTH - AVATAR_SIZE) / 2,
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 20,
    fontFamily: 'Inter-Medium',
  },
  info: {
    alignItems: 'center',
    paddingTop: AVATAR_SIZE / 2 + 8,
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
});
