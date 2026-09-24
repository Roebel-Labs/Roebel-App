import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { MECKY_HANDLE, type Mentionable } from '@/lib/mentions';

type Props = {
  suggestions: Mentionable[];
  onPick: (m: Mentionable) => void;
};

const MECKY_AVATAR = require('@/assets/illustration/mecky/welcome.png');

/** Rows proposed while typing "@…" in a comment. */
export default function MentionSuggestions({ suggestions, onPick }: Props) {
  const { colors } = useTheme();
  if (suggestions.length === 0) return null;

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background, borderColor: colors.border }]}
      accessibilityRole="menu"
    >
      {suggestions.map((m) => (
        <Pressable
          key={m.handle}
          onPress={() => onPick(m)}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceSecondary }]}
          accessibilityRole="menuitem"
          accessibilityLabel={`@${m.handle} erwähnen`}
          hitSlop={4}
        >
          <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}>
            {m.handle === MECKY_HANDLE ? (
              <Image source={MECKY_AVATAR} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <Text style={[styles.initial, { color: colors.textSecondary }]}>
                {m.handle.charAt(0)}
              </Text>
            )}
          </View>
          <View style={styles.text}>
            <Text style={[styles.handle, { color: colors.primary }]}>@{m.handle}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {m.subtitle}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    marginBottom: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImg: {
    width: 32,
    height: 32,
  },
  initial: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  text: {
    flex: 1,
    gap: 1,
  },
  handle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
});
