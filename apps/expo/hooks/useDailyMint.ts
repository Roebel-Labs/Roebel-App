import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
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
/** Sync for thirdweb (optimistic, settled in the background); a promise under a passkey session. */
export type DailyMintClaim = () => boolean | Promise<boolean>;

const isPasskeyCancel = (e: unknown): boolean =>
  (e as { name?: string } | null)?.name === 'PasskeyCancelledError';

/**
 * Drives the profile's Münzen button. `claimable` when the hourly Circles
 * mint has accrued; `claim()` writes the same optimistic cooldown/streak the
 * Münzen page writes and hands the mint to the provider's settlement queue
 * (no full-screen overlay — the button animates instead).
 *
 * Passkey session (`passkey`): never a background or automatic claim (a settlement would pop
 * fingerprint prompts, plus retries, long after the tap). `claim()` instead runs the provider's
 * `claimNow` in the FOREGROUND from the tap: one batch = one fingerprint, the same function the
 * Münzen page uses. It returns a promise the button awaits (pending while the passkey prompt is
 * open): true once landed (cooldown + streak persisted), false on cancel/failure (back to
 * claimable, nothing written, no retry).
 */
export function useDailyMint(opts: { isCitizen: boolean }) {
  const { mintable, minting, onboarded, talerBalance, dailyMint, enqueueSettlement, account, passkeyClaim, claimNow } =
    useRoebelTaler();
  const address = account?.address ?? null;

  // Last claim per wallet, loaded from the same key the Münzen page writes.
  const [claimState, setClaimState] = useState<{ address: string; lastClaim: number | null } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    AsyncStorage.getItem(rtClaimKey(address))
      .then((v) => {
        if (cancelled) return;
        setClaimState({ address, lastClaim: v ? Number(v) : null });
        setNow(Date.now());
      })
      .catch(() => {
        if (!cancelled) setClaimState({ address, lastClaim: null });
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const loaded = !!address && claimState?.address === address;
  // Optional chaining, not a non-null assertion: the compiler has hoisted `!` derefs before.
  const lastClaim = loaded ? (claimState?.lastClaim ?? null) : null;

  // Wake once when the cooldown ends instead of ticking every second.
  useEffect(() => {
    if (lastClaim == null) return;
    const remaining = lastClaim + MINT_COOLDOWN_MS - Date.now();
    if (remaining <= 0) return;
    const id = setTimeout(() => setNow(Date.now()), remaining + 50);
    return () => clearTimeout(id);
  }, [lastClaim]);

  const inCooldown = isInCooldown(lastClaim, now);
  const cooldownEnd = inCooldown && lastClaim != null ? lastClaim + MINT_COOLDOWN_MS : null;
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

  const claim = useCallback<DailyMintClaim>(() => {
    if (!address || !claimable) return false;
    if (passkeyClaim) {
      // Foreground, one batch, one fingerprint. Nothing optimistic: the cooldown moves only on success.
      return claimNow().then(
        ({ claimedAt }) => {
          setClaimState({ address, lastClaim: claimedAt });
          setNow(claimedAt);
          return true;
        },
        (e: unknown) => {
          if (!isPasskeyCancel(e)) {
            Alert.alert('Münzen abholen', (e as Error | null)?.message || 'Das hat nicht geklappt. Bitte versuche es erneut.');
          }
          return false;
        },
      );
    }
    const ts = Date.now();
    const prevLastClaim = lastClaim;
    const received = amount;

    setClaimState({ address, lastClaim: ts });
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
        setClaimState({ address, lastClaim: prevLastClaim });
        if (prevLastClaim != null) AsyncStorage.setItem(rtClaimKey(address), String(prevLastClaim)).catch(() => {});
        else AsyncStorage.removeItem(rtClaimKey(address)).catch(() => {});
      },
    });
    return true;
  }, [address, amount, claimable, claimNow, dailyMint, enqueueSettlement, lastClaim, passkeyClaim]);

  return { state, amount, claim, cooldownEnd, passkey: passkeyClaim };
}
