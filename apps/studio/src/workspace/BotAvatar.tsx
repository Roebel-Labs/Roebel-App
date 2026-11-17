import { useEffect, useState } from 'react';
import meckyUrl from '../assets/mecky-welcome.png';
import { agentPicture } from '../agent/characters';
import type { ChatBot } from './types';

type AvatarBot = Pick<ChatBot, 'id' | 'name'> & { avatar?: { character?: string | null; imageUrl?: string | null } | null };

/** Mecky is the default assistant; character agents show their own artwork, other bots a tile with their initial. */
export function isMecky(bot: Pick<ChatBot, 'id' | 'name'> | null | undefined): boolean {
  return !!bot && (/^mecky\b/i.test(bot.name.trim()) || /(^|[-_:])mecky($|[-_:])/i.test(bot.id));
}

export function botInitial(name: string | null | undefined): string {
  const t = (name ?? '').trim();
  return t ? t.slice(0, 1).toUpperCase() : '·';
}

/**
 * Assistant avatar: a rounded-square tile with a flat fill holding a picture, by the picture rule (own picture →
 * character tile → Mecky → initial). An own picture that cannot be loaded (offline, deleted) falls back to the
 * next rule. Without a bot (nothing loaded yet) it shows Mecky, the default assistant.
 */
export function BotAvatar({ bot, size = 28, radius = 6 }: { bot?: AvatarBot | null; size?: number; radius?: number }) {
  const [broken, setBroken] = useState<string | null>(null);
  const imageUrl = bot?.avatar?.imageUrl ?? null;
  useEffect(() => setBroken(null), [imageUrl]);
  const pic = agentPicture({ imageUrl: imageUrl && imageUrl !== broken ? imageUrl : null, characterId: bot?.avatar?.character, mecky: !bot || isMecky(bot) });
  const kind = pic.kind === 'image' ? ' picture' : pic.kind === 'character' ? ' character' : pic.kind === 'mecky' ? ' mecky' : '';
  const style = { width: size, height: size, borderRadius: radius, fontSize: Math.max(10, Math.round(size * 0.5)), ...(pic.kind === 'character' ? { background: pic.character.color } : {}) };
  return (
    <span className={`ws-avatar${kind}`} aria-hidden="true" style={style}>
      {pic.kind === 'image' ? (
        <img src={pic.url} alt="" draggable={false} onError={() => setBroken(pic.url)} />
      ) : pic.kind === 'character' ? (
        <img src={pic.character.tile} alt="" draggable={false} />
      ) : pic.kind === 'mecky' ? (
        <img src={meckyUrl} alt="" draggable={false} />
      ) : (
        botInitial(bot?.name)
      )}
    </span>
  );
}
