"use client";

import { AuthGuard } from "@/components/app/AuthGuard";
import { AppShell } from "@/components/app/AppShell";
import { MessagingProvider } from "@/components/messages/MessagingProvider";
import { AppModeProvider } from "@/lib/context/AppModeContext";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <AppModeProvider>
        <MessagingProvider>
          <AppShell>{children}</AppShell>
        </MessagingProvider>
      </AppModeProvider>
    </AuthGuard>
  );
}
