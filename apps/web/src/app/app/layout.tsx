"use client";

import { AuthGuard } from "@/components/app/AuthGuard";
import { AppShell } from "@/components/app/AppShell";
import { MessagingProvider } from "@/components/messages/MessagingProvider";
import { AccountProvider } from "@/lib/context/AccountContext";
import { AppModeProvider } from "@/lib/context/AppModeContext";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <AccountProvider>
        <AppModeProvider>
          <MessagingProvider>
            <AppShell>{children}</AppShell>
          </MessagingProvider>
        </AppModeProvider>
      </AccountProvider>
    </AuthGuard>
  );
}
