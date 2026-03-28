"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { ChatView } from "@/components/messages/ChatView";
import { useActiveAccount } from "thirdweb/react";
import Link from "next/link";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);
  const router = useRouter();
  const account = useActiveAccount();

  if (!account) {
    return (
      <div className="min-h-screen bg-muted">
        <Header />
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <div className="max-w-sm w-full text-center">
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-lg font-medium mb-3 text-foreground">
                Anmeldung erforderlich
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Bitte melden Sie sich an, um Nachrichten anzuzeigen.
              </p>
              <Link
                href="/"
                className="inline-block bg-foreground hover:bg-foreground text-white px-5 py-2 rounded-md font-medium transition-colors text-sm"
              >
                Zur Startseite
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-card">
      <Header />
      <div className="flex-1 overflow-hidden">
        <ChatView
          conversationId={conversationId}
          onBack={() => router.push("/messages")}
        />
      </div>
    </div>
  );
}
