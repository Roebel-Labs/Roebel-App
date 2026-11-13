import meckyUrl from '../assets/mecky-welcome.png';
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
 * Assistant avatar: a rounded-square tile with a flat fill, holding the Mecky artwork (unmodified, cropped
 * at the bottom of the tile) or the assistant's initial. Without a bot (nothing loaded yet) it shows Mecky,
 * the default assistant.
 */
export function BotAvatar({ bot, size = 28, radius = 6 }: { bot?: Pick<ChatBot, 'id' | 'name'> | null; size?: number; radius?: number }) {
  const mecky = !bot || isMecky(bot);
  return (
    <span className={`ws-avatar${mecky ? ' mecky' : ''}`} aria-hidden="true" style={{ width: size, height: size, borderRadius: radius, fontSize: Math.max(10, Math.round(size * 0.5)) }}>
      {mecky ? <img src={meckyUrl} alt="" draggable={false} /> : botInitial(bot?.name)}
    </span>
  );
}
