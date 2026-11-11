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
  /**
   * Set when someone HAS invited the user but is still saving the Münzen the invitation costs
   * them: their name (null = unknown). Undefined = nobody has invited the user yet.
   */
  savingInviterName?: string | null;
}

/**
 * Shown when a user taps "Belohnungen erhalten" and cannot join yet: either nobody has invited
 * them, or their inviter is still saving up. Explains the neighbour-to-neighbour invitation and
 * lets them ask for one (no wallet address is ever shown or shared).
 */
export default function NotInvitedSheet({ visible, onClose, savingInviterName }: NotInvitedSheetProps) {
  const { colors } = useTheme();
  const inviterSaving = savingInviterName !== undefined;

  const onShare = async () => {
    try {
      await Share.share({
        message:
          'Ich möchte bei den Röbel Münzen mitmachen. Lädst du mich ein? ' +
          'In der Röbel App: „Belohnungen“ → „Nachbarn einladen“ → meinen Namen antippen.',
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
          {inviterSaving ? 'Deine Einladung ist unterwegs' : 'Lass dich einladen'}
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {inviterSaving
            ? `${savingInviterName ?? 'Ein:e Nachbar:in'} hat dich eingeladen und spart gerade noch die Münzen an, die eine Einladung kostet. Das dauert meist nur ein paar Tage. Schau dann wieder vorbei und tippe erneut.`
            : 'Röbel Münzen wachsen von Mensch zu Mensch: Wer schon sammelt, lädt die Nächsten ein. Bitte eine:n Nachbar:in, der oder die schon dabei ist, dich einzuladen. Danach tippst du hier erneut und startest mit 48 Röbel Münzen.'}
        </Text>

        <Pressable
          onPress={onShare}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Um eine Einladung bitten"
        >
          <Text style={styles.ctaText}>
            {inviterSaving ? 'Jemand anderen fragen' : 'Um Einladung bitten'}
          </Text>
        </Pressable>

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
