import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { useTheme } from '@/context/ThemeContext';
import { useRewards } from '@/context/RewardsContext';
import { useUser } from '@/context/UserContext';
import { redeemReferral } from '@/lib/supabase-rewards';
import { claimReward } from '@/lib/rewards-claim';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import ReferralShareCard from '@/components/rewards/ReferralShareCard';

const HERO = require('../../assets/illustration/gamification/stack.png');
const REFERRAL_BASE = 'https://www.roebel.app/r';

export default function ReferralScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { isConnected, user } = useUser();
  const { referralCode, referralStats, refresh, isLoading } = useRewards();

  const [redeemInput, setRedeemInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<
    { type: 'success' | 'error'; text: string } | null
  >(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const handleRedeem = useCallback(async () => {
    const code = redeemInput.trim().toUpperCase();
    const wallet = user?.wallet_address;
    if (!code || !wallet || redeeming) return;
    setRedeeming(true);
    setRedeemMsg(null);
    try {
      const res = await redeemReferral(code, wallet);
      if (res.success) {
        setRedeemInput('');
        setRedeemMsg({ type: 'success', text: 'Code eingelöst! Münzen gutgeschrieben.' });
        // Reward the REFERRER in Röbel Münzen for the successful invite (once per invited
        // person). Fire-and-forget; pays to the referrer once the funder is live.
        if (res.referrer) void claimReward(res.referrer, 'referral', wallet);
        await refresh();
      } else {
        const reason = res.error || 'unknown';
        const text =
          reason === 'already_redeemed'
            ? 'Du hast bereits einen Code eingelöst.'
            : reason === 'self_referral'
              ? 'Du kannst deinen eigenen Code nicht einlösen.'
              : reason === 'code_invalid'
                ? 'Dieser Code ist ungültig.'
                : 'Code konnte nicht eingelöst werden.';
        setRedeemMsg({ type: 'error', text });
      }
    } catch {
      setRedeemMsg({ type: 'error', text: 'Etwas ist schiefgelaufen. Versuch es erneut.' });
    } finally {
      setRedeeming(false);
    }
  }, [redeemInput, user?.wallet_address, redeeming, refresh]);

  // When the screen is reached via a fresh deep-link launch the nav stack
  // only contains this route, so router.back() goes to a blank screen. Fall
  // back to /profile in that case.
  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/profile' as any);
    }
  }, [router]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Pressable
          onPress={handleBack}
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

        {isConnected ? (
          <View
            style={[
              styles.redeemBox,
              {
                backgroundColor: isDark ? colors.surface : '#F9FAFB',
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.redeemTitle, { color: colors.textPrimary }]}>
              Hast du einen Einladungscode?
            </Text>
            <Text style={[styles.redeemHint, { color: colors.textSecondary }]}>
              Gib den Code aus deiner Einladung ein, um deinen Bonus zu erhalten.
            </Text>
            <View style={styles.redeemRow}>
              <TextInput
                value={redeemInput}
                onChangeText={(t) => setRedeemInput(t.toUpperCase())}
                placeholder="z. B. AB12CD"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                editable={!redeeming}
                style={[
                  styles.redeemInput,
                  {
                    color: colors.textPrimary,
                    borderColor: colors.border,
                    backgroundColor: isDark ? colors.background : '#FFFFFF',
                  },
                ]}
              />
              <Pressable
                onPress={handleRedeem}
                disabled={redeeming || redeemInput.trim().length === 0}
                style={({ pressed }) => [
                  styles.redeemBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity:
                      redeeming || redeemInput.trim().length === 0
                        ? 0.5
                        : pressed
                          ? 0.8
                          : 1,
                  },
                ]}
              >
                {redeeming ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.redeemBtnText}>Einlösen</Text>
                )}
              </Pressable>
            </View>
            {redeemMsg ? (
              <Text
                style={[
                  styles.redeemMsg,
                  { color: redeemMsg.type === 'success' ? '#1B873F' : '#D7263D' },
                ]}
              >
                {redeemMsg.text}
              </Text>
            ) : null}
          </View>
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
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
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
  redeemBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  redeemTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
  },
  redeemHint: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  redeemRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  redeemInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    letterSpacing: 2,
  },
  redeemBtn: {
    borderRadius: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
  },
  redeemBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  redeemMsg: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    marginTop: 2,
  },
  howItWorks: {
    gap: 10,
    marginTop: 8,
  },
  sectionTitle: {
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
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
