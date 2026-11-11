import { useCallback, useEffect, useRef, useState } from 'react';
import { sendTransaction } from 'thirdweb';
import { useRoebelTaler } from '@/hooks/useRoebelTaler';
import { prepareTrust, prepareWithdrawTrust } from '@/lib/roebel-taler';
import {
  daysUntilNextInvite,
  freeInviteSlots,
  isSavingForInvite,
  loadInviteOverview,
  rememberInvite,
  savedTowardsNextRaw,
  setSavingForInvite,
  type InviteOverview,
  type Neighbour,
} from '@/lib/muenzen-invite';

/**
 * State + actions of the "Nachbarn einladen" screen: who is still waiting, how far the user's
 * savings for the next invitation are, and the invite / withdraw transactions.
 */
export function useMuenzenInvite() {
  const { account, personalBalanceRaw, mintableRaw, onboarded, loading: talerLoading, refresh } = useRoebelTaler();
  const address = account?.address ?? null;

  const [overview, setOverview] = useState<InviteOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Address of the neighbour whose invitation / withdrawal is being sent. */
  const [busy, setBusy] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const reload = useCallback(async () => {
    if (!address) return;
    const seq = ++requestSeq.current;
    setFailed(false);
    try {
      const [next, isSaving] = await Promise.all([loadInviteOverview(address), isSavingForInvite(address)]);
      if (seq !== requestSeq.current) return;
      setOverview(next);
      setSaving(isSaving);
    } catch {
      if (seq === requestSeq.current) setFailed(true);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [address]);

  // `loading` starts true; a wallet switch mid-screen keeps the previous list until the new one lands.
  useEffect(() => {
    void reload();
  }, [reload]);

  const openInvites = overview?.openInvites ?? 0;
  const freeSlots = freeInviteSlots(personalBalanceRaw, openInvites);

  const toggleSaving = useCallback(
    async (on: boolean) => {
      if (!address) return;
      setSaving(on);
      await setSavingForInvite(address, on);
    },
    [address],
  );

  const patchNeighbour = useCallback((addr: string, patch: Partial<Neighbour>, openDelta: number) => {
    setOverview((prev) =>
      prev
        ? {
            ...prev,
            openInvites: Math.max(0, prev.openInvites + openDelta),
            neighbours: prev.neighbours.map((n) => (n.address === addr ? { ...n, ...patch } : n)),
          }
        : prev,
    );
  }, []);

  /** Invite a neighbour. Throws on failure (the screen shows the message). */
  const invite = useCallback(
    async (neighbour: Neighbour) => {
      if (!account || !address) throw new Error('Dein Konto wird noch geladen. Bitte gleich erneut versuchen.');
      if (freeSlots < 1) throw new Error('Du hast noch nicht genug Münzen für eine Einladung angespart.');
      setBusy(neighbour.address);
      try {
        await sendTransaction({ account, transaction: prepareTrust(neighbour.address) });
        // The saved amount is now committed to this invitation; saving for another is a new choice.
        await Promise.all([rememberInvite(address, neighbour.address), setSavingForInvite(address, false)]);
        setSaving(false);
        patchNeighbour(neighbour.address, { status: 'invitedByMe', inviterName: null }, 1);
      } finally {
        setBusy(null);
      }
    },
    [account, address, freeSlots, patchNeighbour],
  );

  /** Take an open invitation back; the held-back Münzen are free again. */
  const withdraw = useCallback(
    async (neighbour: Neighbour) => {
      if (!account || !address) throw new Error('Dein Konto wird noch geladen. Bitte gleich erneut versuchen.');
      setBusy(neighbour.address);
      try {
        await sendTransaction({ account, transaction: prepareWithdrawTrust(neighbour.address) });
        await rememberInvite(address, neighbour.address, true);
        patchNeighbour(neighbour.address, { status: 'waiting' }, -1);
      } finally {
        setBusy(null);
      }
    },
    [account, address, patchNeighbour],
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([reload(), refresh()]);
  }, [reload, refresh]);

  return {
    ready: !!address && !talerLoading,
    onboarded,
    overview,
    loading,
    failed,
    saving,
    busy,
    openInvites,
    freeSlots,
    /** Whole Münzen saved towards the next invitation (0..96). */
    saved: Number(savedTowardsNextRaw(personalBalanceRaw, openInvites) / 10n ** 16n) / 100,
    /** Days of collecting until the next invitation is covered, counting what is ready to collect. */
    daysLeft: daysUntilNextInvite(personalBalanceRaw, openInvites, mintableRaw),
    toggleSaving,
    invite,
    withdraw,
    reload: refreshAll,
  };
}
