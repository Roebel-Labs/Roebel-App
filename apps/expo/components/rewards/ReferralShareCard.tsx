import React from 'react';
import {
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { buildReferralShareMessage } from '@/lib/supabase-rewards';

interface ReferralShareCardProps {
  code: string;
  link: string;
}

export default function ReferralShareCard({ code, link }: ReferralShareCardProps) {
  const { colors, isDark } = useTheme();
  const { showSnackbar } = useSnackbar();

  const copy = async () => {
    await Clipboard.setStringAsync(link);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    showSnackbar({ message: 'Link kopiert' });
  };

  const openWhatsApp = async () => {
    const message = buildReferralShareMessage(code);
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      // Fall back to the system share sheet.
      await Share.share({ message });
    }
  };

  const openShare = async () => {
    const message = buildReferralShareMessage(code);
    await Share.share({ message });
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: isDark ? colors.surface : '#FFFFFF', borderColor: colors.border },
      ]}
    >
      <Text style={[styles.caption, { color: colors.textSecondary }]}>
        Dein Einladungscode
      </Text>
      <Pressable
        onPress={copy}
        style={({ pressed }) => [
          styles.codePill,
          {
            backgroundColor: isDark ? '#22324c' : '#EEF4FB',
            borderColor: colors.primary,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text style={[styles.code, { color: colors.primary }]}>{code}</Text>
        <Text style={[styles.copyHint, { color: colors.textSecondary }]}>Zum Kopieren tippen</Text>
      </Pressable>
      <View style={styles.buttons}>
        <Pressable
          onPress={openWhatsApp}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: '#25D366', opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.primaryText}>WhatsApp teilen</Text>
        </Pressable>
        <Pressable
          onPress={openShare}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>
            Mehr Optionen
          </Text>
        </Pressable>
      </View>
      <Pressable
        onPress={copy}
        style={({ pressed }) => [
          styles.linkRow,
          {
            backgroundColor: isDark ? colors.surfaceSecondary : '#F9FAFB',
            borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={[styles.linkText, { color: colors.textSecondary }]} numberOfLines={1}>
          {link}
        </Text>
        <Text style={[styles.linkAction, { color: colors.primary }]}>Kopieren</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  caption: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  codePill: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 2,
  },
  code: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 28,
    letterSpacing: 1,
  },
  copyHint: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  linkText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 12,
  },
  linkAction: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
  },
});
