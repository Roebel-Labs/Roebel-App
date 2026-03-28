"use client";

import { MessagingProvider } from "@/components/messages/MessagingProvider";

export default function MessagesRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MessagingProvider>{children}</MessagingProvider>;
}
