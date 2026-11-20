/**
 * The settings row for the recovery words (visible only when the 'words' surface is open). Status
 * from this device's pool and the guardians on chain; no prompt.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Address } from 'viem';
import { useTheme } from '@/context/ThemeContext';
import { isPasskeySurfaceAllowed } from '@/lib/passkey/gate';
import { Card, passkeyStyles } from './PasskeyUi';

export default function RecoveryWordsEntry({ safe }: { safe: Address }) {
  const { colors } = useTheme();
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [on, setOn] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const ok = await isPasskeySurfaceAllowed('words').catch(() => false);
        if (cancelled) return;
        setAllowed(ok);
        if (!ok) return;
        const [{ readWordsStatus }, { readGuardianState, recoveryStorage }] = await Promise.all([
          import('@/lib/passkey/words-setup'),
          import('@/lib/passkey/guardians-runtime'),
        ]);
        const s = await readWordsStatus(safe, { storage: recoveryStorage, readState: readGuardianState }).catch(() => null);
        if (!cancelled && s) setOn(s.on);
      })();
      return () => {
        cancelled = true;
      };
    }, [safe]),
  );

  if (!allowed) return null;
  return (
    <Card>
      <Pressable onPress={() => router.push('/settings/recovery-words' as any)} accessibilityRole="button" style={styles.link}>
        <Text style={[passkeyStyles.label, { color: colors.primary }]}>
          {on ? 'Wiederherstellungswörter' : 'Wiederherstellungswörter einrichten'}
        </Text>
        {on ? (
          <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>Eingerichtet. Reichen allein aus, Wartezeit 3 Tage.</Text>
        ) : null}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  link: { gap: 4, minHeight: 48, justifyContent: 'center' },
});
