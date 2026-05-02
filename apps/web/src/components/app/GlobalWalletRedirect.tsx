"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useActiveAccount, useIsAutoConnecting } from "thirdweb/react";

// Routes that should NOT redirect to /app even when wallet is connected
const EXCLUDED_PREFIXES = [
  "/app",        // Already in the app
  "/api",        // API routes
  "/admin",      // Admin panel
  "/dashboard",  // Standalone org dashboard (its own layout, not under /app)
  "/datenschutz", // Legal pages
  "/impressum",
  "/privacy",
  "/delete-account",
  "/login",
  "/proposals/timeline", // Public verifiable governance timeline
];

function isSafeReturnTo(value: string | null): value is string {
  if (!value) return false;
  if (value.length > 2048) return false;
  if (!value.startsWith("/")) return false;
  // Reject protocol-relative URLs (//evil.com) and backslash tricks
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  return true;
}

export function GlobalWalletRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const account = useActiveAccount();
  const isAutoConnecting = useIsAutoConnecting();

  useEffect(() => {
    if (isAutoConnecting || !account || !pathname) return;

    // Read returnTo directly from window.location to avoid adding a
    // useSearchParams() call to the root layout, which would force every
    // statically prerendered page into a Suspense boundary (Next 15).
    const returnTo =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("returnTo")
        : null;
    if (isSafeReturnTo(returnTo)) {
      router.replace(returnTo);
      return;
    }

    const isExcluded = EXCLUDED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
    );

    if (!isExcluded) {
      router.replace("/app");
    }
  }, [isAutoConnecting, account, pathname, router]);

  return null;
}
