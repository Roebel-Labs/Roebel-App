import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GlassCircleButton } from './GlassCircleButton';
import { useChatTokens } from './tokens';

export type ScrollToBottomButtonProps = { onPress: () => void; style?: StyleProp<ViewStyle> };

/** 38pt white circle with chevron-down (ref 16). Position it absolutely above the composer. */
export function ScrollToBottomButton({ onPress, style }: ScrollToBottomButtonProps) {
  const t = useChatTokens();
  return (
    <GlassCircleButton onPress={onPress} accessibilityLabel="Nach unten scrollen" size={38} style={style}>
      <Feather name="chevron-down" size={22} color={t.icon} />
    </GlassCircleButton>
  );
}

export default ScrollToBottomButton;
