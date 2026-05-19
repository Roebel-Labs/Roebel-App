"use client";

import { createContext, useContext } from "react";
import { useActiveAccount } from "thirdweb/react";
import { useAccount } from "@/lib/context/AccountContext";
import type { MessagingContextValue } from "@/lib/messaging/types";

const MessagingContext = createContext<MessagingContextValue>({
  isReady: false,
  walletAddress: null,
  activeAccountId: null,
});

export function MessagingProvider({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const { activeAccount } = useAccount();

  const value: MessagingContextValue = {
    isReady: !!activeAccount?.id,
    walletAddress: account?.address?.toLowerCase() ?? null,
    activeAccountId: activeAccount?.id ?? null,
  };

  return (
    <MessagingContext.Provider value={value}>
      {children}
    </MessagingContext.Provider>
  );
}

export function useMessagingContext() {
  return useContext(MessagingContext);
}
