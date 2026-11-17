/**
 * Ausweis prüfen: scan a shown code (or open with `?code=` from the general scanner), resolve it
 * once at the server, then verify it on this phone against the app's own register (./verify).
 * Shows only the result, the type, the organisation, the seal of a recognised office and the
 * validity: never a name, picture or address of the person.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { recoverClaimSigner } from '@netizen-labs/credential-registry';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import QRScanner, { type QRScanResult } from '@/components/QRScanner';
import RecognisedSeal from '@/components/profile/RecognisedSeal';
import LoginDrawer from '@/components/LoginDrawer';
import { CredentialScreenFrame, CredentialStatus, frameStyles } from '@/components/credentials/CredentialScreenFrame';
import { resolvePresentation } from '@/lib/credreg/api';
import { REGISTRY, fetchTypeMetadata, readHolding, registryReader, verifyAccountMessage } from '@/lib/credreg/chain';
import { useCredentialsGate } from '@/lib/credreg/gate';
import { verifyPresentation, type CheckResult } from '@/lib/credreg/verify';

type Check =
  | { code: string; status: 'loading' }
  | { code: string; status: 'done'; result: CheckResult }
  | { code: string; status: 'error'; message: string };

const GONE = 'Dieser Code ist abgelaufen oder wurde schon geprüft. Bitte lass dir einen neuen Code zeigen.';
const NO_CHECK = 'Der Ausweis konnte gerade nicht geprüft werden. Bitte versuche es noch einmal.';
const NO_NETWORK = 'Keine Verbindung. Bitte versuche es noch einmal.';

async function runCheck(account: NonNullable<ReturnType<typeof useActiveAccount>>, code: string): Promise<Check> {
  const res = await resolvePresentation(account, code);
  if (!res.ok) {
    return { code, status: 'error', message: res.code === 'NOT_FOUND' ? GONE : res.code === 'NETWORK_ERROR' ? NO_NETWORK : NO_CHECK };
  }
  try {
    const result = await verifyPresentation(res.data, {
      reader: registryReader(),
      recoverClaimSigner,
      metadata: fetchTypeMetadata,
      registry: REGISTRY,
      verifySignature: verifyAccountMessage,
      holding: readHolding,
      nowSec: () => Math.floor(Date.now() / 1000),
    });
    return { code, status: 'done', result };
  } catch {
    // A chain read, the signature check or the metadata failed: the code is used up, but
    // "Nicht gültig" would be wrong.
    return { code, status: 'error', message: NO_CHECK };
  }
}

function formatUntil(validUntil: number | null): string {
  if (validUntil === null) return 'Unbefristet';
  return `Gültig bis ${new Date(validUntil * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
}

export default function CheckCredentialScreen() {
  const { code: codeParam } = useLocalSearchParams<{ code?: string }>();
  const { colors } = useTheme();
  const account = useActiveAccount();
  const gate = useCredentialsGate();
  const [showLogin, setShowLogin] = useState(false);
  const [code, setCode] = useState<string | null>(typeof codeParam === 'string' && codeParam.length > 0 ? codeParam.toUpperCase() : null);
  const [check, setCheck] = useState<Check | null>(null);
  // A code is resolved once (the server hands it out once): never twice for the same code.
  const started = useRef<string | null>(null);
  const address = account?.address?.toLowerCase();

  useEffect(() => {
    if (gate !== true || !account || !code || started.current === code) return;
    started.current = code;
    let cancelled = false;
    setCheck({ code, status: 'loading' });
    runCheck(account, code)
      .then((c) => {
        if (!cancelled) setCheck(c);
      })
      .catch(() => {
        if (!cancelled) setCheck({ code, status: 'error', message: NO_CHECK });
      });
    return () => {
      cancelled = true;
    };
    // account identity changes on re-render; the address is what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, address, code]);

  const scanAgain = () => {
    started.current = null;
    setCheck(null);
    setCode(null);
  };

  const onScan = (r: QRScanResult) => {
    if (r.type === 'credential' && r.id) setCode(r.id);
  };

  if (gate === null) {
    return (
      <CredentialScreenFrame title="Ausweis prüfen">
        <CredentialStatus loading />
      </CredentialScreenFrame>
    );
  }
  if (gate === false) {
    return (
      <CredentialScreenFrame title="Ausweis prüfen">
        <CredentialStatus title="Noch nicht verfügbar" message="Ausweise prüfen gibt es in deiner App bald." />
      </CredentialScreenFrame>
    );
  }
  if (!account) {
    return (
      <CredentialScreenFrame title="Ausweis prüfen">
        <CredentialStatus
          title="Bitte melde dich an"
          message="Melde dich an, um einen Ausweis zu prüfen."
          actionLabel="Anmelden"
          onAction={() => setShowLogin(true)}
        />
        <LoginDrawer visible={showLogin && !account} onClose={() => setShowLogin(false)} />
      </CredentialScreenFrame>
    );
  }
  if (!code) {
    return (
      <CredentialScreenFrame title="Ausweis prüfen">
        <QRScanner onScan={onScan} allowedTypes={['credential']} />
      </CredentialScreenFrame>
    );
  }

  const shownCheck = check && check.code === code ? check : null;
  if (!shownCheck || shownCheck.status === 'loading') {
    return (
      <CredentialScreenFrame title="Ausweis prüfen">
        <CredentialStatus loading message="Ausweis wird geprüft …" />
      </CredentialScreenFrame>
    );
  }
  if (shownCheck.status === 'error') {
    return (
      <CredentialScreenFrame title="Ausweis prüfen">
        <CredentialStatus title="Nicht geprüft" message={shownCheck.message} actionLabel="Neuen Code scannen" onAction={scanAgain} />
      </CredentialScreenFrame>
    );
  }

  const r = shownCheck.result;
  const look =
    r.result === 'valid'
      ? { label: 'Gültig', color: colors.success, bg: colors.successBackground }
      : r.result === 'expired'
        ? { label: 'Abgelaufen', color: colors.warning, bg: colors.warningBackground }
        : r.result === 'revoked'
          ? { label: 'Widerrufen', color: colors.error, bg: colors.surface }
          : { label: 'Nicht gültig', color: colors.error, bg: colors.surface };

  return (
    <CredentialScreenFrame title="Ausweis prüfen">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.verdict, { backgroundColor: look.bg, borderColor: look.color }]} accessibilityRole="header">
          <Text style={[styles.verdictText, { color: look.color }]}>{look.label}</Text>
        </View>
        {r.title ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
            <View style={styles.titleRow}>
              <Text style={[styles.typeTitle, { color: colors.textPrimary }]}>{r.title}</Text>
              {r.result === 'valid' && r.recognised ? <RecognisedSeal size={24} /> : null}
            </View>
            {r.orgName ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{r.orgName}</Text> : null}
            {r.result === 'valid' ? (
              <Text style={[styles.meta, { color: colors.textSecondary }]}>{formatUntil(r.validUntil)}</Text>
            ) : null}
          </View>
        ) : null}
        {r.result === 'invalid' ? (
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            Dieser Code gehört nicht zu einem gültigen Ausweis dieses Kontos, oder er ist älter als fünf Minuten.
          </Text>
        ) : null}
        <Text style={[styles.note, { color: colors.textSecondary }]}>Die Prüfung bestätigt den Ausweis, nicht die Person.</Text>
        <Pressable
          onPress={scanAgain}
          style={[frameStyles.primary, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="Weiteren Ausweis prüfen"
        >
          <Text style={[frameStyles.primaryText, { color: colors.onPrimary }]}>Weiteren Ausweis prüfen</Text>
        </Pressable>
      </ScrollView>
    </CredentialScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 20 },
  verdict: { borderRadius: 20, borderWidth: 2, paddingVertical: 32, alignItems: 'center' },
  verdictText: { fontSize: 36, fontFamily: fontFamily.heading },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeTitle: { fontSize: 18, fontFamily: fontFamily.semiBold, flexShrink: 1 },
  meta: { fontSize: 14, fontFamily: fontFamily.regular },
  note: { fontSize: 14, fontFamily: fontFamily.regular, textAlign: 'center', lineHeight: 20 },
});
