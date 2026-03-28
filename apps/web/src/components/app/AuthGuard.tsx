"use client";

import { useActiveAccount, useIsAutoConnecting } from "thirdweb/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function AppLoadingSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden bg-muted">
      {/* Sidebar skeleton */}
      <div className="hidden lg:flex lg:w-64 lg:flex-col border-r border-border bg-card p-4">
        <div className="h-8 w-32 bg-muted rounded animate-pulse mb-8" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-5 w-5 bg-muted rounded animate-pulse" />
              <div className="h-4 w-24 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {/* Header skeleton */}
        <div className="h-16 border-b border-border bg-card flex items-center px-4 gap-4">
          <div className="h-8 w-32 bg-muted rounded animate-pulse" />
          <div className="flex-1 max-w-md mx-auto">
            <div className="h-10 bg-muted rounded-full animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
            <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
          </div>
        </div>

        {/* Content skeleton */}
        <div className="flex-1 p-6">
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="h-16 bg-card rounded-lg border border-border animate-pulse" />
            <div className="h-10 bg-card rounded-lg border border-border animate-pulse" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-48 bg-card rounded-lg border border-border animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const isAutoConnecting = useIsAutoConnecting();
  const router = useRouter();
  const [hasChecked, setHasChecked] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Safety timeout to prevent infinite loading
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isAutoConnecting || timedOut) {
      setHasChecked(true);
      if (!account) {
        router.replace("/");
      }
    }
  }, [isAutoConnecting, account, router, timedOut]);

  // Still auto-connecting
  if ((isAutoConnecting && !timedOut) || !hasChecked) {
    return <AppLoadingSkeleton />;
  }

  // Not connected — redirect in progress
  if (!account) {
    return <AppLoadingSkeleton />;
  }

  return <>{children}</>;
}
