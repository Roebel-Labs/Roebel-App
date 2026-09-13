import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoebelTaler } from '@/hooks/useRoebelTaler';
import {
  MIN_MINTABLE,
  MINT_COOLDOWN_MS,
  claimAmount,
  computeNextStreak,
  dayStart,
  isInCooldown,
  rtClaimKey,
  rtStreakKey,
} from '@/lib/muenzen-daily-mint';

export type DailyMintState = 'hidden' | 'idle' | 'claimable';

/**
 * Drives the profile's Münzen button. `claimable` when the hourly Circles
 * mint has accrued; `claim()` writes the same optimistic cooldown/streak the
 * Münzen page writes and hands the mint to the provider's settlement queue
 * (no full-screen overlay — the button animates instead).
 */
export function useDailyMint(opts: { isCitizen: boolean }) {
  const { mintable, minting, onboarded, talerBalance, dailyMint, enqueueSettlement, account } = useRoebelTaler();
  const address = account?.address ?? null;

  const [lastClaim, setLastClaim] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setLoaded(false);
    if (!address) {
      setLastClaim(null);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(rtClaimKey(address))
      .then((v) => {
        if (cancelled) return;
        setLastClaim(v ? Number(v) : null);
        setNow(Date.now());
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Wake once when the cooldown ends instead of ticking every second.
  useEffect(() => {
    if (lastClaim == null) return;
    const remaining = lastClaim + MINT_COOLDOWN_MS - Date.now();
    if (remaining <= 0) return;
    const id = setTimeout(() => setNow(Date.now()), remaining + 50);
    return () => clearTimeout(id);
  }, [lastClaim]);

  const inCooldown = isInCooldown(lastClaim, now);
  const amount = claimAmount(mintable);
  const claimable = loaded && !!address && onboarded && !minting && !inCooldown && mintable >= MIN_MINTABLE;
  const hasMoney = onboarded || talerBalance > 0;

  const state: DailyMintState = !address
    ? 'hidden'
    : claimable
      ? 'claimable'
      : opts.isCitizen || hasMoney
        ? 'idle'
        : 'hidden';

  const claim = useCallback((): boolean => {
    if (!address || !claimable) return false;
    const ts = Date.now();
    const prevLastClaim = lastClaim;
    const received = amount;

    setLastClaim(ts);
    setNow(ts);
    AsyncStorage.setItem(rtClaimKey(address), String(ts)).catch(() => {});
    AsyncStorage.getItem(rtStreakKey(address))
      .then((raw) => {
        let prevStreak = 0;
        try {
          prevStreak = raw ? Number(JSON.parse(raw)?.count) || 0 : 0;
        } catch {
          prevStreak = 0;
        }
        const next = computeNextStreak(prevStreak, prevLastClaim, ts);
        return AsyncStorage.setItem(rtStreakKey(address), JSON.stringify({ count: next, lastDay: dayStart(ts) }));
      })
      .catch(() => {});

    enqueueSettlement({
      label: 'Münzen',
      amount: received,
      settle: dailyMint,
      onFailed: () => {
        // Roll the optimistic cooldown back so the user can retry; the accrual
        // is still on-chain and reappears on the next refresh.
        setLastClaim(prevLastClaim);
        if (prevLastClaim != null) AsyncStorage.setItem(rtClaimKey(address), String(prevLastClaim)).catch(() => {});
        else AsyncStorage.removeItem(rtClaimKey(address)).catch(() => {});
      },
    });
    return true;
  }, [address, amount, claimable, dailyMint, enqueueSettlement, lastClaim]);

  return { state, amount, claim };
}
