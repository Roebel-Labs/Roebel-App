/**
 * Settings → Passkey & Wiederherstellung (preview-gated screen): "Schlüssel sichern" and
 * "Nachrichten auf Passkey übertragen". Works from a thirdweb session (via this device's
 * migration record) and from a passkey session. Mounted only once the passkey is connected.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useActiveAccount } from 'thirdweb/react';
import type { Address } from 'viem';
import { useTheme } from '@/context/ThemeContext';
import { useXmtp } from '@/context/XmtpContext';
import { fontFamily } from '@/constants/theme';
import { passkeySessionOf } from '@/lib/passkey/active';
import type { PasskeySession } from '@/lib/passkey/session';
import { describeCompletion } from '@/lib/passkey/key-completion';
import type { Account } from 'thirdweb/wallets';
import ThirdwebConfirm from './ThirdwebConfirm';

type Status = { tone: 'info' | 'error' | 'success'; text: string } | null;

export default function KeysAndMessagesSection() {
  const { colors } = useTheme();
  const account = useActiveAccount();
  const { linkPasskey } = useXmtp();
  const [busy, setBusy] = useState<'keys' | 'messages' | null>(null);
  const [keysStatus, setKeysStatus] = useState<Status>(null);
  const [msgStatus, setMsgStatus] = useState<Status>(null);

  const session = useCallback(async (): Promise<PasskeySession | null> => {
    const rt = await import('@/lib/passkey/detach-runtime');
    return rt.actingPasskeySession(passkeySessionOf<PasskeySession>(account), account?.address as Address | undefined);
  }, [account]);

  // "Schlüssel sichern" completes MACI + Nostr (+ salt): what the device lacks is re-derived with
  // the thirdweb session (silent if stored on this device, else "Einmal mit Google/E-Mail bestätigen").
  const [needsThirdweb, setNeedsThirdweb] = useState(false);
  const onBackup = async (thirdwebAccount?: Account) => {
    if (busy) return;
    setBusy('keys');
    setKeysStatus(null);
    try {
      const s = await session();
      if (!s) throw new Error('Auf diesem Gerät ist kein verbundener Passkey eingerichtet.');
      const rt = await import('@/lib/passkey/key-completion-runtime');
      const r = await rt.completeKeysForSession(s, { activeAccount: account, thirdwebAccount });
      setNeedsThirdweb(r.status === 'needsThirdweb');
      setKeysStatus(describeCompletion(r));
    } catch (e) {
      setKeysStatus({ tone: 'error', text: e instanceof Error ? e.message : 'Sichern fehlgeschlagen.' });
    } finally {
      setBusy(null);
    }
  };

  const onLinkMessages = async () => {
    if (busy) return;
    setBusy('messages');
    setMsgStatus(null);
    try {
      const s = await session();
      if (!s) throw new Error('Auf diesem Gerät ist kein verbundener Passkey eingerichtet.');
      await linkPasskey(s);
      setMsgStatus({ tone: 'success', text: 'Deine privaten Nachrichten laufen jetzt auch über deinen Passkey.' });
    } catch (e) {
      setMsgStatus({ tone: 'error', text: e instanceof Error ? e.message : 'Übertragen fehlgeschlagen.' });
    } finally {
      setBusy(null);
    }
  };

  const tone = (s: Status) => (s?.tone === 'error' ? colors.error : s?.tone === 'success' ? colors.success : colors.textSecondary);

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Schlüssel sichern</Text>
        <Text style={[styles.small, { color: colors.textSecondary }]}>
          Dein Abstimmungs- und Nostr-Schlüssel (und deine Bürger-Bestätigung) werden verschlüsselt gesichert. Entsperren kann sie nur dein
          Passkey – so funktionieren sie auch auf einem neuen Gerät.
        </Text>
        <Pressable
          onPress={() => onBackup()}
          disabled={!!busy}
          accessibilityRole="button"
          style={[styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.5 : 1 }]}
        >
          {busy === 'keys' ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Schlüssel sichern</Text>}
        </Pressable>
        {keysStatus && <Text style={[styles.small, { color: tone(keysStatus) }]}>{keysStatus.text}</Text>}
        {needsThirdweb && <ThirdwebConfirm disabled={!!busy} onConfirmed={(tw) => void onBackup(tw)} />}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Nachrichten auf Passkey übertragen</Text>
        <Text style={[styles.small, { color: colors.textSecondary }]}>
          Dein verschlüsseltes Postfach bekommt deinen Passkey als zweiten Schlüssel. Danach kannst du private
          Nachrichten auch mit dem Passkey lesen und schreiben.
        </Text>
        <Pressable
          onPress={onLinkMessages}
          disabled={!!busy}
          accessibilityRole="button"
          style={[styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.5 : 1 }]}
        >
          {busy === 'messages' ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Übertragen</Text>}
        </Pressable>
        {msgStatus && <Text style={[styles.small, { color: tone(msgStatus) }]}>{msgStatus.text}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  card: { borderRadius: 16, padding: 16, gap: 10 },
  title: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  small: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19 },
  button: { borderRadius: 999, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: fontFamily.semiBold, fontSize: 15, color: '#fff' },
});
