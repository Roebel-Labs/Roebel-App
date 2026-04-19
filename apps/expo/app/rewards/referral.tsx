import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { useTheme } from '@/context/ThemeContext';
import { useRewards } from '@/context/RewardsContext';
import { useUser } from '@/context/UserContext';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import ReferralShareCard from '@/components/rewards/ReferralShareCard';

const HERO = require('../../assets/illustration/gamification/stack.png');
const REFERRAL_BASE = 'https://www.roebel.app/r';

export default function ReferralScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { isConnected } = useUser();
  const { referralCode, referralStats, refresh, isLoading } = useRewards();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Freunde einladen
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Image source={HERO} style={styles.hero} resizeMode="contain" />

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Lade Freunde ein, gewinnt beide Münzen
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Teile deinen Einladungscode. Sobald dein Freund die App installiert und sich anmeldet,
          bekommt ihr beide Münzen.
        </Text>

        <View style={styles.statRow}>
          <StatPill
            label="Eingeladen"
            value={referralStats.total_invited}
            isDark={isDark}
            colors={colors}
          />
          <StatPill
            label="Verdient"
            value={`${referralStats.coins_earned} M`}
            isDark={isDark}
            colors={colors}
          />
        </View>

        {!isConnected ? (
          <View
            style={[
              styles.placeholder,
              {
                backgroundColor: isDark ? colors.surface : '#F9FAFB',
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
              Melde dich an, um deinen Einladungscode zu erhalten.
            </Text>
          </View>
        ) : referralCode ? (
          <ReferralShareCard code={referralCode} link={`${REFERRAL_BASE}/${referralCode}`} />
        ) : isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : null}

        <View style={styles.howItWorks}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            So funktioniert&apos;s
          </Text>
          <HowStep n={1} title="Teile deinen Code" body="Per WhatsApp, Link oder Kopieren" isDark={isDark} colors={colors} />
          <HowStep n={2} title="Freund installiert die App" body="Und öffnet deinen Link" isDark={isDark} colors={colors} />
          <HowStep n={3} title="Ihr bekommt beide Münzen" body="200 Münzen für dich, 100 für deinen Freund" isDark={isDark} colors={colors} />
        </View>

        <View style={styles.footerNote}>
          <Text style={[styles.footerText, { color: colors.textTertiary }]}>
            Missbrauch wird überprüft. Jeder neue Account kann nur einen Code einlösen.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatPill({
  label,
  value,
  isDark,
  colors,
}: {
  label: string;
  value: React.ReactNode;
  isDark: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View
      style={[
        statStyles.wrap,
        {
          backgroundColor: isDark ? colors.surface : '#FFFFFF',
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={[statStyles.label, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[statStyles.value, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function HowStep({
  n,
  title,
  body,
  isDark,
  colors,
}: {
  n: number;
  title: string;
  body: string;
  isDark: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={stepStyles.wrap}>
      <View
        style={[
          stepStyles.badge,
          { backgroundColor: isDark ? '#22324c' : '#EEF4FB' },
        ]}
      >
        <Text style={[stepStyles.n, { color: colors.primary }]}>{n}</Text>
      </View>
      <View style={stepStyles.textWrap}>
        <Text style={[stepStyles.title, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[stepStyles.body, { color: colors.textSecondary }]}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  hero: {
    width: 140,
    height: 140,
    alignSelf: 'center',
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 22,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
  },
  placeholder: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  placeholderText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    textAlign: 'center',
  },
  howItWorks: {
    gap: 10,
    marginTop: 8,
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
    marginBottom: 4,
  },
  footerNote: {
    marginTop: 8,
    alignItems: 'center',
  },
  footerText: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    textAlign: 'center',
  },
});

const statStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 2,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 20,
  },
});

const stepStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  n: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
  },
});
