"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useActiveAccount, useIsAutoConnecting } from "thirdweb/react";

function isSafeReturnTo(value: string | null): value is string {
  if (!value) return false;
  if (value.length > 2048) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  return true;
}

// Honors `?returnTo=` after connect (used by AuthGuard).
// Default redirect to /app was removed so marketing pages stay reachable
// after the user signs in.
export function GlobalWalletRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const account = useActiveAccount();
  const isAutoConnecting = useIsAutoConnecting();

  useEffect(() => {
    if (isAutoConnecting || !account || !pathname) return;

    const returnTo =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("returnTo")
        : null;
    if (isSafeReturnTo(returnTo)) {
      router.replace(returnTo);
    }
  }, [isAutoConnecting, account, pathname, router]);

  return null;
}
