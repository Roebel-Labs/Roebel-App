import type { BotAvatarSpec } from './types';

const RADIUS: Record<string, string> = {
  circle: '50%',
  squircle: '32%',
  pill: '999px',
  egg: '50% 50% 46% 46% / 58% 58% 42% 42%',
  drop: '50% 50% 50% 8%',
  blob: '42% 58% 55% 45% / 50% 44% 56% 50%',
  cloud: '45%',
  hexagon: '28%',
  triangle: '30%',
};

/** The Mecky-family mascot, drawn with CSS only (shape + color + two eyes). */
export function BotAvatar({ avatar, size = 28 }: { avatar?: BotAvatarSpec; size?: number }) {
  const color = avatar?.color && /^#[0-9a-f]{3,8}$/i.test(avatar.color) ? avatar.color : '#00498b';
  const eye = Math.max(2, Math.round(size / 9));
  return (
    <span
      className="ws-avatar"
      aria-hidden="true"
      style={{ width: size, height: size, background: color, borderRadius: RADIUS[avatar?.shape ?? 'circle'] ?? '50%', gap: eye * 1.4 }}
    >
      <i style={{ width: eye, height: avatar?.eyes === 'dashes' ? eye / 2 : eye }} />
      <i style={{ width: eye, height: avatar?.eyes === 'wink' || avatar?.eyes === 'dashes' ? eye / 2 : eye }} />
    </span>
  );
}
