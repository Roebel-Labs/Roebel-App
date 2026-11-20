import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, UserRound } from 'lucide-react';
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

/** Near-monochrome palette: ink on paper. Navy is the accent and the closing scene only. */
export const C = {
  paper: '#F7F5F0',
  card: '#FFFFFF',
  ink: '#141414',
  muted: '#6B7280',
  faint: '#A8A49B',
  line: '#E2DED5',
  navy: '#00498B',
  sky: '#9CCBF5',
  white: '#FFFFFF',
};

export const FONT = { heading: 'MonaSansSemiCondensed', body: 'MonaSans' };

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const expoOut = Easing.bezier(0.16, 1, 0.3, 1);
export const smooth = Easing.bezier(0.65, 0, 0.35, 1);
const COIN_RATIO = 300 / 276;

/** Eased 0 → 1 over `duration` frames from `start`. */
export function ramp(frame: number, start: number, duration: number, easing: (t: number) => number = expoOut) {
  return interpolate(frame, [start, start + duration], [0, 1], { ...clamp, easing });
}

export function useRamp(start: number, duration: number, easing?: (t: number) => number) {
  return ramp(useCurrentFrame(), start, duration, easing);
}

/** Spring 0 → 1 with a small overshoot, for things that "land". */
export function usePop(start = 0, damping = 14) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - start, fps, config: { damping, mass: 0.6, stiffness: 140 } });
}

/** Centres a box of the 1000 × 1000 stage on (x, y). */
export const at = (x: number, y: number, transform = ''): CSSProperties => ({
  position: 'absolute',
  left: x,
  top: y,
  transform: `translate(-50%, -50%) ${transform}`,
});

/** Point on a lifted arc between two stage positions, t in 0..1. */
export function arc(from: [number, number], to: [number, number], t: number, lift: number): [number, number] {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t - Math.sin(t * Math.PI) * lift];
}

/** Text that rises word by word out of a mask. */
export function Reveal({
  text,
  start,
  size,
  color = C.ink,
  family = FONT.heading,
  weight = 700,
  stagger = 3,
  lineHeight = 1.06,
  style,
}: {
  text: string;
  start: number;
  size: number;
  color?: string;
  family?: string;
  weight?: number;
  stagger?: number;
  lineHeight?: number;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  return (
    <div style={{ fontFamily: family, fontWeight: weight, fontSize: size, lineHeight, color, textAlign: 'center', ...style }}>
      {text.split(' ').map((word, i) => {
        const t = ramp(frame, start + i * stagger, 22);
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: size * 0.12, marginBottom: -size * 0.12 }}>
            <span style={{ display: 'inline-block', transform: `translateY(${(1 - t) * 110}%)`, opacity: Math.min(1, t * 2.5), whiteSpace: 'pre' }}>
              {word}
              {' '}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** The real Röbel Münze artwork, centred on (x, y). `glint` (0..1) sweeps a highlight across it. */
export function Coin({ x, y, size, scale = 1, rotate = 0, opacity = 1, glint }: { x: number; y: number; size: number; scale?: number; rotate?: number; opacity?: number; glint?: number }) {
  const src = staticFile('coin.png');
  const height = size * COIN_RATIO;
  const sweep = glint === undefined || glint <= 0 || glint >= 1 ? null : glint;
  return (
    <div style={{ ...at(x, y, `scale(${scale}) rotate(${rotate}deg)`), width: size, height, opacity }}>
      <Img src={src} style={{ width: '100%', height: '100%', display: 'block' }} />
      {sweep !== null ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            WebkitMaskImage: `url(${src})`,
            maskImage: `url(${src})`,
            WebkitMaskSize: '100% 100%',
            maskSize: '100% 100%',
            background: 'linear-gradient(115deg, rgba(255,255,255,0) 42%, rgba(255,255,255,0.85) 50%, rgba(255,255,255,0) 58%)',
            backgroundSize: '300% 100%',
            backgroundPosition: `${100 - sweep * 100}% 0`,
          }}
        />
      ) : null}
    </div>
  );
}

/** Soft contact shadow under a hovering object. */
export function Shadow({ x, y, width, strength = 1, dark = false }: { x: number; y: number; width: number; strength?: number; dark?: boolean }) {
  return (
    <div
      style={{
        ...at(x, y),
        width,
        height: width * 0.2,
        borderRadius: '50%',
        background: `radial-gradient(closest-side, rgba(${dark ? '0,20,45' : '20,20,20'},${0.28 * strength}), rgba(0,0,0,0))`,
      }}
    />
  );
}

/** A Münze travelling along an arc with a short motion trail. With `keep` it stays where it lands. */
export function FlyingCoin({ from, to, start, duration = 24, lift = 110, size = 60, keep = false }: { from: [number, number]; to: [number, number]; start: number; duration?: number; lift?: number; size?: number; keep?: boolean }) {
  const frame = useCurrentFrame();
  if (frame < start) return null;
  const done = frame >= start + duration;
  if (done && !keep) return null;
  const land = spring({ frame: frame - start - duration, fps: 30, config: { damping: 10, mass: 0.5, stiffness: 180 } });
  const settle = done ? 1 + (1 - land) * 0.18 : 1;
  const ghosts = done ? [0] : [3, 1.5, 0];
  return (
    <>
      {ghosts.map((lag) => {
        const t = ramp(frame - lag, start, duration, smooth);
        const [x, y] = arc(from, to, t, lift);
        const grow = 0.55 + 0.45 * Math.sin(Math.min(1, t * 1.15) * (Math.PI / 2));
        return <Coin key={lag} x={x} y={y} size={size} scale={grow * settle} rotate={(1 - t) * -40} opacity={lag === 0 ? 1 : lag === 1.5 ? 0.28 : 0.12} />;
      })}
    </>
  );
}

/** A person: round avatar with a line icon. `verified` adds the navy check. */
export function Avatar({ x, y, size = 120, start = 0, dashed = false, icon: Icon = UserRound, verifiedAt, shift = 0 }: { x: number; y: number; size?: number; start?: number; dashed?: boolean; icon?: LucideIcon; verifiedAt?: number; shift?: number }) {
  const pop = usePop(start);
  const frame = useCurrentFrame();
  const check = verifiedAt === undefined ? 0 : spring({ frame: frame - verifiedAt, fps: 30, config: { damping: 11, mass: 0.5, stiffness: 200 } });
  return (
    <div style={{ ...at(x + shift * (1 - pop), y, `scale(${pop})`), width: size, height: size, opacity: Math.min(1, pop * 2) }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          background: C.card,
          border: `${Math.max(3, size * 0.028)}px ${dashed ? 'dashed' : 'solid'} ${dashed ? C.faint : C.ink}`,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: dashed ? 'none' : '0 10px 24px rgba(20,20,20,0.07)',
        }}
      >
        <Icon size={size * 0.5} color={dashed ? C.muted : C.ink} strokeWidth={1.8} />
      </div>
      {verifiedAt !== undefined ? (
        <div
          style={{
            position: 'absolute',
            right: -size * 0.04,
            top: -size * 0.04,
            width: size * 0.34,
            height: size * 0.34,
            borderRadius: '50%',
            background: C.navy,
            border: `${size * 0.03}px solid ${C.paper}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${check})`,
          }}
        >
          <Check size={size * 0.2} color={C.white} strokeWidth={3.2} />
        </div>
      ) : null}
    </div>
  );
}

/** Small rounded label. `accent` fills it navy. */
export function Pill({ x, y, text, start = 0, accent = false, muted = false, size = 34 }: { x: number; y: number; text: string; start?: number; accent?: boolean; muted?: boolean; size?: number }) {
  const pop = usePop(start);
  return (
    <div
      style={{
        ...at(x, y, `scale(${0.7 + 0.3 * pop})`),
        opacity: Math.min(1, pop * 2),
        padding: `${size * 0.36}px ${size * 0.8}px`,
        borderRadius: 999,
        background: accent ? C.navy : C.card,
        border: accent ? 'none' : `2px solid ${C.line}`,
        color: accent ? C.white : muted ? C.muted : C.ink,
        fontFamily: FONT.body,
        fontWeight: 600,
        fontSize: size,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
}

/** White card that rises into place. */
export function Card({ x, y, width, height, start = 0, children }: { x: number; y: number; width: number; height: number; start?: number; children?: ReactNode }) {
  const t = useRamp(start, 26);
  return (
    <div
      style={{
        ...at(x, y + (1 - t) * 60),
        width,
        height,
        opacity: Math.min(1, t * 2),
        borderRadius: 36,
        background: C.card,
        border: `2px solid ${C.line}`,
        boxShadow: '0 24px 48px rgba(20,20,20,0.08)',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
}

/** Icon tile with a label, used for the places of the town. */
export function Tile({ x, y, icon: Icon, label, start, activeAt }: { x: number; y: number; icon: LucideIcon; label: string; start: number; activeAt: number }) {
  const frame = useCurrentFrame();
  const active = spring({ frame: frame - activeAt, fps: 30, config: { damping: 12, mass: 0.5, stiffness: 180 } });
  const underline = ramp(frame, activeAt, 20);
  return (
    <Card x={x} y={y} width={264} height={300} start={start}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
        <div style={{ transform: `scale(${1 + 0.12 * Math.sin(active * Math.PI)})` }}>
          <Icon size={112} color={C.ink} strokeWidth={1.5} />
        </div>
        <div style={{ position: 'relative', fontFamily: FONT.body, fontWeight: 600, fontSize: 40, color: C.ink }}>
          {label}
          <div style={{ position: 'absolute', left: 0, bottom: -10, height: 6, borderRadius: 3, width: `${underline * 100}%`, background: C.navy }} />
        </div>
      </div>
    </Card>
  );
}
