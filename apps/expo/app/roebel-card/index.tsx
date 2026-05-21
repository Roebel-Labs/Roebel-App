// Röbel Card — entry point.
//
// Branches on the active account type:
//
//   - personal → <BuyerLanding>
//     "Interessiert" records the user's interest in the upcoming Röbel
//     Card by writing to the shared `card_interest` Supabase table (same
//     table the web landing modal writes to) via the
//     `buyer-card-interest` Edge Function. The Stripe purchase flow is
//     parked until the card launches. Shows "Meine Karte anzeigen" once
//     the buyer has a card. Also shows the "Ich habe eine Einladung"
//     claim link for employees.
//
//   - organisation → <OrgLanding>
//     Organisations don't buy voucher cards — they become partners who
//     accept them. Same visual layout as BuyerLanding but the primary
//     CTA says "Partner werden" (or "Zum Partner Dashboard" if the org
//     already has a roebel_card_partners row) and routes to
//     /roebel-card/partner-register or /roebel-card/partner. A secondary
//     link below the hero opens the Sachbezug / Mitarbeiter flow so
//     employers can still reach /roebel-card/employer without the
//     cards-for-sale UI in the way.
//
// The account type is read from AccountContext's `activeAccount`. If no
// active account is loaded yet (first render, context still populating)
// we fall back to BuyerLanding.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';

import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useRoebelCard } from '@/context/RoebelCardContext';
import { useBuyerCardInterest } from '@/hooks/useBuyerCardInterest';
import { openRoebelCardLearnMore } from '@/lib/roebel-card-checkout';
import { fetchPartnersByWallet } from '@/lib/supabase-roebel-card-partners';
import { formatEuros } from '@/lib/format-currency';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

const CARD_IMAGE = require('../../assets/images/card.png');

export default function RoebelCardEntryScreen() {
  const { card, isLoading, refresh } = useRoebelCard();
  const { activeAccount } = useAccount();
  const { colors } = useTheme();
  const router = useRouter();

  // Auto-refresh card state when the screen gains focus (e.g., after the
  // user comes back from the web checkout).
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Once the buyer has a card, skip the advertorial and go straight to
  // the "Meine Karte" screen. Replace so back-nav goes to profile, not
  // the ad page again.
  useEffect(() => {
    if (!isLoading && card !== null && activeAccount?.account_type !== 'organisation') {
      router.replace('/roebel-card/my-card' as any);
    }
  }, [isLoading, card, activeAccount, router]);

  if (activeAccount?.account_type === 'organisation') {
    return <OrgLanding />;
  }

  // While loading OR if the user has a card (redirect is imminent),
  // show a blank screen instead of flashing the advertorial.
  if (isLoading || card !== null) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return <BuyerLanding card={card} />;
}

// ---------------------------------------------------------------------------
// BuyerLanding — personal accounts
// ---------------------------------------------------------------------------

interface BuyerLandingProps {
  card: ReturnType<typeof useRoebelCard>['card'];
}

function BuyerLanding({ card }: BuyerLandingProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const interest = useBuyerCardInterest();

  const ctaDisabled =
    interest.status === 'submitting' ||
    interest.status === 'submitted' ||
    interest.status === 'loading';

  async function handleLearnMorePress() {
    try {
      await openRoebelCardLearnMore();
    } catch (err) {
      console.error('Failed to open Röbel Card learn-more page:', err);
    }
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
            Röbel{'\n'}Gutschein Card
          </Text>
          {card !== null && (
            <Text style={[styles.balanceLine, { color: colors.textSecondary }]}>
              Dein Guthaben: {formatEuros(card.balance_cents)}
            </Text>
          )}
        </View>

        <View style={styles.ctaWrapper}>
          <Pressable
            onPress={interest.submit}
            disabled={ctaDisabled}
            style={[
              styles.primaryButton,
              interest.isSubmitted
                ? styles.primaryButtonSubmitted
                : { backgroundColor: '#194383' },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              interest.isSubmitted
                ? 'Bereits als interessiert eingetragen'
                : 'Interessiert'
            }
            accessibilityState={{ disabled: interest.isSubmitted }}
          >
            {interest.status === 'submitting' ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: interest.isSubmitted ? '#194383' : '#ffffff' },
                ]}
              >
                {interest.isSubmitted ? 'Interessiert ✓' : 'Interessiert'}
              </Text>
            )}
          </Pressable>

          {interest.isSubmitted && (
            <Text style={[styles.thanksText, { color: colors.textSecondary }]}>
              Vielen Dank für Ihr Interesse.
            </Text>
          )}

          {interest.status === 'error' && interest.errorMessage && (
            <Text style={[styles.errorText, { color: '#c5221f' }]}>
              {interest.errorMessage}
            </Text>
          )}
        </View>

        <View style={styles.imageWrapper}>
          <Image
            source={CARD_IMAGE}
            style={styles.cardImage}
            resizeMode="contain"
            accessibilityLabel="Röbel Gutschein Card Vorschau"
          />
        </View>

        {card !== null && (
          <View style={styles.myCardWrapper}>
            <Pressable
              onPress={() => router.push('/roebel-card/my-card' as any)}
              style={[styles.myCardButton, { backgroundColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel="Meine Karte anzeigen"
            >
              <Text style={[styles.myCardButtonText, { color: colors.onPrimary }]}>
                Meine Karte anzeigen
              </Text>
            </Pressable>
          </View>
        )}

        <Pressable
          onPress={() => router.push('/roebel-card/claim-invite' as any)}
          style={styles.claimInviteLink}
          hitSlop={8}
        >
          <Text style={[styles.claimInviteText, { color: colors.textSecondary }]}>
            Ich habe eine Einladung von meinem Arbeitgeber
          </Text>
        </Pressable>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.background }}>
        <View style={[styles.bottomBar, { borderTopColor: colors.border }]}>
          <Pressable onPress={handleLearnMorePress} hitSlop={8}>
            <Text
              style={[styles.learnMoreText, { color: colors.textPrimary }]}
            >
              Mehr erfahren
            </Text>
          </Pressable>
          <Pressable
            onPress={interest.submit}
            disabled={ctaDisabled}
            style={[
              styles.primaryButtonCompact,
              interest.isSubmitted
                ? styles.primaryButtonCompactSubmitted
                : { backgroundColor: '#194383' },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              interest.isSubmitted
                ? 'Bereits als interessiert eingetragen'
                : 'Interessiert'
            }
            accessibilityState={{ disabled: interest.isSubmitted }}
          >
            {interest.status === 'submitting' ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: interest.isSubmitted ? '#194383' : '#ffffff' },
                ]}
              >
                {interest.isSubmitted ? 'Interessiert ✓' : 'Interessiert'}
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// OrgLanding — organisation accounts (can't buy, become partners)
// ---------------------------------------------------------------------------

function OrgLanding() {
  const router = useRouter();
  const { colors } = useTheme();
  const activeAccount = useActiveAccount();

  const [hasPartnerRecord, setHasPartnerRecord] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!activeAccount?.address) {
        setHasPartnerRecord(false);
        return;
      }
      const partners = await fetchPartnersByWallet(activeAccount.address);
      if (!cancelled) setHasPartnerRecord(partners.length > 0);
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [activeAccount?.address]);

  // Auto-redirect existing partners straight to the dashboard —
  // same pattern as the citizen → my-card redirect.
  useEffect(() => {
    if (hasPartnerRecord === true) {
      router.replace('/roebel-card/partner' as any);
    }
  }, [hasPartnerRecord, router]);

  // Show spinner while checking partner status (avoids advertorial flash).
  if (hasPartnerRecord === null || hasPartnerRecord === true) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const handlePartnerPress = () => {
    router.push('/roebel-card/partner-register' as any);
  };

  const handleEmployerPress = () => {
    router.push('/roebel-card/employer' as any);
  };

  async function handleLearnMorePress() {
    try {
      await openRoebelCardLearnMore();
    } catch (err) {
      console.error('Failed to open Röbel Card learn-more page:', err);
    }
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
            Röbel{'\n'}Gutschein Card
          </Text>
          <Text style={[styles.orgSubtitle, { color: colors.textSecondary }]}>
            Nimm Röbel Card Zahlungen in deinem Betrieb entgegen und erreiche
            mehr Kunden aus der Region.
          </Text>
        </View>

        <View style={styles.ctaWrapper}>
          <Pressable
            onPress={handlePartnerPress}
            style={[styles.primaryButton, { backgroundColor: '#194383' }]}
            accessibilityRole="button"
            accessibilityLabel={'Partner werden'}
          >
            <Text style={[styles.primaryButtonText, { color: '#ffffff' }]}>
              {'Partner werden'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.imageWrapper}>
          <Image
            source={CARD_IMAGE}
            style={styles.cardImage}
            resizeMode="contain"
            accessibilityLabel="Röbel Gutschein Card Vorschau"
          />
        </View>

        <Pressable
          onPress={handleEmployerPress}
          style={styles.sachbezugLink}
          hitSlop={8}
        >
          <Text style={[styles.sachbezugText, { color: colors.textSecondary }]}>
            🧾  Sachbezug für Mitarbeiter einrichten (§8 EStG)
          </Text>
        </Pressable>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.background }}>
        <View style={[styles.bottomBar, { borderTopColor: colors.border }]}>
          <Pressable onPress={handleLearnMorePress} hitSlop={8}>
            <Text
              style={[styles.learnMoreText, { color: colors.textPrimary }]}
            >
              Mehr erfahren
            </Text>
          </Pressable>
          <Pressable
            onPress={handlePartnerPress}
            style={[styles.primaryButtonCompact, { backgroundColor: '#194383' }]}
            accessibilityRole="button"
            accessibilityLabel={'Partner werden'}
          >
            <Text style={[styles.primaryButtonText, { color: '#ffffff' }]}>
              {'Partner werden'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    height: 56,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  hero: {
    marginTop: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 40,
    lineHeight: 44,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  orgSubtitle: {
    marginTop: 16,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  balanceLine: {
    marginTop: 12,
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  ctaWrapper: {
    marginTop: 32,
    paddingHorizontal: 48,
    alignItems: 'center',
  },
  primaryButton: {
    width: '100%',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonSubmitted: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#194383',
  },
  primaryButtonCompact: {
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  primaryButtonCompactSubmitted: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#194383',
  },
  primaryButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  thanksText: {
    marginTop: 12,
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
  errorText: {
    marginTop: 12,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  imageWrapper: {
    marginTop: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  cardImage: {
    width: '100%',
    height: 320,
  },
  myCardWrapper: {
    marginTop: 32,
    paddingHorizontal: 48,
    alignItems: 'center',
  },
  myCardButton: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  myCardButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  claimInviteLink: {
    marginTop: 32,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  claimInviteText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  sachbezugLink: {
    marginTop: 32,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  sachbezugText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  learnMoreText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    textDecorationLine: 'underline',
  },
});
