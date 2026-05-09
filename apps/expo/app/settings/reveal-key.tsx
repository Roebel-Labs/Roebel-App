import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import { getProfiles, getUserEmail } from 'thirdweb/wallets/in-app';

import { useTheme } from '@/context/ThemeContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { client } from '@/constants/thirdweb';
import { shortenAddress } from '@/lib/governance-utils';
import { reconstructEoaPrivateKey } from '@/lib/wallet-key';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

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

  const [privateKey, setPrivateKey] = useState<`0x${string}` | null>(null);
  const [busy, setBusy] = useState(false);
  const [bioReady, setBioReady] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<{ provider: string; email?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok =
        (await LocalAuthentication.hasHardwareAsync()) &&
        (await LocalAuthentication.isEnrolledAsync());
      if (!cancelled) setBioReady(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Hide the key whenever the screen loses focus.
  useFocusEffect(
    useCallback(() => {
      return () => setPrivateKey(null);
    }, [])
  );

  // Hide the key if the user logs out while the screen is mounted.
  useEffect(() => {
    if (!account) setPrivateKey(null);
  }, [account]);

  const onCopy = async (value: string, label: string) => {
    await Clipboard.setStringAsync(value);
    showSnackbar({ message: `${label} kopiert` });
  };

  const onReveal = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (bioReady) {
        const r = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Privatschlüssel anzeigen',
          cancelLabel: 'Abbrechen',
        });
        if (!r.success) return;
      }
      const pk = await reconstructEoaPrivateKey();
      setPrivateKey(pk);
    } catch (e: any) {
      showSnackbar({
        message:
          e?.message === 'MISSING_SHARES'
            ? 'Schlüssel kann nicht rekonstruiert werden. Bitte erneut anmelden.'
            : 'Fehler beim Laden des Privatschlüssels.',
      });
    } finally {
      setBusy(false);
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

        {isInAppWallet && (
          <Section title="PRIVATER SCHLÜSSEL" colors={colors}>
            <View style={styles.keyContainer}>
              {privateKey ? (
                <>
                  <Text
                    selectable
                    style={[styles.keyText, { color: colors.textPrimary }]}
                  >
                    {privateKey}
                  </Text>
                  <View style={styles.keyActions}>
                    <Pressable
                      style={[styles.actionButton, { backgroundColor: colors.primary }]}
                      onPress={() => onCopy(privateKey, 'Privatschlüssel')}
                    >
                      <Ionicons name="copy-outline" size={16} color={colors.onPrimary} />
                      <Text style={[styles.actionLabel, { color: colors.onPrimary }]}>
                        Kopieren
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.actionButton,
                        { backgroundColor: colors.surfaceSecondary },
                      ]}
                      onPress={() => setPrivateKey(null)}
                    >
                      <Ionicons name="eye-off-outline" size={16} color={colors.textPrimary} />
                      <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>
                        Verbergen
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Pressable
                  style={[styles.revealBox, { borderColor: colors.borderSecondary }]}
                  onPress={onReveal}
                  disabled={busy}
                >
                  <Text
                    style={[styles.maskedKey, { color: colors.textTertiary }]}
                    numberOfLines={1}
                  >
                    {'•'.repeat(40)}
                  </Text>
                  <View style={styles.revealHint}>
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons
                        name={bioReady ? 'finger-print' : 'eye-outline'}
                        size={18}
                        color={colors.primary}
                      />
                    )}
                    <Text style={[styles.revealHintText, { color: colors.primary }]}>
                      {busy ? 'Lädt …' : 'Antippen zum Anzeigen'}
                    </Text>
                  </View>
                </Pressable>
              )}
            </View>
          </Section>
        )}

        <View style={styles.footerNote}>
          <Text style={[styles.footerNoteText, { color: colors.textTertiary }]}>
            Es gibt keine Recovery-Phrase. Importieren Sie diesen Schlüssel z. B. in MetaMask, um
            Ihr Wallet wiederherzustellen.
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },
  scrollContent: {
    paddingBottom: 40,
  },
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
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
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
  warningIcon: {
    marginRight: 10,
    marginTop: 1,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    lineHeight: 18,
  },
  sectionContainer: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionContent: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowText: {
    flex: 1,
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  rowAction: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyContainer: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  revealBox: {
    minHeight: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  maskedKey: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    letterSpacing: 2,
    marginBottom: 8,
  },
  revealHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  revealHintText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  keyText: {
    fontFamily: 'Courier',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  keyActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  footerNote: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  footerNoteText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  bottomSpacer: { height: 40 },
});
