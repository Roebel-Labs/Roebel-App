import type React from "react";
import type { Metadata } from "next";
import { AuthGuard } from "@/components/app/AuthGuard";

export const metadata: Metadata = {
  title: "KI-Baukasten | Röbel App",
  description:
    "Baue Mini-Apps für die Röbel App mit KI — direkt im Browser, ohne Setup.",
};

// The AI editor is a standalone full-viewport workspace OUTSIDE the dashboard:
// external developers land here directly. Only a connected wallet is required —
// no org account, no dashboard chrome. App data/config lives in
// /dashboard/mini-apps; this page is exclusively the editor.
export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGuard>{children}</AuthGuard>;
}
