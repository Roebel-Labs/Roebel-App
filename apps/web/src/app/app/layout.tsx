"use client";

import { AuthGuard } from "@/components/app/AuthGuard";
import { AppShell } from "@/components/app/AppShell";
import { MessagingProvider } from "@/components/messages/MessagingProvider";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <MessagingProvider>
        <AppShell>{children}</AppShell>
      </MessagingProvider>
    </AuthGuard>
  );
}
