"use client";

import { useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const account = useActiveAccount();
  const isAutoConnecting = useIsAutoConnecting();

  useEffect(() => {
    if (isAutoConnecting || !account || !pathname) return;

    // Honor returnTo from AuthGuard bounce, when safe.
    const returnTo = searchParams?.get("returnTo") ?? null;
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
  }, [isAutoConnecting, account, pathname, searchParams, router]);

  return null;
}
