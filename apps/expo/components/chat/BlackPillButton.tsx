import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { chatFont, chatSize, haloShadow, useChatTokens } from './tokens';

export type BlackPillButtonProps = {
  label: string;
  onPress: () => void;
  /** 'primary' = black pill; 'disabled' = grey #8E8E8E, not pressable. */
  variant?: 'primary' | 'disabled';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Full-width black pill CTA (refs 1, 2, 3, 19). */
export function BlackPillButton({ label, onPress, variant = 'primary', loading, style }: BlackPillButtonProps) {
  const t = useChatTokens();
  const disabled = variant === 'disabled' || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' ? haloShadow(t) : null,
        { backgroundColor: variant === 'disabled' ? t.disabledButton : t.primaryButton, opacity: pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={t.primaryButtonText} />
      ) : (
        <Text style={[styles.label, { color: variant === 'disabled' ? '#FFFFFF' : t.primaryButtonText }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: chatSize.pillButtonHeight,
    borderRadius: chatSize.pillButtonHeight / 2,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  label: { fontFamily: chatFont.semiBold, fontSize: 18, letterSpacing: -0.2 },
});

export default BlackPillButton;
