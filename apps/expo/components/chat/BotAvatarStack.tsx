import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { BotAvatarSpec } from '@/lib/chat/types';
import { BotAvatar } from './BotAvatar';

export type BotAvatarStackProps = {
  /** First three are drawn (top-center, bottom-left, bottom-right). */
  specs: BotAvatarSpec[];
  /** Outer box edge, same as a single list avatar (default 42). */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** Group avatar: three small mascots in a triangle (ref 6, row 2). */
export function BotAvatarStack({ specs, size = 42, style }: BotAvatarStackProps) {
  const s = Math.round(size * 0.56);
  const slots = [
    { left: (size - s) / 2, top: -size * 0.1 },
    { left: -size * 0.08, top: size * 0.44 },
    { left: size * 0.52, top: size * 0.44 },
  ];
  if (specs.length === 1) {
    return <BotAvatar spec={specs[0]} size={size} style={style} />;
  }
  if (specs.length === 2) {
    return (
      <View style={[{ width: size, height: size }, style]}>
        <BotAvatar spec={specs[0]} size={s} style={{ position: 'absolute', left: -size * 0.04, top: 0 }} />
        <BotAvatar spec={specs[1]} size={s} style={{ position: 'absolute', left: size * 0.48, top: size * 0.44 }} />
      </View>
    );
  }
  return (
    <View style={[{ width: size, height: size }, style]}>
      {specs.slice(0, 3).map((spec, i) => (
        <BotAvatar
          key={i}
          spec={spec}
          size={i === 2 ? Math.round(s * 0.88) : s}
          style={{ position: 'absolute', left: slots[i].left, top: slots[i].top + (i === 2 ? s * 0.06 : 0) }}
        />
      ))}
    </View>
  );
}

export default BotAvatarStack;
