import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { BotAvatarSpec } from '@/lib/chat/types';
import { BotAvatar } from './BotAvatar';
import { BotAvatarStack } from './BotAvatarStack';
import { chatFont, chatSize, haloShadow, useChatTokens } from './tokens';

export type GlassPillHeaderProps = {
  /** One spec = single avatar; several = group stack. */
  avatars: BotAvatarSpec[];
  title: string;
  online?: boolean;
  onPress?: () => void;
  /** 'dark' = transparent on black (computer view, ref 18). */
  tone?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
};

/** White pill with avatar + bot name, next to the back circle (ref 4). */
export function GlassPillHeader({ avatars, title, online, onPress, tone = 'light', style }: GlassPillHeaderProps) {
  const t = useChatTokens();
  const dark = tone === 'dark';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={!onPress}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.pill,
        dark ? null : [{ backgroundColor: t.surface }, haloShadow(t)],
        { transform: [{ scale: pressed ? 0.97 : 1 }] },
        style,
      ]}
    >
      <View style={styles.avatar}>
        {avatars.length > 1 ? (
          <BotAvatarStack specs={avatars} size={24} />
        ) : avatars[0] ? (
          <BotAvatar spec={avatars[0]} size={dark ? 26 : 25} online={online} />
        ) : null}
      </View>
      <Text numberOfLines={1} style={[styles.title, { color: dark ? '#FFFFFF' : t.textPrimary }, dark && styles.titleDark]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: chatSize.control,
    borderRadius: chatSize.control / 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 11,
    paddingRight: 15,
    gap: 10,
    maxWidth: 240,
  },
  avatar: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: chatFont.medium, fontSize: 17, letterSpacing: -0.2, flexShrink: 1 },
  titleDark: { fontSize: 19 },
});

export default GlassPillHeader;
