import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import MuenzenRewardOverlay from '@/components/rewards/MuenzenRewardOverlay';

interface CelebrateOptions {
  /** Override the standard reward line. */
  subtitle?: string;
}

interface PendingOptions {
  /** Label(s) shown next to the spinner while the reward is being fetched. */
  loadingLabel?: string | string[];
  /** Coin variant to show during loading (before the amount is known). */
  coin?: 'single' | 'many';
  /** Subtitle to show once resolved (can also be passed to resolve()). */
  subtitle?: string;
  /** Fired once when the reward screen is dismissed (Weiter) or aborted (fail). */
  onClose?: () => void;
}

interface PendingHandle {
  /** Reveal the amount with the slide-in animation. */
  resolve: (amount: number, opts?: CelebrateOptions) => void;
  /** Abort: close the reward screen without showing an amount. */
  fail: () => void;
}

interface RewardCelebrationContextValue {
  /**
   * Show the full-screen Röbel Münzen reward celebration immediately with a
   * known amount. The amount picks the single vs. trio coin. <= 0 is ignored.
   */
  celebrate: (amount: number, opts?: CelebrateOptions) => void;
  /**
   * Show the reward screen NOW in a loading state (button spins) and return a
   * handle to resolve it with the amount, or fail() to dismiss it. Use when the
   * payout is in flight (daily mint, on-chain claim) so the screen appears
   * instantly and the headline/body slide in once it's done.
   */
  celebratePending: (opts?: PendingOptions) => PendingHandle;
}

interface QueueItem {
  id: number;
  amount: number;
  subtitle?: string;
  loading: boolean;
  loadingLabel?: string | string[];
  coin?: 'single' | 'many';
  onClose?: () => void;
}

const RewardCelebrationContext = createContext<RewardCelebrationContextValue | undefined>(
  undefined,
);

export function RewardCelebrationProvider({ children }: { children: React.ReactNode }) {
  // A queue so two quick rewards (e.g. task + checkpoint) each get their moment
  // instead of clobbering one another.
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const nextId = useRef(0);

  const celebrate = useCallback((amount: number, opts?: CelebrateOptions) => {
    const amt = Math.round(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setQueue((q) => [
      ...q,
      { id: nextId.current++, amount: amt, subtitle: opts?.subtitle, loading: false },
    ]);
  }, []);

  const celebratePending = useCallback((opts?: PendingOptions): PendingHandle => {
    const id = nextId.current++;
    const onClose = opts?.onClose;
    setQueue((q) => [
      ...q,
      {
        id,
        amount: 0,
        subtitle: opts?.subtitle,
        loading: true,
        loadingLabel: opts?.loadingLabel,
        coin: opts?.coin,
        onClose,
      },
    ]);
    return {
      resolve: (amount, o) => {
        const amt = Math.round(amount);
        setQueue((q) =>
          q.map((it) =>
            it.id === id
              ? { ...it, loading: false, amount: Math.max(0, amt), subtitle: o?.subtitle ?? it.subtitle }
              : it,
          ),
        );
      },
      fail: () => {
        setQueue((q) => q.filter((it) => it.id !== id));
        if (onClose) setTimeout(onClose, 0);
      },
    };
  }, []);

  const current = queue[0];

  // Dismiss the visible reward (Weiter). Fire its onClose AFTER it leaves the
  // queue so any follow-up (e.g. a bottom sheet) opens once this modal is gone.
  const handleClose = () => {
    const cb = current?.onClose;
    setQueue((q) => q.slice(1));
    if (cb) setTimeout(cb, 0);
  };

  const value = useMemo(() => ({ celebrate, celebratePending }), [celebrate, celebratePending]);

  return (
    <RewardCelebrationContext.Provider value={value}>
      {children}
      <MuenzenRewardOverlay
        visible={!!current}
        replayKey={current?.id ?? 0}
        amount={current?.amount ?? 0}
        subtitle={current?.subtitle}
        loading={current?.loading ?? false}
        loadingLabel={current?.loadingLabel}
        coin={current?.coin}
        onClose={handleClose}
      />
    </RewardCelebrationContext.Provider>
  );
}

export function useRewardCelebration(): RewardCelebrationContextValue {
  const ctx = useContext(RewardCelebrationContext);
  if (!ctx) throw new Error('useRewardCelebration must be used within RewardCelebrationProvider');
  return ctx;
}
