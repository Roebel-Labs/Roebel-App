import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useUser } from './UserContext';
import {
  fetchRoebelCard,
  ensureRoebelCard,
  fetchPointsHistory,
  fetchStampCards,
  awardPoints,
  type RoebelCardRecord,
  type PointsLedgerEntry,
  type StampCardRecord,
  type PointsAction,
} from '@/lib/supabase-roebel-card';

interface RoebelCardContextValue {
  card: RoebelCardRecord | null;
  pointsBalance: number;
  tier: string;
  history: PointsLedgerEntry[];
  stampCards: StampCardRecord[];
  isLoading: boolean;
  earnPoints: (
    action: Exclude<PointsAction, 'redeem'>,
    referenceType?: string,
    referenceId?: string,
    description?: string
  ) => Promise<boolean>;
  refresh: () => Promise<void>;
}

const RoebelCardContext = createContext<RoebelCardContextValue | undefined>(undefined);

export function RoebelCardProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const walletAddress = user?.wallet_address;

  const [card, setCard] = useState<RoebelCardRecord | null>(null);
  const [history, setHistory] = useState<PointsLedgerEntry[]>([]);
  const [stampCards, setStampCards] = useState<StampCardRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadCard = useCallback(async () => {
    if (!walletAddress) {
      setCard(null);
      setHistory([]);
      setStampCards([]);
      return;
    }

    setIsLoading(true);
    try {
      const [cardData, historyData, stampsData] = await Promise.all([
        ensureRoebelCard(walletAddress),
        fetchPointsHistory(walletAddress),
        fetchStampCards(walletAddress),
      ]);

      setCard(cardData);
      setHistory(historyData);
      setStampCards(stampsData);
    } catch (error) {
      console.error('Error loading Röbel Card:', error);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    loadCard();
  }, [loadCard]);

  const earnPoints = useCallback(
    async (
      action: Exclude<PointsAction, 'redeem'>,
      referenceType?: string,
      referenceId?: string,
      description?: string
    ): Promise<boolean> => {
      if (!walletAddress) return false;

      const result = await awardPoints(walletAddress, action, referenceType, referenceId, description);
      if (result.success) {
        // Optimistically update local state
        if (result.newBalance !== undefined) {
          setCard((prev) =>
            prev ? { ...prev, points_balance: result.newBalance! } : prev
          );
        }
        // Refresh history
        const newHistory = await fetchPointsHistory(walletAddress, 20);
        setHistory(newHistory);
      }
      return result.success;
    },
    [walletAddress]
  );

  const value = useMemo<RoebelCardContextValue>(
    () => ({
      card,
      pointsBalance: card?.points_balance || 0,
      tier: card?.tier || 'besucher',
      history,
      stampCards,
      isLoading,
      earnPoints,
      refresh: loadCard,
    }),
    [card, history, stampCards, isLoading, earnPoints, loadCard]
  );

  return (
    <RoebelCardContext.Provider value={value}>
      {children}
    </RoebelCardContext.Provider>
  );
}

const defaultValue: RoebelCardContextValue = {
  card: null,
  pointsBalance: 0,
  tier: 'besucher',
  history: [],
  stampCards: [],
  isLoading: false,
  earnPoints: async () => false,
  refresh: async () => {},
};

export function useRoebelCard(): RoebelCardContextValue {
  const context = useContext(RoebelCardContext);
  return context ?? defaultValue;
}
