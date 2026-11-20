import React, { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import type { BotAvatarSpec } from '@/lib/chat/types';
import { MECKY_COLOR, characterArt, characterById } from '@/lib/chat/characters';
import { MECKY_AVATAR_SPEC, MECKY_TILE_URL, botPictureUrl } from '@/lib/chat/avatar-picture';
import { BotAvatar } from './BotAvatar';
import { useChatTokens } from './tokens';

export type CharacterFigureProps = {
  /** Character id; null or unknown shows `fallback` (the agent's picture) as a large round avatar. */
  characterId: string | null | undefined;
  /** Height of the stage; the figure is fitted inside. */
  height: number;
  /** Avatar for an agent without a character (own picture, Mecky, or initial tile). Defaults to Mecky. */
  fallback?: BotAvatarSpec;
  /** Agent name, for Mecky's picture and the letter of the initial tile. */
  name?: string;
  /** Rounded stage in the character's colour (default); false draws the figure only. */
  stage?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** The transparent full figure of a character on its colour, else the agent's picture. Remote, cached on disk. */
export function CharacterFigure({ characterId, height, fallback, name, stage = true, style }: CharacterFigureProps) {
  const t = useChatTokens();
  const character = characterById(characterId);
  const [failedId, setFailedId] = useState<string | null>(null);
  const art = character && failedId !== character.id ? character : null;
  const spec = fallback ?? MECKY_AVATAR_SPEC;
  // Characters stand on their colour, Mecky on his; own pictures on the neutral chip grey.
  const color = character?.color ?? (botPictureUrl(spec, name) === MECKY_TILE_URL ? MECKY_COLOR : t.chipBackground);
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
        <BotAvatar spec={spec} name={name} size={Math.round(Math.min(160, height * 0.6))} />
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
