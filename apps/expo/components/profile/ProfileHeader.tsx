import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QrCodeIcon from '@/assets/icons/qr-code.svg';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

type Props = {
  title: string;
  /** Personal Profil: the QR scanner as a plain header icon (Figma node 3133:2201). */
  onQrPress?: () => void;
};

/**
 * Screen title plus optional header actions. "Account wechseln" moved to the floating contrast
 * pill above the bottom bar (components/ContrastPill).
 */
export default function ProfileHeader({ title, onQrPress }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
        {title}
      </Text>
      {onQrPress ? (
        <Pressable onPress={onQrPress} hitSlop={12} accessibilityRole="button" accessibilityLabel="QR-Code scannen">
          <QrCodeIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    flex: 1,
    fontSize: 30,
    fontFamily: fontFamily.heading,
  },
});
