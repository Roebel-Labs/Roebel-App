// Röbel Card — entry point.
//
// Branches on the active account type:
//
//   - personal → <BuyerLanding>
//     "Jetzt kaufen" opens the TopUpBottomSheet which creates a Stripe
//     checkout session and credits the buyer's card. Shows "Meine Karte
//     anzeigen" once the buyer has a card. Also shows the
//     "Ich habe eine Einladung" claim link for employees.
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
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';

import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useRoebelCard } from '@/context/RoebelCardContext';
import { openRoebelCardLearnMore } from '@/lib/roebel-card-checkout';
import { fetchPartnersByWallet } from '@/lib/supabase-roebel-card-partners';
import { formatEuros } from '@/lib/format-currency';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import TopUpBottomSheet from '@/components/TopUpBottomSheet';

const CARD_IMAGE = require('../../assets/images/card.png');

export default function RoebelCardEntryScreen() {
  const { card, refresh } = useRoebelCard();
  const { activeAccount } = useAccount();

  // Auto-refresh card state when the screen gains focus (e.g., after the
  // user comes back from the web checkout).
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  if (activeAccount?.account_type === 'organisation') {
    return <OrgLanding />;
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
  const activeAccount = useActiveAccount();

  const [topUpVisible, setTopUpVisible] = useState(false);

  function handleBuyPress() {
    if (!activeAccount?.address) {
      Alert.alert(
        'Wallet benötigt',
        'Bitte verbinde zuerst dein Wallet, um eine Röbel Card zu kaufen.',
      );
      return;
    }
    setTopUpVisible(true);
  }

  function handleStripeDismissed() {
    // Stripe in-app browser was dismissed — send the user to the
    // polling success screen which watches for the webhook-driven
    // balance update.
    router.push('/roebel-card/topup-success' as any);
  }

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
            onPress={handleBuyPress}
            style={[styles.primaryButton, { backgroundColor: '#194383' }]}
            accessibilityRole="button"
            accessibilityLabel="Jetzt kaufen"
          >
            <Text style={[styles.primaryButtonText, { color: '#ffffff' }]}>
              Jetzt kaufen
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
            onPress={handleBuyPress}
            style={[styles.primaryButtonCompact, { backgroundColor: '#194383' }]}
            accessibilityRole="button"
            accessibilityLabel="Jetzt kaufen"
          >
            <Text style={[styles.primaryButtonText, { color: '#ffffff' }]}>
              Jetzt kaufen
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <TopUpBottomSheet
        visible={topUpVisible}
        walletAddress={activeAccount?.address ?? null}
        onClose={() => setTopUpVisible(false)}
        onStripeDismissed={handleStripeDismissed}
      />
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

  // Re-use the existing "any partner row for this wallet" check. For
  // MVP we don't strictly filter to the active org — if the wallet owns
  // multiple orgs and any of them is a partner, the CTA flips to
  // "Zum Partner Dashboard". A more precise check can come later.
  const [hasPartnerRecord, setHasPartnerRecord] = useState(false);

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

  const partnerCtaLabel = hasPartnerRecord ? 'Zum Partner Dashboard' : 'Partner werden';

  const handlePartnerPress = () => {
    router.push(
      hasPartnerRecord
        ? ('/roebel-card/partner' as any)
        : ('/roebel-card/partner-register' as any),
    );
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
            accessibilityLabel={partnerCtaLabel}
          >
            <Text style={[styles.primaryButtonText, { color: '#ffffff' }]}>
              {partnerCtaLabel}
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
            accessibilityLabel={partnerCtaLabel}
          >
            <Text style={[styles.primaryButtonText, { color: '#ffffff' }]}>
              {partnerCtaLabel}
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
  primaryButtonCompact: {
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
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
