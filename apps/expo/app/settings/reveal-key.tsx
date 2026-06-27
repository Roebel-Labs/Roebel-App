import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { openBrowserAsync } from 'expo-web-browser';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import { getProfiles, getUserEmail } from 'thirdweb/wallets/in-app';

import { useTheme } from '@/context/ThemeContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { client } from '@/constants/thirdweb';
import { shortenAddress } from '@/lib/governance-utils';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

const REVEAL_URL = 'https://www.roebel.app/wallet/reveal';

const PROVIDER_LABELS: Record<string, string> = {
  email: 'E-Mail',
  google: 'Google',
  apple: 'Apple',
  facebook: 'Facebook',
  phone: 'Telefon',
  passkey: 'Passkey',
  guest: 'Gast',
};

export default function RevealKeyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { showSnackbar } = useSnackbar();
  const account = useActiveAccount();
  const wallet = useActiveWallet();

  const eoaAccount = wallet?.id === 'inApp' ? wallet.getAdminAccount?.() : undefined;
  const eoaAddress = eoaAccount?.address;
  const smartAddress = account?.address;
  const isInAppWallet = wallet?.id === 'inApp';

  const [profile, setProfile] = useState<{ provider: string; email?: string } | null>(null);

  useEffect(() => {
    if (!isInAppWallet) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const profiles = await getProfiles({ client });
        if (cancelled) return;
        const first = profiles[0];
        if (first) {
          const provider = (first as any).type ?? 'email';
          const email =
            (first as any).details?.email ?? (await getUserEmail({ client })) ?? undefined;
          setProfile({ provider, email });
        } else {
          const email = (await getUserEmail({ client })) ?? undefined;
          setProfile(email ? { provider: 'email', email } : null);
        }
      } catch {
        if (cancelled) return;
        setProfile(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isInAppWallet]);

  const onCopy = async (value: string, label: string) => {
    await Clipboard.setStringAsync(value);
    showSnackbar({ message: `${label} kopiert` });
  };

  const onOpenReveal = async () => {
    try {
      await openBrowserAsync(REVEAL_URL, {
        presentationStyle: undefined,
      });
    } catch {
      showSnackbar({ message: 'Browser konnte nicht geöffnet werden.' });
    }
  };

  const providerLabel = profile ? PROVIDER_LABELS[profile.provider] ?? profile.provider : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Wallet-Schlüssel</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.flex1} contentContainerStyle={styles.scrollContent}>
        <View
          style={[
            styles.warning,
            { backgroundColor: colors.errorBackground, borderColor: colors.error },
          ]}
        >
          <Ionicons name="warning" size={20} color={colors.error} style={styles.warningIcon} />
          <Text style={[styles.warningText, { color: colors.error }]}>
            Geben Sie Ihren Privatschlüssel niemals weiter. Wer ihn besitzt, kontrolliert Ihr Wallet
            vollständig.
          </Text>
        </View>

        <Section title="KONTO" colors={colors}>
          <Row
            label="Smart-Wallet Adresse"
            value={smartAddress ? shortenAddress(smartAddress) : '—'}
            colors={colors}
            onCopy={smartAddress ? () => onCopy(smartAddress, 'Adresse') : undefined}
            isLast={!isInAppWallet && !profile}
          />
          {isInAppWallet && (
            <Row
              label="EOA Signer Adresse"
              value={eoaAddress ? shortenAddress(eoaAddress) : '—'}
              colors={colors}
              onCopy={eoaAddress ? () => onCopy(eoaAddress, 'Adresse') : undefined}
              isLast={!profile}
            />
          )}
          {profile && (
            <Row
              label={`Verknüpft via ${providerLabel}`}
              value={profile.email ?? '—'}
              colors={colors}
              isLast
            />
          )}
        </Section>

        <Section title="PRIVATEN SCHLÜSSEL EXPORTIEREN" colors={colors}>
          <View style={styles.exportContent}>
            <Text style={[styles.exportLead, { color: colors.textPrimary }]}>
              Der Export erfolgt über die offizielle Thirdweb-Oberfläche im Browser.
            </Text>
            <View style={styles.steps}>
              <Step
                index={1}
                text="Im Browser mit derselben Anmeldemethode anmelden (z. B. gleiche E-Mail oder Google-Konto)."
                colors={colors}
              />
              <Step
                index={2}
                text="Auf die Wallet-Adresse oben rechts klicken."
                colors={colors}
              />
              <Step
                index={3}
                text='„Manage Wallet" → „Export Private Key" auswählen.'
                colors={colors}
              />
            </View>
            <Pressable
              style={[styles.cta, { backgroundColor: colors.primary }]}
              onPress={onOpenReveal}
            >
              <Ionicons name="open-outline" size={18} color={colors.onPrimary} />
              <Text style={[styles.ctaLabel, { color: colors.onPrimary }]}>
                Im Browser fortfahren
              </Text>
            </Pressable>
          </View>
        </Section>

        <View style={styles.footerNote}>
          <Text style={[styles.footerNoteText, { color: colors.textTertiary }]}>
            Es gibt keine Recovery-Phrase. Importieren Sie den Schlüssel z. B. in MetaMask, um Ihr
            Wallet wiederherzustellen.
          </Text>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

type SectionProps = {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useTheme>['colors'];
};

function Section({ title, children, colors }: SectionProps) {
  return (
    <View style={styles.sectionContainer}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      <View style={[styles.sectionContent, { backgroundColor: colors.surface }]}>{children}</View>
    </View>
  );
}

type RowProps = {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
  onCopy?: () => void;
  isLast?: boolean;
};

function Row({ label, value, colors, onCopy, isLast }: RowProps) {
  return (
    <View
      style={[
        styles.row,
        !isLast ? { borderBottomWidth: 1, borderBottomColor: colors.borderSecondary } : undefined,
      ]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text
          style={[styles.rowValue, { color: colors.textPrimary }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {value}
        </Text>
      </View>
      {onCopy && (
        <Pressable onPress={onCopy} hitSlop={8} style={styles.rowAction}>
          <Ionicons name="copy-outline" size={18} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

function Step({
  index,
  text,
  colors,
}: {
  index: number;
  text: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={styles.stepRow}>
      <View
        style={[
          styles.stepBullet,
          { backgroundColor: colors.primaryLight, borderColor: colors.primary },
        ]}
      >
        <Text style={[styles.stepBulletText, { color: colors.primary }]}>{index}</Text>
      </View>
      <Text style={[styles.stepText, { color: colors.textPrimary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: { fontSize: 18, fontFamily: 'MonaSansSemiCondensed-Medium'},
  headerSpacer: { width: 40 },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  warningIcon: { marginRight: 10, marginTop: 1 },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    lineHeight: 18,
  },
  sectionContainer: { paddingHorizontal: 16, paddingTop: 24 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionContent: { borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowText: { flex: 1, marginRight: 12 },
  rowLabel: { fontSize: 12, fontFamily: 'Inter-Regular', marginBottom: 2 },
  rowValue: { fontSize: 15, fontFamily: 'Inter-Medium' },
  rowAction: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportContent: { paddingHorizontal: 16, paddingVertical: 16 },
  exportLead: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    lineHeight: 20,
    marginBottom: 14,
  },
  steps: { gap: 10, marginBottom: 16 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepBullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBulletText: { fontSize: 12, fontFamily: 'Inter-SemiBold' },
  stepText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  ctaLabel: { fontSize: 15, fontFamily: 'MonaSansSemiCondensed-Bold'},
  footerNote: { paddingHorizontal: 16, paddingTop: 24 },
  footerNoteText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  bottomSpacer: { height: 40 },
});
