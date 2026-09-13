// Credential explainer: the account's cards, swipeable, with what each unlocks.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { useVerificationContext } from '@/context/VerificationContext';
import { useIsCitizen } from '@/hooks/useIsCitizen';
import { CREDENTIAL_COPY, credentialKindsFor, type BenefitIcon, type CredentialKind } from '@/lib/credentials';
import CredentialCarousel from '@/components/profile/CredentialCarousel';
import CredentialQrSheet from '@/components/profile/CredentialQrSheet';
import CompleteCitizenDataBanner from '@/components/profile/CompleteCitizenDataBanner';
import VoteIcon from '@/assets/icons/delegate.svg';
import CoinsIcon from '@/assets/icons/coins-01.svg';
import OrgIcon from '@/assets/icons/community.svg';
import UploadIcon from '@/assets/icons/profile/upload.svg';
import SignatureIcon from '@/assets/icons/pencil.svg';
import ShieldIcon from '@/assets/icons/profile/shield-user.svg';
import CalendarIcon from '@/assets/icons/calendar-02.svg';
import ListingIcon from '@/assets/icons/package.svg';
import FeedbackIcon from '@/assets/icons/profile/sent.svg';
import ScanIcon from '@/assets/icons/qr-code.svg';
import TallyIcon from '@/assets/icons/check.svg';

const BENEFIT_ICONS: Record<BenefitIcon, React.ComponentType<{ width: number; height: number; color: string }>> = {
  vote: VoteIcon,
  coins: CoinsIcon,
  org: OrgIcon,
  upload: UploadIcon,
  signature: SignatureIcon,
  shield: ShieldIcon,
  calendar: CalendarIcon,
  listing: ListingIcon,
  feedback: FeedbackIcon,
  scan: ScanIcon,
  tally: TallyIcon,
};

const KINDS: CredentialKind[] = ['guest', 'citizen', 'attester'];

export default function CredentialExplainerScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { card } = useLocalSearchParams<{ card?: string }>();
  const isCitizen = useIsCitizen();
  const { hasAttesterNFT, userRequests, activePendingRequest } = useVerificationContext();

  // Front-first so the tapped card is the one on screen.
  const kinds = useMemo(
    () => [...credentialKindsFor({ isCitizen, isAttester: !!hasAttesterNFT })].reverse(),
    [hasAttesterNFT, isCitizen],
  );
  const requested = KINDS.includes(card as CredentialKind) ? (card as CredentialKind) : undefined;
  const initialKind = requested && kinds.includes(requested) ? requested : kinds[0];
  const [active, setActive] = useState<CredentialKind>(initialKind);
  const [showQr, setShowQr] = useState(false);

  const citizenRequest = userRequests.find((r: any) => r.nft_type === 'citizen') || null;
  const copy = CREDENTIAL_COPY[active];
  const tileBg = isDark ? colors.surfaceSecondary : '#F2F3F5';

  const onCta = () => {
    switch (copy.cta?.kind) {
      case 'become-citizen':
        router.push((activePendingRequest ? '/verification/my-request' : '/verification/request-citizen') as any);
        return;
      case 'show-qr':
        setShowQr(true);
        return;
      case 'scan':
        router.push('/verification/scan' as any);
        return;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
          hitSlop={12}
        >
          <ArrowLeftIcon size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <CredentialCarousel kinds={kinds} initialKind={initialKind} onActiveChange={setActive} />

        <Animated.View key={active} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.body}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{copy.title}</Text>
          <Text style={[styles.intro, { color: colors.textSecondary }]}>{copy.intro}</Text>

          {active === 'citizen' && <CompleteCitizenDataBanner embedded />}

          <View style={styles.benefits}>
            {copy.benefits.map((b) => {
              const Icon = BENEFIT_ICONS[b.icon];
              return (
                <View key={b.title} style={styles.benefit}>
                  <View style={[styles.benefitIcon, { backgroundColor: tileBg }]}>
                    <Icon width={20} height={20} color={colors.textPrimary} />
                  </View>
                  <View style={styles.benefitText}>
                    <Text style={[styles.benefitTitle, { color: colors.textPrimary }]}>{b.title}</Text>
                    <Text style={[styles.benefitDesc, { color: colors.textSecondary }]}>{b.desc}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {copy.cta && (
            <Pressable
              onPress={onCta}
              style={({ pressed }) => [styles.cta, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={copy.cta.label}
            >
              <Text style={[styles.ctaText, { color: colors.onPrimary }]}>{copy.cta.label}</Text>
            </Pressable>
          )}

          {active === 'citizen' && (
            <Text style={[styles.footnote, { color: colors.textSecondary }]}>
              Unser Verifizierungsprozess gleicht die Daten einer Person mit vertrauenswürdigen Drittquellen oder einem
              amtlichen Ausweis ab.{' '}
              <Text
                style={[styles.link, { color: colors.textPrimary }]}
                onPress={() => openBrowserAsync('https://www.roebel.app/buergerausweis')}
              >
                Mehr erfahren
              </Text>
            </Text>
          )}
        </Animated.View>
      </ScrollView>

      <CredentialQrSheet visible={showQr} onClose={() => setShowQr(false)} requestId={citizenRequest?.request_id ?? null} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: 8, paddingBottom: 48 },
  body: { paddingHorizontal: 16, paddingTop: 20, gap: 16 },
  title: { fontSize: 22, fontFamily: 'MonaSansSemiCondensed-Bold' },
  intro: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter-Regular' },
  benefits: { gap: 14, marginTop: 4 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  benefitText: { flex: 1, gap: 2 },
  benefitTitle: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  benefitDesc: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter-Regular' },
  cta: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  ctaText: { fontSize: 14, fontFamily: 'MonaSansSemiCondensed-Bold' },
  footnote: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter-Regular' },
  link: { fontFamily: 'Inter-Medium', textDecorationLine: 'underline' },
});
