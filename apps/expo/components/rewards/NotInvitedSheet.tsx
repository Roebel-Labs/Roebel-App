import React from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { openBrowserAsync } from 'expo-web-browser';
import { useTheme } from '@/context/ThemeContext';
import BottomDrawer from '@/components/BottomDrawer';
import { gnosisReferralUrl } from '@/constants/gnosis';

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
          Um Röbel Münzen zu sammeln, muss dich zuerst ein:e Bürger:in aus Röbel einladen.
          Teile deine Adresse — sobald du eingeladen bist, tippe hier erneut.
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

        <Pressable
          onPress={() => { void openBrowserAsync(gnosisReferralUrl); }}
          style={({ pressed }) => [
            styles.secondaryCta,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Gnosis App öffnen"
        >
          <Text style={[styles.secondaryCtaText, { color: colors.textPrimary }]}>
            Alternativ: Gnosis App ausprobieren
          </Text>
        </Pressable>
        <Text style={[styles.finePrint, { color: colors.textTertiary }]}>
          Die Gnosis App ist ein eigenes Konto außerhalb der Röbel App — dein Guthaben dort
          erscheint nicht hier.
        </Text>

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
  secondaryCta: {
    width: '100%',
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryCtaText: {
    fontFamily: 'MonaSansSemiCondensed-Bold',
    fontSize: 15,
  },
  finePrint: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 8,
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
