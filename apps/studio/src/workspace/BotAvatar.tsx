import meckyUrl from '../assets/mecky-welcome.png';
import { characterById } from '../agent/characters';
import type { ChatBot } from './types';

type AvatarBot = Pick<ChatBot, 'id' | 'name'> & { avatar?: { character?: string } | null };

/** Mecky is the default assistant; character agents show their own artwork, other bots a tile with their initial. */
export function isMecky(bot: Pick<ChatBot, 'id' | 'name'> | null | undefined): boolean {
  return !!bot && (/^mecky\b/i.test(bot.name.trim()) || /(^|[-_:])mecky($|[-_:])/i.test(bot.id));
}

export function botInitial(name: string | null | undefined): string {
  const t = (name ?? '').trim();
  return t ? t.slice(0, 1).toUpperCase() : '·';
}

/**
 * Assistant avatar: a rounded-square tile with a flat fill, holding the artwork (Mecky's, cropped at the bottom of
 * the tile, or a character's head-and-shoulders tile on its own colour) or the assistant's initial. Without a bot
 * (nothing loaded yet) it shows Mecky, the default assistant.
 */
export function BotAvatar({ bot, size = 28, radius = 6 }: { bot?: AvatarBot | null; size?: number; radius?: number }) {
  const character = characterById(bot?.avatar?.character);
  const mecky = !character && (!bot || isMecky(bot));
  const style = { width: size, height: size, borderRadius: radius, fontSize: Math.max(10, Math.round(size * 0.5)), ...(character ? { background: character.color } : {}) };
  return (
    <span className={`ws-avatar${mecky ? ' mecky' : ''}${character ? ' character' : ''}`} aria-hidden="true" style={style}>
      {character ? <img src={character.tile} alt="" draggable={false} /> : mecky ? <img src={meckyUrl} alt="" draggable={false} /> : botInitial(bot?.name)}
    </span>
  );
}
