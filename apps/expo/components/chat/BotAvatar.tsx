import React, { memo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import type { BotAvatarSpec, BotEyes, BotShape } from '@/lib/chat/types';
import {
  botAnimationUrl,
  botInitial,
  botPictureUrl,
  botTileColor,
  initialTextColor,
  type MascotAnimation,
} from '@/lib/chat/avatar-picture';
import { AnimatedMascot } from './AnimatedMascot';
import { chatFont, useChatTokens } from './tokens';

/** Palette sampled from the reference mascots (still used as tile colours of older bots). */
export const BOT_COLORS = {
  black: '#000000',
  orange: '#FF5C03',
  amber: '#FF9901',
  green: '#00CC76',
  cloudGreen: '#02C369',
  teal: '#04B39E',
  blue: '#1479FF',
  purple: '#8B4EFF',
  pink: '#FF2A92',
  red: '#FF2234',
  brown: '#895931',
  grey: '#777777',
} as const;

export const BOT_COLOR_LIST: string[] = Object.values(BOT_COLORS);

/**
 * Legacy shape/eye values of BotAvatarSpec. Kept so older specs and the internal design kit type-check;
 * nothing draws them any more (every bot shows a picture, see lib/chat/avatar-picture.ts).
 */
export const BOT_SHAPES: BotShape[] = ['circle', 'cloud', 'drop', 'hexagon', 'squircle', 'pill', 'triangle', 'egg', 'blob'];
export const BOT_EYES: BotEyes[] = ['dots', 'dashes', 'wink', 'happy'];

export type BotAvatarProps = {
  spec: BotAvatarSpec;
  size: number;
  /** Bot name: picks Mecky's picture for Mecky and the letter of the initial tile. */
  name?: string;
  /** Green presence dot bottom-right with a ring in the background color. */
  online?: boolean;
  /** Legacy (the drawn eyes are gone); ignored. */
  hideEyes?: boolean;
  /**
   * Animated characters and Mecky: 'idle' (default) plays a short loop when the avatar comes into view and now
   * and then; 'writing' loops while the agent answers; false keeps the picture still. Below 24 px it stays still.
   */
  animate?: MascotAnimation | false;
  style?: StyleProp<ViewStyle>;
};

/** Initial letter on a round tile in the bot's colour: the fallback and the loading state. */
function InitialTile({ spec, size, name }: { spec: BotAvatarSpec; size: number; name?: string }) {
  const background = botTileColor(spec);
  const letter = botInitial(name);
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size / 2, backgroundColor: background }]}>
      {letter ? (
        <Text
          allowFontScaling={false}
          style={{ color: initialTextColor(background), fontFamily: chatFont.semiBold, fontSize: Math.round(size * 0.44) }}
        >
          {letter}
        </Text>
      ) : null}
    </View>
  );
}

function BotAvatarImpl({ spec, size, name, online, animate = 'idle', style }: BotAvatarProps) {
  const t = useChatTokens();
  const dot = Math.max(8, Math.round(size * 0.26));
  const ring = size >= 36 ? 2.5 : 2;
  const url = botPictureUrl(spec, name);
  // A failed download shows the initial tile; a new url gets a fresh try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const picture = url && failedUrl !== url ? url : null;
  const animUrl = animate && size >= 24 ? botAnimationUrl(spec, name, animate) : null;
  const animation = animUrl && failedUrl !== animUrl ? animUrl : null;
  return (
    <View style={[{ width: size, height: size }, style]}>
      <InitialTile spec={spec} size={size} name={name} />
      {animation ? (
        <AnimatedMascot
          uri={animation}
          size={size}
          mode={animate === 'writing' ? 'loop' : 'idle'}
          placeholder={picture}
          onError={() => setFailedUrl(animation)}
          style={styles.picture}
        />
      ) : picture ? (
        <View style={[styles.picture, { width: size, height: size, borderRadius: size / 2 }]}>
          <Image
            source={{ uri: picture }}
            style={{ width: size, height: size }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={picture}
            transition={120}
            accessible={false}
            onError={() => setFailedUrl(picture)}
          />
        </View>
      ) : null}
      {online ? (
        <View
          style={[
            styles.dot,
            {
              width: dot + ring * 2,
              height: dot + ring * 2,
              borderRadius: (dot + ring * 2) / 2,
              borderWidth: ring,
              borderColor: t.background,
              backgroundColor: t.online,
              right: -ring - size * 0.02,
              bottom: -ring - size * 0.02,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

export const BotAvatar = memo(BotAvatarImpl);
export default BotAvatar;

/** Legacy eyes layer: pictures carry their own faces, so this draws nothing. Kept for older imports. */
export function BotEyesLayer(_props: { spec: BotAvatarSpec; size: number }) {
  return null;
}

const styles = StyleSheet.create({
  dot: { position: 'absolute' },
  tile: { alignItems: 'center', justifyContent: 'center' },
  picture: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
});
