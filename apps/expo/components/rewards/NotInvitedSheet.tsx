import React from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import BottomDrawer from '@/components/BottomDrawer';

const HERO_COIN = require('../../assets/illustration/muenzen/top_hero_coin.png');

interface NotInvitedSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The user's own address — shared so a citizen can invite them. */
  address?: string;
}

/**
 * Shown when a not-yet-invited user taps "Belohnungen erhalten". To receive
 * Röbel Münzen rewards a citizen must invite (trust) them first; this explains
 * that and lets them share their address.
 */
export default function NotInvitedSheet({ visible, onClose, address }: NotInvitedSheetProps) {
  const { colors } = useTheme();

  const onShare = async () => {
    if (!address) return;
    try {
      await Share.share({
        message: `Bitte lade mich zu Röbel ein, damit ich Belohnungen erhalten kann — meine Adresse: ${address}`,
      });
    } catch {
      /* user dismissed the share sheet */
    }
  };

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <Image source={HERO_COIN} style={styles.coin} resizeMode="contain" />
        <Text style={[styles.headline, { color: colors.textPrimary }]}>
          Lass dich einladen
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Um Belohnungen zu erhalten, muss dich zuerst ein Bürger aus Röbel einladen.
          Teile deine Adresse mit einem Bürger — sobald du eingeladen bist, tippe hier
          erneut.
        </Text>

        {address ? (
          <Pressable
            onPress={onShare}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Meine Adresse teilen"
          >
            <Text style={styles.ctaText}>Adresse teilen</Text>
          </Pressable>
        ) : null}

        <Pressable onPress={onClose} style={styles.closeBtn} accessibilityRole="button">
          <Text style={[styles.closeText, { color: colors.textSecondary }]}>Schließen</Text>
        </Pressable>
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  coin: {
    width: 124,
    height: 132,
    alignSelf: 'center',
  },
  headline: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 22,
    textAlign: 'center',
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  cta: {
    width: '100%',
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaText: {
    color: '#fff',
    fontFamily: 'MonaSansSemiCondensed-Bold',
    fontSize: 16,
  },
  closeBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
  },
});
