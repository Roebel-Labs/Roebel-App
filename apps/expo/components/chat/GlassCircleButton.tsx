import React from 'react';
import { Pressable, StyleSheet, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { chatSize, haloShadow, useChatTokens } from './tokens';

export type GlassCircleButtonProps = {
  /** Receives the press event so header menus can anchor a popover under the control. */
  onPress?: (e: GestureResponderEvent) => void;
  accessibilityLabel: string;
  children: React.ReactNode;
  /** Diameter, default 44 (refs). */
  size?: number;
  /** 'light' = white floating circle w/ halo; 'grey' = flat #F3F3F3 (sheet close); 'dark' = computer view. */
  tone?: 'light' | 'grey' | 'dark';
  style?: StyleProp<ViewStyle>;
};

/** Near-opaque white circle with the very soft, wide halo shadow (refs 4–16). */
export function GlassCircleButton({
  onPress,
  accessibilityLabel,
  children,
  size = chatSize.control,
  tone = 'light',
  style,
}: GlassCircleButtonProps) {
  const t = useChatTokens();
  const bg = tone === 'grey' ? t.closeCircle : tone === 'dark' ? '#1C1C1E' : t.surface;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={!onPress}
      onPress={(e) => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, transform: [{ scale: pressed ? 0.94 : 1 }] },
        tone === 'light' ? haloShadow(t) : null,
        tone === 'dark' ? styles.darkBorder : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  darkBorder: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#3A3A3C' },
});

export default GlassCircleButton;
