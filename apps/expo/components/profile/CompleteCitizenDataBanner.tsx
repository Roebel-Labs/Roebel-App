/**
 * CompleteCitizenDataBanner
 *
 * Shown to a verified citizen who hasn't stored their commitment preimage on this
 * device yet (e.g. bulk-minted during the Gnosis migration). Full card by default;
 * once dismissed it collapses to a slim persistent row that stays until completed.
 * Renders nothing once the citizen has enrolled (or isn't a citizen).
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { softShadow } from '@/lib/shadow';
import { useCitizenEnrollment } from '@/hooks/useCitizenEnrollment';

const ILLUSTRATION = require('@/assets/illustration/small/encryption.png');
const dismissKey = (addr: string) => `citizen-enroll-dismissed:${addr.toLowerCase()}`;

export default function CompleteCitizenDataBanner() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const account = useActiveAccount();
  const { needsEnrollment } = useCitizenEnrollment();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!account) {
          setDismissed(null);
          return;
        }
        const v = await AsyncStorage.getItem(dismissKey(account.address));
        if (!cancelled) setDismissed(v === '1');
      })();
      return () => {
        cancelled = true;
      };
    }, [account])
  );

  if (!needsEnrollment || dismissed === null) return null;

  const goComplete = () => router.push('/verification/complete-data' as any);
  const dismiss = async () => {
    if (account) await AsyncStorage.setItem(dismissKey(account.address), '1');
    setDismissed(true);
  };

  // Collapsed: slim persistent row that stays after dismissal.
  if (dismissed) {
    return (
      <Pressable
        onPress={goComplete}
        style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel="Angaben vervollständigen"
      >
        <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
        <Text style={[styles.rowLabel, { color: colors.textPrimary }]} numberOfLines={1}>
          Angaben vervollständigen
        </Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </Pressable>
    );
  }

  // Full banner card.
  return (
    <View style={[styles.card, { backgroundColor: colors.background }, softShadow(2, isDark)]}>
      <Pressable
        onPress={dismiss}
        hitSlop={10}
        style={styles.dismiss}
        accessibilityRole="button"
        accessibilityLabel="Ausblenden"
      >
        <Ionicons name="close" size={18} color={colors.textTertiary} />
      </Pressable>

      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Angaben vervollständigen</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
          Ergänzen Sie Ihre Daten — sicher und nur auf Ihrem Gerät.
        </Text>
        <Pressable
          onPress={goComplete}
          style={({ pressed }) => [styles.cta, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Jetzt ergänzen"
        >
          <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Jetzt ergänzen</Text>
        </Pressable>
      </View>

      <Image source={ILLUSTRATION} style={styles.illustration} resizeMode="contain" accessible={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    paddingLeft: 18,
    paddingRight: 8,
    paddingVertical: 16,
    marginHorizontal: 16,
    marginTop: 16,
    minHeight: 132,
  },
  dismiss: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
    gap: 10,
    paddingVertical: 4,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    lineHeight: 24,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  cta: {
    alignSelf: 'flex-start',
    height: 36,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  ctaText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
  },
  illustration: {
    width: 96,
    height: 96,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 16,
  },
  rowLabel: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 15,
  },
});
