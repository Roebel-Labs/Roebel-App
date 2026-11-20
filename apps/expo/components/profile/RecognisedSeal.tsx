import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Props = { size?: number; style?: StyleProp<ViewStyle> };

/** Small round mark at a card's top right: an office the town recognises. Drawn with views. */
export default function RecognisedSeal({ size = 28, style }: Props) {
  const { colors } = useTheme();
  const tickW = Math.round(size * 0.22);
  const tickH = Math.round(size * 0.42);
  return (
    <View
      accessible
      accessibilityLabel="Offizielles Amt der Stadt"
      style={[
        styles.seal,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface, borderColor: colors.primary },
        style,
      ]}
    >
      <View
        style={[
          styles.tick,
          { width: tickW, height: tickH, borderColor: colors.primary, marginTop: -Math.round(size * 0.08) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  seal: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    borderRightWidth: 2.5,
    borderBottomWidth: 2.5,
    transform: [{ rotate: '45deg' }],
  },
});
