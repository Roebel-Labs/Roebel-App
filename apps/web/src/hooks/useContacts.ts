"use client";

import { useState, useEffect, useCallback } from "react";
import { useActiveAccount } from "thirdweb/react";
import { supabase } from "@/lib/supabase";
import type { ContactInfo } from "@/lib/messaging/types";

interface AccountOwnerJoin {
  wallet_address: string;
  account: {
    id: string;
    account_type: "personal" | "organisation";
    name: string;
    avatar_url: string | null;
  } | null;
}

interface UserRow {
  wallet_address: string;
  username: string | null;
  profile_picture_url: string | null;
  nft_balance: number | string | null;
}

/**
 * List contactable accounts. Returns personal accounts only — org inboxes
 * are reached via deep-links, not the generic contact picker.
 *
 * Pulls one row per `account_owners` join, then enriches with the owner
 * wallet's `users` row for username/picture/citizen status.
 */
export function useContacts() {
  const account = useActiveAccount();
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchContacts = useCallback(async () => {
    if (!account) return;
    setIsLoading(true);

    try {
      const myWallet = account.address.toLowerCase();

      const { data: joins } = await supabase
        .from("account_owners")
        .select(
          "wallet_address, account:account_id(id, account_type, name, avatar_url)"
        )
        .limit(500);

      const personals = ((joins ?? []) as unknown as AccountOwnerJoin[]).filter(
        (j) =>
          j.account?.account_type === "personal" &&
          j.wallet_address.toLowerCase() !== myWallet
      );

      const wallets = Array.from(
        new Set(personals.map((j) => j.wallet_address.toLowerCase()))
      );

      const userByWallet = new Map<string, UserRow>();
      if (wallets.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("wallet_address, username, profile_picture_url, nft_balance")
          .in("wallet_address", wallets);
        for (const u of (users ?? []) as UserRow[]) {
          userByWallet.set(u.wallet_address.toLowerCase(), u);
        }
      }

      const mapped: ContactInfo[] = personals
        .map((j) => {
          const wallet = j.wallet_address.toLowerCase();
          const user = userByWallet.get(wallet);
          const account = j.account!;
          return {
            accountId: account.id,
            walletAddress: wallet,
            accountType: account.account_type,
            name: user?.username || account.name,
            username: user?.username ?? null,
            profilePictureUrl: user?.profile_picture_url ?? account.avatar_url,
            isCitizen: user ? Number(user.nft_balance ?? 0) > 0 : false,
          } satisfies ContactInfo;
        })
        // Dedupe in case the same wallet shows up twice (e.g. multi-owner orgs
        // shouldn't happen for personal accounts but guard anyway).
        .filter(
          (c, i, arr) => arr.findIndex((x) => x.accountId === c.accountId) === i
        );

      mapped.sort((a, b) => {
        if (a.isCitizen !== b.isCitizen) return a.isCitizen ? -1 : 1;
        return (a.name || "zzz").localeCompare(b.name || "zzz");
      });

      setContacts(mapped);
    } catch (err) {
      console.error("Error fetching contacts:", err);
    } finally {
      setIsLoading(false);
    }
  }, [account]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  return { contacts, isLoading, refetch: fetchContacts };
}
