import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { CREDENTIAL_COPY, type CredentialKind } from '@/lib/credentials';
import { softShadow } from '@/lib/shadow';
import { CARD_ASPECT, CARD_RADIUS_AT_462, CREDENTIAL_ART } from './credential-art';

type Props = {
  kind: CredentialKind;
  width: number;
  style?: StyleProp<ViewStyle>;
  shadow?: boolean;
};

export function cardHeightFor(width: number): number {
  return Math.round(width / CARD_ASPECT);
}

/** One credential card image at the given width (462:290 aspect). */
export default function CredentialCard({ kind, width, style, shadow = true }: Props) {
  const { isDark } = useTheme();
  const height = cardHeightFor(width);
  const radius = Math.round((CARD_RADIUS_AT_462 * width) / 462);
  return (
    <View
      style={[{ width, height, borderRadius: radius }, shadow && softShadow(2, isDark), style]}
      accessibilityRole="image"
      accessibilityLabel={CREDENTIAL_COPY[kind].title}
    >
      <Image
        source={CREDENTIAL_ART[kind]}
        style={[styles.image, { width, height, borderRadius: radius }]}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: 'transparent',
  },
});
