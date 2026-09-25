import React, { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect } from 'react-native-svg';
import type { BotAvatarSpec, BotEyes, BotShape } from '@/lib/chat/types';
import { useChatTokens } from './tokens';

/** Palette sampled from the reference mascots. */
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

export const BOT_SHAPES: BotShape[] = [
  'circle',
  'cloud',
  'drop',
  'hexagon',
  'squircle',
  'pill',
  'triangle',
  'egg',
  'blob',
];

export const BOT_EYES: BotEyes[] = ['dots', 'dashes', 'wink', 'happy'];

type Pt = [number, number];
type Stroke = { a: Pt; b: Pt; w: number };

// Per-shape anchors (viewBox 0..100): `dots` sit small in the upper right like
// the Design / Inbox refs; the other eye sets sit on the visual face center.
const ANCHORS: Record<BotShape, { dots: Pt; face: Pt; scale: number }> = {
  circle: { dots: [70, 30], face: [58, 58], scale: 1 },
  cloud: { dots: [68, 42], face: [52, 64], scale: 1 },
  drop: { dots: [64, 62], face: [52, 72], scale: 1 },
  hexagon: { dots: [66, 40], face: [52, 58], scale: 1 },
  squircle: { dots: [70, 34], face: [56, 56], scale: 1 },
  pill: { dots: [74, 36], face: [54, 52], scale: 0.8 },
  triangle: { dots: [56, 58], face: [50, 66], scale: 0.85 },
  egg: { dots: [64, 40], face: [50, 58], scale: 0.95 },
  blob: { dots: [72, 40], face: [56, 54], scale: 1 },
};

function eyeStrokes(shape: BotShape, eyes: BotEyes): Stroke[] {
  const { dots, face, scale: s } = ANCHORS[shape];
  const at = (o: Pt, dx: number, dy: number): Pt => [o[0] + dx * s, o[1] + dy * s];
  switch (eyes) {
    case 'dots':
      // Two small rounded capsules, leaning slightly like ' '
      return [
        { a: at(dots, -7, -5), b: at(dots, -6, 4), w: 6.5 * s },
        { a: at(dots, 5, -5), b: at(dots, 7, 4), w: 6.5 * s },
      ];
    case 'dashes':
      // Two thick slanted capsules (the orange drop / green cloud)
      return [
        { a: at(face, -8, -11), b: at(face, -12, 11), w: 13 * s },
        { a: at(face, 13, -9), b: at(face, 8, 11), w: 13 * s },
      ];
    case 'wink':
      // '  \  — short left stroke, longer right stroke slanting down
      return [
        { a: at(face, -8, -14), b: at(face, -10, -5), w: 7 * s },
        { a: at(face, 9, -18), b: at(face, 18, -9), w: 7 * s },
      ];
    case 'happy':
      // \ /  — a V like the typing mascot
      return [
        { a: at(face, -12, -18), b: at(face, -3, -3), w: 7 * s },
        { a: at(face, 18, -19), b: at(face, 13, -3), w: 7 * s },
      ];
  }
}

function hexPoints(): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const ang = ((-90 - 8 + i * 60) * Math.PI) / 180;
    pts.push(`${(50 + 43 * Math.cos(ang)).toFixed(2)},${(50 + 43 * Math.sin(ang)).toFixed(2)}`);
  }
  return pts.join(' ');
}
const HEX = hexPoints();

function ShapeBody({ shape, color }: { shape: BotShape; color: string }) {
  switch (shape) {
    case 'circle':
      return <Circle cx={50} cy={50} r={49} fill={color} />;
    case 'cloud':
      return (
        <G fill={color}>
          <Circle cx={28} cy={46} r={19} />
          <Circle cx={53} cy={36} r={25} />
          <Circle cx={76} cy={48} r={19} />
          <Circle cx={14} cy={66} r={13} />
          <Circle cx={86} cy={66} r={13} />
          <Ellipse cx={50} cy={68} rx={42} ry={25} />
          <Circle cx={34} cy={76} r={17} />
          <Circle cx={66} cy={76} r={17} />
        </G>
      );
    case 'drop':
      return (
        <Path
          fill={color}
          d="M50 3 Q54 3 58 8 L82 38 Q88 46 88 60 A38 38 0 0 1 12 60 Q12 46 18 38 L42 8 Q46 3 50 3 Z"
        />
      );
    case 'hexagon':
      return (
        <Polygon points={HEX} fill={color} stroke={color} strokeWidth={12} strokeLinejoin="round" />
      );
    case 'squircle':
      return <Rect x={8} y={10} width={84} height={80} rx={24} fill={color} transform="rotate(-5 50 50)" />;
    case 'pill':
      return <Rect x={2} y={18} width={96} height={64} rx={31} fill={color} />;
    case 'triangle':
      return (
        <Polygon
          points="50,14 90,84 10,84"
          fill={color}
          stroke={color}
          strokeWidth={18}
          strokeLinejoin="round"
        />
      );
    case 'egg':
      return (
        <Path
          fill={color}
          transform="rotate(-15 50 52)"
          d="M50 4 C73 4 90 40 90 61 C90 84 72 98 50 98 C28 98 10 84 10 61 C10 40 27 4 50 4 Z"
        />
      );
    case 'blob':
      return (
        <Path
          fill={color}
          transform="rotate(-10 50 50)"
          d="M52 9 C78 9 96 27 95 53 C94 78 76 93 50 92 C24 91 5 78 6 55 C7 29 26 9 52 9 Z"
        />
      );
  }
}

function EyeLines({ shape, eyes, color = '#FFFFFF' }: { shape: BotShape; eyes: BotEyes; color?: string }) {
  return (
    <G>
      {eyeStrokes(shape, eyes).map((s, i) => (
        <Line
          key={i}
          x1={s.a[0]}
          y1={s.a[1]}
          x2={s.b[0]}
          y2={s.b[1]}
          stroke={color}
          strokeWidth={s.w}
          strokeLinecap="round"
        />
      ))}
    </G>
  );
}

export type BotAvatarProps = {
  spec: BotAvatarSpec;
  size: number;
  /** Green presence dot bottom-right with a ring in the background color. */
  online?: boolean;
  /** Render only the body (used by TypingIndicator to animate the eyes separately). */
  hideEyes?: boolean;
  style?: StyleProp<ViewStyle>;
};

function BotAvatarImpl({ spec, size, online, hideEyes, style }: BotAvatarProps) {
  const t = useChatTokens();
  const dot = Math.max(8, Math.round(size * 0.26));
  const ring = size >= 36 ? 2.5 : 2;
  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <ShapeBody shape={spec.shape} color={spec.color} />
        {hideEyes ? null : <EyeLines shape={spec.shape} eyes={spec.eyes} />}
      </Svg>
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

/** Eyes-only layer at the same geometry as <BotAvatar>, for animating. */
export function BotEyesLayer({ spec, size }: { spec: BotAvatarSpec; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <EyeLines shape={spec.shape} eyes={spec.eyes} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  dot: { position: 'absolute' },
});
