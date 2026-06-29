import { useCallback } from 'react';
import { useRewardCelebration } from '@/context/RewardCelebrationContext';
import { useRoebelTaler } from '@/hooks/useRoebelTaler';

/** Anticipation beat: how long the loading screen shows before the reveal. */
export const REWARD_BEAT_MS = 1700;

export interface CelebrateSettlingOptions {
  /** Reveal this number (daily mint — amount known up front). */
  amount?: number;
  /** OR reveal this headline instead of a number (vote thank-you). */
  message?: string;
  coin?: 'single' | 'many';
  subtitle?: string;
  /** Soft-notice noun shown only on terminal failure ("Münzen" | "Stimme"). */
  label: string;
  settle: () => Promise<void>;
  onConfirmed?: () => void;
  onFailed?: () => void;
  loadingLabel?: string | string[];
  onClose?: () => void;
}

/**
 * Show the Röbel-Münzen reward screen with a short anticipation beat, reveal the
 * (already-known) amount or a thank-you message after ~1.7s, and hand the slow
 * on-chain work to the background settlement queue. The chain no longer gates
 * the reveal — the tx settles detached with retry + soft-notice on failure.
 */
export function useCelebrateSettling() {
  const { celebratePending } = useRewardCelebration();
  const { enqueueSettlement } = useRoebelTaler();

  return useCallback((opts: CelebrateSettlingOptions) => {
    const reward = celebratePending({
      coin: opts.coin,
      subtitle: opts.subtitle,
      message: opts.message,
      loadingLabel: opts.loadingLabel,
      onClose: opts.onClose,
    });
    // Detach the slow settlement immediately (registers the optimistic delta).
    enqueueSettlement({
      label: opts.label,
      amount: opts.amount ?? 0,
      settle: opts.settle,
      onConfirmed: opts.onConfirmed,
      onFailed: opts.onFailed,
    });
    // Reveal after the beat regardless of chain state. resolve(0) + a message
    // reveals the headline text; resolve(n>0) reveals the number.
    setTimeout(() => reward.resolve(opts.amount ?? 0), REWARD_BEAT_MS);
  }, [celebratePending, enqueueSettlement]);
}
