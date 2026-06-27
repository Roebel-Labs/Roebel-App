import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import MuenzenRewardOverlay from '@/components/rewards/MuenzenRewardOverlay';

interface CelebrateOptions {
  /** Override the standard reward line. */
  subtitle?: string;
}

interface RewardCelebrationContextValue {
  /**
   * Show the full-screen Röbel Münzen reward celebration. Call this whenever a
   * citizen receives Münzen (daily mint, task, checkpoint scan, vote, …). The
   * amount picks the single vs. trio coin illustration. Amounts <= 0 are ignored.
   */
  celebrate: (amount: number, opts?: CelebrateOptions) => void;
}

interface QueueItem {
  id: number;
  amount: number;
  subtitle?: string;
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
    setQueue((q) => [...q, { id: nextId.current++, amount: amt, subtitle: opts?.subtitle }]);
  }, []);

  const handleClose = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  const current = queue[0];

  const value = useMemo(() => ({ celebrate }), [celebrate]);

  return (
    <RewardCelebrationContext.Provider value={value}>
      {children}
      <MuenzenRewardOverlay
        visible={!!current}
        replayKey={current?.id ?? 0}
        amount={current?.amount ?? 0}
        subtitle={current?.subtitle}
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
