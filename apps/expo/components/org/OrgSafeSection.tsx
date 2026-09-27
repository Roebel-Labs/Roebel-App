import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { prepareTransaction, sendBatchTransaction, sendTransaction, waitForReceipt } from 'thirdweb';
import { useActiveAccount } from 'thirdweb/react';
import type { Address, Hex } from 'viem';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { client } from '@/constants/thirdweb';
import { gnosis, orgRegistryGnosisAddress } from '@/constants/gnosis';
import BottomDrawer from '@/components/BottomDrawer';
import { fetchMembersWithProfiles, leaveOrg } from '@/lib/supabase-member-management';
import type { MemberWithProfile } from '@/lib/types';
import { isOrgSafePreviewAllowed } from '@/lib/org-safe/gate';
import { isDeployed, orgsNeedingSafe, readOrgChainState, readOrgSafeStatus, rememberOrgSafe, type OrgSafeStatus } from '@/lib/org-safe/chain';
import { fetchOwnedOrgsWithOwners, type OwnedOrg } from '@/lib/org-safe/members';
import {
  createAndRequestCalls,
  isInSync,
  leaveBlocker,
  leaveSafeCall,
  orgIdFromUuid,
  orgRegistryWriteAbi,
  planBulkDeploy,
  planSync,
  safeExecCall,
  syncCall,
  type Call,
  type OrgChainState,
} from '@/lib/org-safe/ops';
import { encodeFunctionData } from 'viem';

type Props = { accountId: string; accountName: string };

/**
 * "Onchain-Organisation" — NSP-14 preview. Lets an org owner:
 *   1. create the org's Safe (owners = the org's owners) and apply for registration,
 *   2. after attester approval, carry owners/admins/members into the Safe + registry,
 *   3. hand over: remove themself from the Safe and leave the org.
 */
export default function OrgSafeSection({ accountId, accountName }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const { gnosisAccount } = useGnosisWallet();
  const signer = useActiveAccount();
  const { ownedAccounts, switchAccount } = useAccount();

  const [allowed, setAllowed] = useState(false);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [status, setStatus] = useState<OrgSafeStatus | null>(null);
  const [chain, setChain] = useState<OrgChainState | null>(null);
  const [busy, setBusy] = useState<null | 'create' | 'request' | 'sync' | 'leave' | 'bulk'>(null);
  const [pendingOrgs, setPendingOrgs] = useState<OwnedOrg[]>([]);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const me = gnosisAccount?.address?.toLowerCase() ?? '';
  const orgId = useMemo<Hex>(() => orgIdFromUuid(accountId), [accountId]);
  const registry = orgRegistryGnosisAddress as Address;

  useEffect(() => {
    let cancelled = false;
    isOrgSafePreviewAllowed().then((ok) => !cancelled && setAllowed(ok));
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const m = await fetchMembersWithProfiles(accountId);
    setMembers(m);
    const s = await readOrgSafeStatus(
      orgId,
      m.filter((x) => x.role === 'owner').map((x) => x.wallet_address),
    );
    setStatus(s);
    if (s.kind === 'registered') {
      const accounts = [...m.map((x) => x.wallet_address), ...(me ? [me] : [])];
      setChain(await readOrgChainState(orgId, s.safe, accounts));
    } else {
      setChain(null);
    }
    if (me) {
      const owned = await fetchOwnedOrgsWithOwners(me);
      const need = new Set((await orgsNeedingSafe(owned)).map((o) => o.uuid));
      setPendingOrgs(owned.filter((o) => need.has(o.uuid)));
    }
  }, [accountId, orgId, me]);

  useEffect(() => {
    if (!allowed) return;
    load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [allowed, load]);

  const myRole = members.find((m) => m.wallet_address.toLowerCase() === me)?.role;
  const owners = members.filter((m) => m.role === 'owner');
  const plan = useMemo(() => (chain ? planSync(chain, members) : null), [chain, members]);
  const blocker = chain && me ? leaveBlocker(chain, members, me) : null;
  const iAmSafeOwner = !!chain?.owners.some((o) => o.toLowerCase() === me);

  if (!allowed || myRole !== 'owner') return null;

  const nameOf = (wallet: string) =>
    members.find((m) => m.wallet_address.toLowerCase() === wallet.toLowerCase())?.user?.username ?? 'weitere Person';

  const send = async (calls: Call[]) => {
    if (!gnosisAccount) throw new Error('Kein Wallet verbunden');
    const txs = calls.map((c) => prepareTransaction({ to: c.to, data: c.data, chain: gnosis, client }));
    const result =
      txs.length === 1
        ? await sendTransaction({ transaction: txs[0], account: gnosisAccount })
        : await sendBatchTransaction({ transactions: txs, account: gnosisAccount });
    await waitForReceipt(result);
  };

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      console.error(`org-safe ${kind} failed`, e);
      setError(e instanceof Error ? e.message : 'Transaktion fehlgeschlagen');
    } finally {
      setBusy(null);
    }
  };

  const onCreate = () =>
    run('create', async () => {
      const ownerWallets = owners.map((o) => o.wallet_address);
      const plan1 = createAndRequestCalls({ orgUuid: accountId, owners: ownerWallets, executor: me, registry });
      const deployed = await isDeployed(plan1.safe);
      const { safe, calls } = createAndRequestCalls({
        orgUuid: accountId,
        owners: ownerWallets,
        executor: me,
        registry,
        alreadyDeployed: deployed,
      });
      await send(calls);
      await rememberOrgSafe(orgId, safe);
    });

  // Plain value, not a hook: this runs after the early return above.
  const bulkChunks = me && pendingOrgs.length ? planBulkDeploy(pendingOrgs, me) : [];

  /** Deploy-only, several orgs per sponsored op: one fingerprint per chunk. */
  const onBulk = () =>
    run('bulk', async () => {
      setBulkProgress({ done: 0, total: bulkChunks.length });
      for (let i = 0; i < bulkChunks.length; i++) {
        await send(bulkChunks[i].calls);
        for (const o of bulkChunks[i].orgs) await rememberOrgSafe(orgIdFromUuid(o.uuid), o.safe);
        setBulkProgress({ done: i + 1, total: bulkChunks.length });
      }
      setBulkProgress(null);
    });

  const onRequestAgain = (safe: Address) =>
    run('request', async () => {
      const data = encodeFunctionData({ abi: orgRegistryWriteAbi, functionName: 'requestRegistration', args: [orgId, ''] });
      await send([safeExecCall(safe, me, registry, data)]);
    });

  const onSync = () =>
    run('sync', async () => {
      if (!chain || !plan) return;
      const call = syncCall({ safe: chain.safe, executor: me, registry, orgId, plan });
      if (call) await send([call]);
    });

  const onLeave = async () => {
    if (!chain || !signer) return;
    setBusy('leave');
    setError(null);
    try {
      await send([leaveSafeCall(chain, me)]);
      await leaveOrg(signer, accountId);
      setConfirmLeave(false);
      const personal = ownedAccounts.find((a) => a.account_type === 'personal');
      if (personal) await switchAccount(personal.id);
      router.replace('/profile');
    } catch (e) {
      console.error('org-safe leave failed', e);
      setError(e instanceof Error ? e.message : 'Austreten fehlgeschlagen');
      setBusy(null);
    }
  };

  const Button = ({ label, onPress, kind }: { label: string; onPress: () => void; kind: NonNullable<typeof busy> }) => (
    <Pressable
      onPress={onPress}
      disabled={!!busy}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: colors.primary, opacity: busy || pressed ? 0.7 : 1 },
      ]}
    >
      {busy === kind ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{label}</Text>}
    </Pressable>
  );

  const ownerNames = owners.map((o) => o.user?.username ?? 'Inhaber').join(', ');

  let body: React.ReactNode = <ActivityIndicator color={colors.textSecondary} />;
  if (status?.kind === 'none') {
    body = (
      <>
        <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
          Erstellt einen eigenen Safe für {accountName}. Inhaber des Safes werden: {ownerNames}. Danach bestätigen die
          Attester die Organisation, und Mitglieder und Rollen liegen offen und überprüfbar onchain.
        </Text>
        <Button label="Safe erstellen" onPress={onCreate} kind="create" />
      </>
    );
  } else if (status?.kind === 'deployed') {
    body = (
      <>
        <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
          Safe erstellt. Die Bestätigung erfolgt gesammelt über den Attester-Safe. Du kannst sie auch einzeln bei den
          Attestern beantragen.
        </Text>
        <Button label="Einzeln beantragen" onPress={() => onRequestAgain(status.safe)} kind="request" />
      </>
    );
  } else if (status?.kind === 'pending') {
    body = status.open ? (
      <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
        Safe erstellt. Wartet auf Bestätigung durch die Attester ({status.approvals} von {status.required}).
      </Text>
    ) : (
      <>
        <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
          Der Safe existiert, aber die Anfrage ist abgelaufen, abgelehnt oder zurückgezogen.
        </Text>
        <Button label="Erneut beantragen" onPress={() => onRequestAgain(status.safe)} kind="request" />
      </>
    );
  } else if (status?.kind === 'registered' && chain && plan) {
    const pending = plan.addOwners.length + plan.setRoles.length;
    body = (
      <>
        <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
          {accountName} ist onchain bestätigt. Safe-Inhaber: {chain.owners.map(nameOf).join(', ')}.
        </Text>
        {isInSync(plan) ? (
          <Text style={[styles.sectionBody, { color: colors.textPrimary }]}>Alle Mitglieder sind übertragen.</Text>
        ) : iAmSafeOwner ? (
          <>
            <Text style={[styles.sectionBody, { color: colors.textPrimary }]}>
              {pending} {pending === 1 ? 'Änderung' : 'Änderungen'} zu übertragen
              {plan.addOwners.length ? ` · neue Inhaber: ${plan.addOwners.map(nameOf).join(', ')}` : ''}
              {plan.setRoles.length ? ` · ${plan.setRoles.length} Rollen` : ''}.
            </Text>
            <Button label="Mitglieder übertragen" onPress={onSync} kind="sync" />
          </>
        ) : (
          <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
            Ein bisheriger Safe-Inhaber muss die Mitglieder übertragen.
          </Text>
        )}

        {iAmSafeOwner && (
          <View style={[styles.leaveBox, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {blocker === 'no_other_owner'
                ? 'Zum Übergeben muss eine weitere Person Inhaber sein und im Safe stehen. Lade sie unter „Mitglieder“ als Inhaber ein und übertrage danach.'
                : blocker === 'not_in_sync'
                  ? 'Übertrage zuerst alle Mitglieder, dann kannst du übergeben.'
                  : 'Du kannst die Organisation jetzt übergeben: Du wirst aus dem Safe entfernt und verlässt die Organisation.'}
            </Text>
            <Pressable
              onPress={() => setConfirmLeave(true)}
              disabled={!!busy || blocker !== null}
              style={({ pressed }) => [
                styles.dangerButton,
                { backgroundColor: colors.errorBackground, opacity: busy || blocker || pressed ? 0.5 : 1 },
              ]}
            >
              <Text style={[styles.dangerButtonText, { color: colors.error }]}>Übergeben & austreten</Text>
            </Pressable>
          </View>
        )}
      </>
    );
  }

  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Onchain-Organisation</Text>
      {body}
      {pendingOrgs.length > 1 && (
        <View style={[styles.leaveBox, { borderTopColor: colors.border }]}>
          <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
            {pendingOrgs.length} deiner Organisationen haben noch keinen Safe. Alle in {bulkChunks.length}{' '}
            {bulkChunks.length === 1 ? 'Schritt' : 'Schritten'} erstellen, je eine Bestätigung.
          </Text>
          {bulkProgress && (
            <Text style={[styles.sectionBody, { color: colors.textPrimary }]}>
              Schritt {Math.min(bulkProgress.done + 1, bulkProgress.total)} von {bulkProgress.total} …
            </Text>
          )}
          <Button label={`Safes für ${pendingOrgs.length} Organisationen erstellen`} onPress={onBulk} kind="bulk" />
        </View>
      )}
      {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}

      <BottomDrawer visible={confirmLeave} onClose={() => busy !== 'leave' && setConfirmLeave(false)}>
        <View style={styles.confirmBody}>
          <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>{accountName} übergeben?</Text>
          <Text style={[styles.confirmText, { color: colors.textSecondary }]}>
            Du wirst aus dem Safe entfernt und verlässt die Organisation. Die übrigen Inhaber behalten die volle
            Kontrolle. Zurück kommst du nur, wenn sie dich wieder einladen.
          </Text>
          <Pressable
            onPress={onLeave}
            disabled={busy === 'leave'}
            style={({ pressed }) => [styles.confirmDanger, { opacity: busy === 'leave' || pressed ? 0.85 : 1 }]}
          >
            {busy === 'leave' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.confirmDangerText}>Übergeben & austreten</Text>
            )}
          </Pressable>
          <Pressable onPress={() => busy !== 'leave' && setConfirmLeave(false)} style={styles.confirmCancel}>
            <Text style={[styles.confirmCancelText, { color: colors.textSecondary }]}>Abbrechen</Text>
          </Pressable>
        </View>
      </BottomDrawer>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 16, fontFamily: 'MonaSansSemiCondensed-SemiBold' },
  sectionBody: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 18 },
  primaryButton: { height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'MonaSansSemiCondensed-Bold' },
  dangerButton: { height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  dangerButtonText: { fontSize: 14, fontFamily: 'MonaSansSemiCondensed-Bold' },
  leaveBox: { borderTopWidth: 1, paddingTop: 12, gap: 12 },
  error: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 18 },
  confirmBody: { gap: 12, paddingTop: 4 },
  confirmTitle: { fontSize: 18, fontFamily: 'Inter-Bold' },
  confirmText: { fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20, marginBottom: 4 },
  confirmDanger: {
    backgroundColor: '#EF4444',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmDangerText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter-SemiBold' },
  confirmCancel: { alignItems: 'center', paddingTop: 6, paddingBottom: 12 },
  confirmCancelText: { fontSize: 15, fontFamily: 'Inter-Medium' },
});
