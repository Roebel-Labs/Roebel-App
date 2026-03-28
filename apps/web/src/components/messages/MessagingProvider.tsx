"use client";

import { createContext, useContext } from "react";
import { useActiveAccount } from "thirdweb/react";
import type { MessagingContextValue } from "@/lib/messaging/types";

const MessagingContext = createContext<MessagingContextValue>({
  isReady: false,
  walletAddress: null,
});

export function MessagingProvider({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();

  const value: MessagingContextValue = {
    isReady: !!account,
    walletAddress: account?.address?.toLowerCase() ?? null,
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
