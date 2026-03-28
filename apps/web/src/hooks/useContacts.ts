"use client";

import { useState, useEffect, useCallback } from "react";
import { useActiveAccount } from "thirdweb/react";
import { getAllUsers } from "@/lib/supabase-users";
import type { ContactInfo } from "@/lib/messaging/types";

export function useContacts() {
  const account = useActiveAccount();
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchContacts = useCallback(async () => {
    if (!account) return;
    setIsLoading(true);

    try {
      const result = await getAllUsers(200, 0);
      if (!result.success || !result.data) return;

      // Filter out current user
      const otherUsers = result.data.filter(
        (u) => u.wallet_address.toLowerCase() !== account.address.toLowerCase()
      );

      // Map to ContactInfo
      const mapped: ContactInfo[] = otherUsers.map((u) => ({
        walletAddress: u.wallet_address,
        username: u.username,
        profilePictureUrl: u.profile_picture_url,
        isCitizen: Number(u.nft_balance) > 0,
      }));

      // Sort: citizens first, then alphabetical
      mapped.sort((a, b) => {
        if (a.isCitizen !== b.isCitizen) return a.isCitizen ? -1 : 1;
        return (a.username || "zzz").localeCompare(b.username || "zzz");
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
