// RoebelCardContext (voucher edition)
//
// This is the NEW Röbel Card system: a local euro-voucher card modelled after
// zmyle Networks. The legacy points/tier/stamp system that previously owned
// this filename was renamed to RoebelPointsContext.
//
// For this session the context is read-only: it fetches the active wallet's
// voucher card (if any) so the screen can decide between the advertising
// landing page (card === null) and the full card view (card !== null, built
// in a later session). No writes happen here — all money-moving operations
// go through the web checkout or the partner flow.

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { supabase } from '@/lib/supabase';

export interface RoebelCardRow {
  card_id: string;
  wallet_address: string;
  owner_account_id: string | null;
  balance_cents: number;
  status: 'active' | 'frozen' | 'deactivated';
  approved_charge_count: number;
  lifetime_spend_cents: number;
  created_at: string;
  updated_at: string;
}

interface RoebelCardContextValue {
  card: RoebelCardRow | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const defaultValue: RoebelCardContextValue = {
  card: null,
  isLoading: false,
  refresh: async () => {},
};

const RoebelCardContext = createContext<RoebelCardContextValue>(defaultValue);

export function RoebelCardProvider({ children }: { children: React.ReactNode }) {
  const activeAccount = useActiveAccount();
  // thirdweb returns the wallet address in EIP-55 mixed case ("0xC49…"),
  // but all persisted rows in supabase use the lowercased form. Query by
  // the lowercased value so .eq matches exactly. Same pattern used across
  // the other supabase-*.ts helpers in this app.
  const walletAddress = activeAccount?.address
    ? activeAccount.address.toLowerCase()
    : null;

  const [card, setCard] = useState<RoebelCardRow | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!walletAddress) {
      setCard(null);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('v_roebel_card_overview')
        .select('*')
        .eq('wallet_address', walletAddress)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        // PGRST116 = no rows — treat as "no card yet" (advertising state).
        if (error.code !== 'PGRST116') {
          console.error('Error loading Röbel Card overview:', error);
        }
        setCard(null);
      } else {
        const row = (data as RoebelCardRow | null) ?? null;
        console.log('[RoebelCardContext] loaded card', {
          wallet: walletAddress,
          card_id: row?.card_id ?? null,
          status: row?.status ?? null,
          balance_cents: row?.balance_cents ?? null,
        });
        setCard(row);
      }
    } catch (err) {
      console.error('Unexpected error loading Röbel Card overview:', err);
      setCard(null);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<RoebelCardContextValue>(
    () => ({ card, isLoading, refresh: load }),
    [card, isLoading, load],
  );

  return <RoebelCardContext.Provider value={value}>{children}</RoebelCardContext.Provider>;
}

export function useRoebelCard(): RoebelCardContextValue {
  return useContext(RoebelCardContext);
}
