"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useActiveAccount, useIsAutoConnecting } from "thirdweb/react";

// Routes that should NOT redirect to /app even when wallet is connected
const EXCLUDED_PREFIXES = [
  "/app",        // Already in the app
  "/api",        // API routes
  "/admin",      // Admin panel
  "/datenschutz", // Legal pages
  "/impressum",
  "/privacy",
  "/delete-account",
  "/login",
];

export function GlobalWalletRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const account = useActiveAccount();
  const isAutoConnecting = useIsAutoConnecting();

  useEffect(() => {
    if (isAutoConnecting || !account || !pathname) return;

    const isExcluded = EXCLUDED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
    );

    if (!isExcluded) {
      router.replace("/app");
    }
  }, [isAutoConnecting, account, pathname, router]);

  return null;
}
