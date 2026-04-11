// Röbel Card — buyer entry point.
//
// Branches by role:
//   - partner  → redirect to /roebel-card/partner
//   - employer → redirect to /roebel-card/employer
//   - buyer    → <BuyerLanding>
//
// For the foundations session (2026-04-11) the partner/employer stubs are
// "Bald verfügbar" placeholders. A later session will fill them in.
//
// The buyer branch has two states:
//   - card === null → advertising landing page (screenshot reference)
//   - card !== null → placeholder balance view (full card UI lands later)

import React, { useCallback, useEffect } from 'react';
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
import { deriveRoebelCardRole } from '@/lib/roebel-card-role';
import {
  openRoebelCardCheckout,
  openRoebelCardLearnMore,
} from '@/lib/roebel-card-checkout';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

const CARD_IMAGE = require('../../assets/images/card.png');

export default function RoebelCardEntryScreen() {
  const router = useRouter();
  const { card, refresh } = useRoebelCard();
  const { activeAccount } = useAccount();

  // For this session, there's no partner or employer detection yet — both
  // inputs are false. The role derivation always returns 'buyer' until the
  // partner/employer flows land in later sessions.
  const role = deriveRoebelCardRole({
    hasApprovedPartnerRecord: false,
    hasActiveEmployerPurchases: false,
  });

  useEffect(() => {
    if (role === 'partner') {
      router.replace('/roebel-card/partner' as any);
    } else if (role === 'employer') {
      router.replace('/roebel-card/employer' as any);
    }
  }, [role, router]);

  // Auto-refresh card state when the screen gains focus (e.g., after the
  // user comes back from the web checkout).
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  if (role !== 'buyer') {
    // While the redirect happens we render nothing to avoid a flash.
    return null;
  }

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
  const { colors, isDark } = useTheme();
  const activeAccount = useActiveAccount();

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

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      {/* Header — back arrow only, no title, no border. */}
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
              Dein Guthaben: {formatCents(card.balance_cents)} €
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
      </ScrollView>

      {/* Bottom bar — "Mehr erfahren" on the left, compact "Jetzt kaufen" right. */}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.background }}>
        <View style={[styles.bottomBar, { borderTopColor: colors.border }]}>
          <Pressable onPress={handleLearnMorePress} hitSlop={8}>
            <Text
              style={[
                styles.learnMoreText,
                { color: colors.textPrimary },
              ]}
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

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
