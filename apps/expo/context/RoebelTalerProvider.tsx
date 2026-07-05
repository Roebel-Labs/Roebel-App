import React, {
  createContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { sendTransaction } from 'thirdweb';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { runWithRetry } from '@/lib/muenzen-settlement';
import {
  isOnboarded, findInviter, getRoebelTalerBalance, getPersonalCrcBalance,
  getMintableTaler, formatTaler, prepareDailyMint, prepareOnboard,
  prepareContributeToRoebelTaler, prepareSendRoebelTaler, isGroupMember,
} from '@/lib/roebel-taler';

export interface SettlementJob {
  /** Soft-notice noun, e.g. "Münzen" | "Stimme". Never expose CRC/Circles. */
  label: string;
  /** Optimistic balance delta in whole Münzen (0 when the amount is unknown). */
  amount: number;
  settle: () => Promise<void>;
  onConfirmed?: () => void;
  onFailed?: () => void;
}

interface RoebelTalerContextValue {
  talerBalance: number;
  balanceRaw: bigint;
  /** Sendable Röbel Münzen (group token only) — caps the Senden flow. */
  groupBalance: number;
  groupBalanceRaw: bigint;
  mintable: number;
  mintableRaw: bigint;
  onboarded: boolean;
  loading: boolean;
  minting: boolean;
  onboarding: boolean;
  sending: boolean;
  dailyMint: () => Promise<void>;
  onboard: () => Promise<void>;
  send: (to: string, amount: bigint) => Promise<void>;
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

  // Two gasless sends only — NO refresh. The settlement queue reconciles after.
  const dailyMint = useCallback(async () => {
    if (!gnosisAccount) throw new Error('Gnosis-Konto noch nicht bereit');
    setMinting(true);
    try {
      await sendTransaction({ account: gnosisAccount, transaction: prepareDailyMint() });
      // Citizens (trusted by the group) convert to the shared Röbel Münzen;
      // guests keep their personal Münzen — the group would revert their mint.
      const member = await isGroupMember(gnosisAccount.address).catch(() => false);
      if (member) {
        const pcrc = await getPersonalCrcBalance(gnosisAccount.address).catch(() => 0n);
        if (pcrc > 0n) {
          await sendTransaction({
            account: gnosisAccount,
            transaction: prepareContributeToRoebelTaler(gnosisAccount.address, pcrc),
          });
        }
      }
    } finally {
      setMinting(false);
    }
  }, [gnosisAccount]);

  const onboard = useCallback(async () => {
    if (!gnosisAccount) throw new Error('Gnosis-Konto noch nicht bereit');
    setOnboarding(true);
    try {
      if (await isOnboarded(gnosisAccount.address)) { await refresh(); return; }
      const inviter = await findInviter(gnosisAccount.address);
      if (!inviter) {
        throw Object.assign(
          new Error('Du wurdest noch nicht eingeladen. Lass dich von einem Bürger einladen (z. B. in Metri deine Adresse einladen), dann hier erneut tippen.'),
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
      await sendTransaction({
        account: gnosisAccount,
        transaction: prepareSendRoebelTaler(gnosisAccount.address, to, amount),
      });
      await refresh();
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
        await runWithRetry(job.settle);
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
    onboarded,
    loading: loading || !ready,
    minting,
    onboarding,
    sending,
    dailyMint,
    onboard,
    send,
    refresh,
    enqueueSettlement,
    account: gnosisAccount,
  }), [optimisticRaw, groupRaw, mintableRaw, onboarded, loading, ready, minting, onboarding,
       sending, dailyMint, onboard, send, refresh, enqueueSettlement, gnosisAccount]);

  return <RoebelTalerContext.Provider value={value}>{children}</RoebelTalerContext.Provider>;
}
