import React from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  children: React.ReactNode;
  /** No top radius / shadow — used when nothing peeks out from behind. */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
};

export const SHEET_RADIUS = 24;

/**
 * The white content surface of the profile. Rounded top corners and an
 * upward shadow make it read as a sheet lying over the credential cards.
 */
export default function ProfileSheet({ children, flat = false, style }: Props) {
  const { colors, isDark } = useTheme();
  const { height } = useWindowDimensions();
  return (
    <View
      style={[
        styles.sheet,
        { backgroundColor: colors.background, minHeight: height },
        !flat && {
          borderTopLeftRadius: SHEET_RADIUS,
          borderTopRightRadius: SHEET_RADIUS,
          boxShadow: isDark ? '0px -8px 24px rgba(0,0,0,0.35)' : '0px -8px 24px rgba(0,0,0,0.10)',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingTop: 20,
    zIndex: 2,
  },
});
