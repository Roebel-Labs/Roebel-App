import React, {
  createContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { sendTransaction } from 'thirdweb';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { runWithRetry } from '@/lib/muenzen-settlement';
import {
  isOnboarded, getRoebelTalerBalance, getPersonalCrcBalance,
  getMintableTaler, formatTaler, prepareDailyMint, prepareOnboard,
  prepareContributeToRoebelTaler, prepareSendRoebelTaler, isGroupMember,
} from '@/lib/roebel-taler';
import { circlesHubAddress, roebeltalerGroupAddress } from '@/constants/gnosis';
import {
  claimMuenzenAsOneBatch, claimMuenzenRouted, claimsAsOneBatch, wholeMuenzen, type BatchAccount,
} from '@/lib/muenzen-claim';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { passkeySessionOf } from '@/lib/passkey/active';
import type { PasskeySession } from '@/lib/passkey/session';
import {
  chooseClaimPath, isDeviceSessionEligible, DEVICE_SESSION_DECLINED_KEY, DEVICE_SESSION_DECLINE_SEC,
  type ClaimPath,
} from '@/lib/passkey/session-keys/claim-route';
import { grantDeviceSession, readDeviceSessionState, readOnChainPermissionIds } from '@/lib/passkey/session-keys/grant';
import { defaultDeviceKeyStore, deleteDeviceSession, loadDeviceSession } from '@/lib/passkey/session-keys/device-key';
import { isDeviceSessionRejection, isFatalDeviceSessionRejection, sendDeviceSessionCall } from '@/lib/passkey/session-keys/session-op';
import { fetchPasskeySessionKeysEnabled } from '@/lib/supabase-app-settings';
import { recordMuenzenClaim } from '@/lib/muenzen-daily-mint';
import { convertibleRaw, findMyInvitation, getInviteReserveRaw } from '@/lib/muenzen-invite';

const CLAIM_READS = {
  isGroupMember,
  personalBalance: getPersonalCrcBalance,
  mintable: getMintableTaler,
  inviteReserve: getInviteReserveRaw,
};
const CLAIM_ADDRS = {
  hub: circlesHubAddress as `0x${string}`,
  group: roebeltalerGroupAddress as `0x${string}`,
};

export interface SettlementJob {
  /** Soft-notice noun, e.g. "Münzen" | "Stimme". Never expose CRC/Circles. */
  label: string;
  /** Optimistic balance delta in whole Münzen (0 when the amount is unknown). */
  amount: number;
  settle: () => Promise<void>;
  onConfirmed?: () => void;
  onFailed?: () => void;
  /**
   * Attempts including the first (default 3). A passkey session passes 1: every attempt is a
   * fingerprint prompt, so a cancelled or failed one must never re-prompt on its own.
   */
  attempts?: number;
}

/**
 * `partial`: a device-session claim minted the personal Münzen but the conversion (groupMint)
 * did not land; the next claim converts the rest.
 */
export type ClaimNowResult = { received: number; claimedAt: number; streak: number; partial?: boolean };

/** The claim path for the current passkey session (kill switch, eligibility, device state, "Nicht jetzt"). */
async function routeFor(account: unknown): Promise<{ path: ClaimPath; session: PasskeySession | null }> {
  const session = passkeySessionOf<PasskeySession>(account);
  if (!session || !isDeviceSessionEligible(session, Platform.OS)) return { path: 'passkey', session };
  const enabled = await fetchPasskeySessionKeysEnabled().catch(() => false);
  if (!enabled) return { path: 'passkey', session };
  const [state, declinedRaw] = await Promise.all([
    readDeviceSessionState(session).catch(() => null),
    AsyncStorage.getItem(DEVICE_SESSION_DECLINED_KEY).catch(() => null),
  ]);
  const declined = declinedRaw ? Number(declinedRaw) : NaN;
  const path = chooseClaimPath({
    enabled,
    eligible: true,
    state,
    nowSec: Math.floor(Date.now() / 1000),
    declinedUntilSec: Number.isFinite(declined) ? declined : null,
  });
  return { path, session };
}

interface RoebelTalerContextValue {
  talerBalance: number;
  balanceRaw: bigint;
  /** Sendable Röbel Münzen (group token only) — caps the Senden flow. */
  groupBalance: number;
  groupBalanceRaw: bigint;
  mintable: number;
  mintableRaw: bigint;
  /** The user's own, not yet converted Münzen — what invitations are paid from. Never optimistic. */
  personalBalanceRaw: bigint;
  onboarded: boolean;
  loading: boolean;
  minting: boolean;
  onboarding: boolean;
  sending: boolean;
  dailyMint: () => Promise<void>;
  /**
   * Passkey session: claims run ONLY in the foreground from an explicit tap, as one batch
   * (one fingerprint), never through the background settlement queue. false for thirdweb.
   */
  passkeyClaim: boolean;
  /**
   * Passkey session only: the one-batch claim (one fingerprint). The profile pill and the
   * Münzen page both call this. On success the cooldown + streak are persisted; resolves with
   * the whole Münzen landed, the claim time and the new streak. Throws on cancel/failure
   * (nothing persisted, never retried).
   */
  claimNow: (opts?: { allowGrant?: boolean }) => Promise<ClaimNowResult>;
  /**
   * Passkey session only: which way the next claim goes ('offer' = show the first-claim offer
   * sheet, then `claimNow({ allowGrant: true })` or `declineDeviceSession()` + `claimNow()`).
   * 'passkey' for thirdweb, web, words, Safe identities, or with the kill switch off.
   */
  deviceSessionClaimPath: () => Promise<ClaimPath>;
  /** "Nicht jetzt": no offer for 7 days on this device. */
  declineDeviceSession: () => Promise<void>;
  onboard: () => Promise<void>;
  /** Resolves with the transaction hash (used by in-chat payment receipts). */
  send: (to: string, amount: bigint) => Promise<string>;
  refresh: () => Promise<void>;
  enqueueSettlement: (job: SettlementJob) => void;
  account: ReturnType<typeof useGnosisWallet>['gnosisAccount'];
}

export const RoebelTalerContext = createContext<RoebelTalerContextValue | undefined>(undefined);

const ONE = 10n ** 18n;

/**
 * Single shared owner of on-chain Röbel Münzen (Circles on Gnosis): real
 * balance, optimistic deltas, and the background settlement queue. Lifting the
 * old per-component useRoebelTaler hook here collapses ~7 independent pollers
 * into one and gives the optimistic-bump + reconcile flow a consistent home.
 * User-facing term is always "Röbel Münzen".
 */
export function RoebelTalerProvider({ children }: { children: React.ReactNode }) {
  const { gnosisAccount, ready } = useGnosisWallet();
  const { showSnackbar } = useSnackbar();
  const address = gnosisAccount?.address;

  const [groupRaw, setGroupRaw] = useState<bigint>(0n);
  const [personalRaw, setPersonalRaw] = useState<bigint>(0n);
  const [mintableRaw, setMintableRaw] = useState<bigint>(0n);
  const [onboarded, setOnboarded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [minting, setMinting] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [sending, setSending] = useState(false);
  // Optimistic deltas (whole Münzen) keyed by settlement id.
  const [pendingDeltas, setPendingDeltas] = useState<Record<number, number>>({});
  const settlementSeq = useRef(0);

  // Re-read on-chain state WITHOUT toggling the loading flag (used for the
  // background reconcile so no consumer flashes a spinner mid-settle).
  const reconcile = useCallback(async () => {
    if (!address) return;
    const [ob, group, personal, mintable] = await Promise.all([
      isOnboarded(address).catch(() => false),
      getRoebelTalerBalance(address).catch(() => 0n),
      getPersonalCrcBalance(address).catch(() => 0n),
      getMintableTaler(address).catch(() => 0n),
    ]);
    setOnboarded(ob);
    setGroupRaw(group);
    setPersonalRaw(personal);
    setMintableRaw(mintable);
  }, [address]);

  const refresh = useCallback(async () => {
    if (!address) { setLoading(false); return; }
    setLoading(true);
    try { await reconcile(); } finally { setLoading(false); }
  }, [address, reconcile]);

  useEffect(() => { refresh(); }, [refresh]);

  // The mintable amount accrues continuously (~1/hour). Poll it (lightweight, no
  // loading flag) so the button shows a live, ticking-up amount.
  useEffect(() => {
    if (!address || !onboarded) return;
    const tick = () => { void getMintableTaler(address).then(setMintableRaw).catch(() => {}); };
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [address, onboarded]);

  const passkeyClaim = claimsAsOneBatch(gnosisAccount);

  // Two gasless sends only — NO refresh. The settlement queue reconciles after.
  // A passkey session never takes this two-send path: it sends the same claim as ONE batch.
  const dailyMint = useCallback(async () => {
    if (!gnosisAccount) throw new Error('Gnosis-Konto noch nicht bereit');
    setMinting(true);
    try {
      if (claimsAsOneBatch(gnosisAccount)) {
        await claimMuenzenAsOneBatch(gnosisAccount as unknown as BatchAccount, CLAIM_READS, CLAIM_ADDRS);
        return;
      }
      await sendTransaction({ account: gnosisAccount, transaction: prepareDailyMint() });
      // Citizens (trusted by the group) convert to the shared Röbel Münzen;
      // guests keep their personal Münzen — the group would revert their mint.
      const member = await isGroupMember(gnosisAccount.address).catch(() => false);
      if (member) {
        const pcrc = await getPersonalCrcBalance(gnosisAccount.address).catch(() => 0n);
        // Saving for an invitation / open invitations hold back personal Münzen (never converted,
        // the shared Röbel Münzen cannot be turned back). A failed reserve read converts nothing.
        const reserve = await getInviteReserveRaw(gnosisAccount.address).catch(() => pcrc);
        const amount = convertibleRaw(pcrc, reserve);
        if (amount > 0n) {
          await sendTransaction({
            account: gnosisAccount,
            transaction: prepareContributeToRoebelTaler(gnosisAccount.address, amount),
          });
        }
      }
    } finally {
      setMinting(false);
    }
  }, [gnosisAccount]);

  // Passkey session: one tap → at most one fingerprint, awaited in the foreground. With a device
  // session (Münzen ohne Fingerabdruck) the claim runs as session ops without any prompt.
  const claimNow = useCallback(async (opts?: { allowGrant?: boolean }): Promise<ClaimNowResult> => {
    if (!gnosisAccount) throw new Error('Gnosis-Konto noch nicht bereit');
    if (!claimsAsOneBatch(gnosisAccount)) throw new Error('claimNow is for passkey sessions only');
    setMinting(true);
    try {
      const { path, session } = await routeFor(gnosisAccount);
      const store = defaultDeviceKeyStore;
      const passkeyClaim = () => claimMuenzenAsOneBatch(gnosisAccount as unknown as BatchAccount, CLAIM_READS, CLAIM_ADDRS);
      const { mintedRaw, partial } = !session || path === 'passkey'
        ? { ...(await passkeyClaim()), partial: false }
        : await claimMuenzenRouted({
          path,
          allowGrant: opts?.allowGrant === true,
          account: gnosisAccount,
          reads: CLAIM_READS,
          addrs: CLAIM_ADDRS,
          grant: async () => { await grantDeviceSession(session); },
          loadSession: () => loadDeviceSession(store, session.safe, () => readOnChainPermissionIds(session.safe)),
          sendSessionCall: async (s, kind, innerHubData) => (await sendDeviceSessionCall({
            record: s.record, privateKey: s.privateKey, proof: { x: session.x, y: session.y }, kind, innerHubData,
          })).txHash,
          isRejection: isDeviceSessionRejection,
          isFatalRejection: isFatalDeviceSessionRejection,
          dropSession: () => deleteDeviceSession(store, session.safe),
          passkeyClaim,
        });
      const claimedAt = Date.now();
      const streak = await recordMuenzenClaim(AsyncStorage, gnosisAccount.address, claimedAt);
      await reconcile().catch(() => {});
      return { received: wholeMuenzen(mintedRaw), claimedAt, streak, ...(partial ? { partial: true } : {}) };
    } finally {
      setMinting(false);
    }
  }, [gnosisAccount, reconcile]);

  const deviceSessionClaimPath = useCallback(async (): Promise<ClaimPath> => {
    if (!gnosisAccount || !claimsAsOneBatch(gnosisAccount)) return 'passkey';
    return (await routeFor(gnosisAccount).catch(() => ({ path: 'passkey' as const }))).path;
  }, [gnosisAccount]);

  const declineDeviceSession = useCallback(async () => {
    const until = Math.floor(Date.now() / 1000) + DEVICE_SESSION_DECLINE_SEC;
    await AsyncStorage.setItem(DEVICE_SESSION_DECLINED_KEY, String(until));
  }, []);

  const onboard = useCallback(async () => {
    if (!gnosisAccount) throw new Error('Gnosis-Konto noch nicht bereit');
    setOnboarding(true);
    try {
      if (await isOnboarded(gnosisAccount.address)) { await refresh(); return; }
      const { inviter, pendingInviter, inviterName } = await findMyInvitation(gnosisAccount.address).catch(() => {
        throw new Error('Deine Einladung konnte gerade nicht geprüft werden. Bitte prüfe deine Verbindung und versuche es erneut.');
      });
      if (!inviter && pendingInviter) {
        // Invited, but the inviter is still saving the Münzen the join costs them — joining now
        // would fail on-chain. Tell the user instead.
        throw Object.assign(
          new Error('Deine Einladung ist da, aber noch nicht ganz angespart. Bitte versuche es in ein paar Tagen erneut.'),
          { code: 'INVITER_SAVING' as const, inviterName },
        );
      }
      if (!inviter) {
        throw Object.assign(
          new Error('Du wurdest noch nicht eingeladen. Bitte eine:n Nachbar:in, der oder die schon Röbel Münzen sammelt, dich einzuladen.'),
          { code: 'NOT_INVITED' as const },
        );
      }
      await sendTransaction({ account: gnosisAccount, transaction: prepareOnboard(inviter) });
      await refresh();
    } finally {
      setOnboarding(false);
    }
  }, [gnosisAccount, refresh]);

  const send = useCallback(async (to: string, amount: bigint) => {
    if (!gnosisAccount) throw new Error('Gnosis-Konto noch nicht bereit');
    setSending(true);
    try {
      const result = await sendTransaction({
        account: gnosisAccount,
        transaction: prepareSendRoebelTaler(gnosisAccount.address, to, amount),
      });
      await refresh();
      return result.transactionHash;
    } finally {
      setSending(false);
    }
  }, [gnosisAccount, refresh]);

  const enqueueSettlement = useCallback((job: SettlementJob) => {
    const id = settlementSeq.current + 1;
    settlementSeq.current = id;
    if (job.amount > 0) setPendingDeltas((m) => ({ ...m, [id]: Math.round(job.amount) }));
    const dropDelta = () =>
      setPendingDeltas((m) => { const n = { ...m }; delete n[id]; return n; });
    void (async () => {
      try {
        await runWithRetry(job.settle, { attempts: job.attempts ?? 3 });
        await reconcile();   // real balance now includes the mint…
        dropDelta();         // …drop the optimistic delta in the same async tick
        job.onConfirmed?.();
      } catch (err) {
        dropDelta();
        job.onFailed?.();
        await reconcile().catch(() => {});
        showSnackbar({
          message: `Deine ${job.label} sind noch unterwegs — wir versuchen es gleich erneut.`,
        });
        console.warn('[Münzen] settlement failed:', err);
      }
    })();
  }, [reconcile, showSnackbar]);

  const deltaSum = useMemo(
    () => Object.values(pendingDeltas).reduce((a, b) => a + b, 0),
    [pendingDeltas],
  );
  const balanceRaw = groupRaw + personalRaw;
  const optimisticRaw = balanceRaw + BigInt(Math.round(deltaSum)) * ONE;

  const value = useMemo<RoebelTalerContextValue>(() => ({
    talerBalance: Number(formatTaler(optimisticRaw)),
    balanceRaw: optimisticRaw,
    groupBalance: Number(formatTaler(groupRaw)),
    groupBalanceRaw: groupRaw,
    mintable: Number(formatTaler(mintableRaw)),
    mintableRaw,
    personalBalanceRaw: personalRaw,
    onboarded,
    loading: loading || !ready,
    minting,
    onboarding,
    sending,
    dailyMint,
    passkeyClaim,
    claimNow,
    deviceSessionClaimPath,
    declineDeviceSession,
    onboard,
    send,
    refresh,
    enqueueSettlement,
    account: gnosisAccount,
  }), [optimisticRaw, groupRaw, mintableRaw, personalRaw, onboarded, loading, ready, minting, onboarding,
       sending, dailyMint, passkeyClaim, claimNow, deviceSessionClaimPath, declineDeviceSession, onboard, send, refresh, enqueueSettlement, gnosisAccount]);

  return <RoebelTalerContext.Provider value={value}>{children}</RoebelTalerContext.Provider>;
}
