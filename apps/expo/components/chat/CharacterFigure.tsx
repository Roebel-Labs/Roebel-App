import React, { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import type { BotAvatarSpec } from '@/lib/chat/types';
import { MECKY_COLOR, characterArt, characterById } from '@/lib/chat/characters';
import { BOT_COLORS, BotAvatar } from './BotAvatar';

const MECKY_AVATAR: BotAvatarSpec = { shape: 'circle', color: BOT_COLORS.black, eyes: 'dots' };

export type CharacterFigureProps = {
  /** Character id; null or unknown shows `fallback` (the bot's shape avatar). */
  characterId: string | null | undefined;
  /** Height of the stage; the figure is fitted inside. */
  height: number;
  /** Shape avatar for an agent without a character, or while the artwork cannot be loaded. */
  fallback?: BotAvatarSpec;
  /** Rounded stage in the character's colour (default); false draws the figure only. */
  stage?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** The transparent full figure of a character on its colour. Remote artwork, cached on disk. */
export function CharacterFigure({ characterId, height, fallback, stage = true, style }: CharacterFigureProps) {
  const character = characterById(characterId);
  const [failedId, setFailedId] = useState<string | null>(null);
  const art = character && failedId !== character.id ? character : null;
  const color = character?.color ?? MECKY_COLOR;
  return (
    <View
      style={[
        styles.stage,
        art ? styles.bottom : styles.middle,
        { height },
        stage ? { backgroundColor: color, borderRadius: 28 } : null,
        style,
      ]}
    >
      {art ? (
        <Image
          source={{ uri: characterArt(art.id).full }}
          style={{ width: '100%', height: Math.max(0, height - (stage ? 16 : 0)) }}
          contentFit="contain"
          contentPosition="bottom"
          cachePolicy="memory-disk"
          recyclingKey={art.id}
          transition={150}
          accessible={false}
          onError={() => setFailedId(art.id)}
        />
      ) : (
        <BotAvatar spec={fallback ?? MECKY_AVATAR} size={Math.round(Math.min(120, height * 0.5))} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', overflow: 'hidden' },
  bottom: { justifyContent: 'flex-end' },
  middle: { justifyContent: 'center' },
});

export default CharacterFigure;
