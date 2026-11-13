import meckyUrl from '../assets/mecky.png';
import type { ChatBot } from './types';

/** Mecky is the only assistant with artwork; the others get a tile with their initial. */
export function isMecky(bot: Pick<ChatBot, 'id' | 'name'> | null | undefined): boolean {
  return !!bot && (/^mecky\b/i.test(bot.name.trim()) || /(^|[-_:])mecky($|[-_:])/i.test(bot.id));
}

export function botInitial(name: string | null | undefined): string {
  const t = (name ?? '').trim();
  return t ? t.slice(0, 1).toUpperCase() : '·';
}

/**
 * Assistant avatar: a rounded-square tile filled with a tint of the selected accent colour, holding the
 * Mecky mascot or the assistant's initial. Without a bot (nothing loaded yet) it shows Mecky, the default
 * assistant.
 */
export function BotAvatar({ bot, size = 28 }: { bot?: Pick<ChatBot, 'id' | 'name'> | null; size?: number }) {
  const mecky = !bot || isMecky(bot);
  return (
    <span className={`ws-avatar${mecky ? ' mecky' : ''}`} aria-hidden="true" style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.46)) }}>
      {mecky ? <img src={meckyUrl} alt="" draggable={false} /> : botInitial(bot?.name)}
    </span>
  );
}
