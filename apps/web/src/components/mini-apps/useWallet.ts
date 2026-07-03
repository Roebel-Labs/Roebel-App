"use client";

// The connected thirdweb smart-account address, used as the builder's identity
// (→ a `developers` row server-side). See INTEGRATION NEEDS re: token hardening.
import { useActiveAccount } from "thirdweb/react";

export function useWalletAddress(): string | undefined {
  return useActiveAccount()?.address;
}
