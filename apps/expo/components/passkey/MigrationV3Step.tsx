/**
 * Final migration step "Bürgerschaft auf deinen Passkey übertragen" (v3 `moveTo`). Hidden unless
 * EXPO_PUBLIC_PASSKEY_CITIZEN_NFT_V3 is set (isV3Enabled). Runs after the handover (the v3
 * contract checks legacy.isAdmin(safe)); one sponsored op in mode "legacy" built by
 * buildMigrationV3Calls (createAccount + handover are already done at this point, so the batch is
 * just the moveTo calls). After it the Safe itself holds citizenship (guardian ops → mode "safe").
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { MigrationRecord } from '@/lib/passkey/migration';
import { buildMigrationV3Calls, isV3Enabled, readIdentityTokens } from '@/lib/passkey/migration-v3';
import { planV3Move, type V3MovePlan } from '@/lib/passkey/guardian-plan';
import { readLegacyIsAdmin } from '@/lib/passkey/migration-runtime';
import { sendOwnSafeOp } from '@/lib/passkey/guardians-runtime';
import { BigButton, Card, Notice, friendlyError, passkeyStyles } from './PasskeyUi';

export default function MigrationV3Step({ record }: { record: MigrationRecord }) {
  const { colors } = useTheme();
  const [plan, setPlan] = useState<V3MovePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const enabled = isV3Enabled();
  const legacy = record.legacy;

  const load = useCallback(async () => {
    if (!enabled || !legacy) return;
    try {
      const [legacyTokens, safeTokens, safeIsAdmin] = await Promise.all([
        readIdentityTokens(legacy),
        readIdentityTokens(record.safe),
        readLegacyIsAdmin(legacy, record.safe).catch(() => false),
      ]);
      setPlan(planV3Move({ safeIsAdmin, legacy: legacyTokens, safe: safeTokens }));
    } catch (e) {
      setNotice({ tone: 'error', text: friendlyError(e, 'Der Status konnte nicht geladen werden.') ?? '' });
    }
  }, [enabled, legacy, record.safe]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  if (!enabled || !legacy) return null;

  const onMove = async () => {
    if (!plan || plan.kind !== 'move') return;
    setBusy(true);
    setNotice(null);
    try {
      const calls = buildMigrationV3Calls({
        legacy,
        safe: record.safe,
        needsDeploy: false,
        moveCitizen: plan.moveCitizen,
        moveAttester: plan.moveAttester,
      });
      await sendOwnSafeOp(record, { mode: 'legacy', legacy }, calls);
      setNotice({ tone: 'success', text: 'Fertig. Deine Bürgerschaft liegt jetzt bei deinem Passkey.' });
      await load();
    } catch (e) {
      const msg = friendlyError(e);
      if (msg) setNotice({ tone: 'error', text: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text style={[passkeyStyles.label, { color: colors.textPrimary }]}>Bürgerschaft auf deinen Passkey übertragen</Text>
      {!plan ? (
        <ActivityIndicator color={colors.primary} />
      ) : plan.kind === 'done' ? (
        <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>Erledigt. Deine Bürgerschaft liegt bei deinem Passkey.</Text>
      ) : plan.kind === 'nothingToMove' ? (
        <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>Hier gibt es nichts zu übertragen.</Text>
      ) : plan.kind === 'handoverFirst' ? (
        <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>Verbinde zuerst deinen Passkey (oben).</Text>
      ) : (
        <>
          <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>
            Deine Bürgerschaft zieht von deinem alten Konto auf deinen Passkey um. Ein Fingerabdruck, kostenlos.
          </Text>
          <BigButton label="Jetzt übertragen" busy={busy} onPress={onMove} />
        </>
      )}
      {notice?.text ? <Notice tone={notice.tone} text={notice.text} /> : null}
    </Card>
  );
}
