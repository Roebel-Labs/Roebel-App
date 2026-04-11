// Röbel Card — buyer entry point.
//
// Everyone lands here, including business owners. The buyer advertising
// layout is the default. Org-account owners additionally see a "Für
// Unternehmen" section with two CTAs:
//   - "Partner werden" → /roebel-card/partner (if any owned org already has
//     a roebel_card_partners row) or /roebel-card/partner-register otherwise
//   - "Sachbezug für Mitarbeiter" → /roebel-card/employer
//
// Auto-redirect logic (session 1) was removed — a business owner may still
// want to buy a card themselves.
//
// Buyer branch states:
//   - card === null → advertising landing (screenshot reference)
//   - card !== null → placeholder balance view

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  openRoebelCardCheckout,
  openRoebelCardLearnMore,
} from '@/lib/roebel-card-checkout';
import { fetchPartnersByWallet } from '@/lib/supabase-roebel-card-partners';
import { formatEuros } from '@/lib/format-currency';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

const CARD_IMAGE = require('../../assets/images/card.png');

export default function RoebelCardEntryScreen() {
  const { card, refresh } = useRoebelCard();

  // Auto-refresh card state when the screen gains focus (e.g., after the
  // user comes back from the web checkout).
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return <BuyerLanding card={card} />;
}

// ---------------------------------------------------------------------------
// Buyer landing
// ---------------------------------------------------------------------------

interface BuyerLandingProps {
  card: ReturnType<typeof useRoebelCard>['card'];
}

function BuyerLanding({ card }: BuyerLandingProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const activeAccount = useActiveAccount();
  const { ownedAccounts } = useAccount();

  const hasOrgAccount = useMemo(
    () => ownedAccounts.some((a) => a.account_type === 'organisation'),
    [ownedAccounts],
  );

  // Check whether any owned org already has a roebel_card_partners row so
  // the "Partner werden" card can route straight to the dashboard instead
  // of re-starting the registration wizard.
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

  async function handleBuyPress() {
    if (!activeAccount?.address) {
      Alert.alert(
        'Wallet benötigt',
        'Bitte verbinde zuerst dein Wallet, um eine Röbel Card zu kaufen.',
      );
      return;
    }
    try {
      await openRoebelCardCheckout({
        walletAddress: activeAccount.address,
        locale: 'de',
      });
    } catch (err) {
      console.error('Failed to open Röbel Card checkout:', err);
    }
  }

  async function handleLearnMorePress() {
    try {
      await openRoebelCardLearnMore();
    } catch (err) {
      console.error('Failed to open Röbel Card learn-more page:', err);
    }
  }

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
          <Text style={[styles.comingSoonNote, { color: colors.textSecondary }]}>
            Die vollständige Kartenansicht (QR, Verlauf, Partner) kommt bald.
          </Text>
        )}

        {hasOrgAccount && (
          <View style={styles.businessSection}>
            <Text style={[styles.businessHeading, { color: colors.textSecondary }]}>
              Für Unternehmen
            </Text>
            <View style={styles.businessRow}>
              <BusinessCard
                emoji="🏪"
                title={hasPartnerRecord ? 'Partner Dashboard' : 'Partner werden'}
                subtitle="Annahme von Röbel Card"
                onPress={handlePartnerPress}
                colors={colors}
              />
              <BusinessCard
                emoji="🧾"
                title="Sachbezug"
                subtitle="§8 EStG bis 50 €/Monat"
                onPress={handleEmployerPress}
                colors={colors}
              />
            </View>
          </View>
        )}
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
    </SafeAreaView>
  );
}

function BusinessCard({
  emoji,
  title,
  subtitle,
  onPress,
  colors,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.businessCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Text style={styles.businessCardEmoji}>{emoji}</Text>
      <Text style={[styles.businessCardTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.businessCardSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
    </Pressable>
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
  comingSoonNote: {
    marginTop: 24,
    paddingHorizontal: 32,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  businessSection: {
    marginTop: 40,
    paddingHorizontal: 24,
  },
  businessHeading: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  businessRow: {
    flexDirection: 'row',
    gap: 12,
  },
  businessCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  businessCardEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  businessCardTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  businessCardSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
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
