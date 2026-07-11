"use client";

// "Letzter KI-Chat" — surfaces the developer's most recent editor chat on the
// mini-app dashboard with a one-click way back into the builder. Data comes
// from the server-side chat history (/api/mini-apps/chats); renders nothing
// until at least one chat exists.
import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, ArrowRight, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ChatMeta {
  id: string;
  updated_at: string;
  title: string | null;
  app_slug: string | null;
  preview: string | null;
  shared: boolean;
}

function timeLabel(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const min = Math.round(diff / 60_000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "long" });
}

export function LatestChatCard({ wallet }: { wallet: string | null }) {
  const [chat, setChat] = useState<ChatMeta | null>(null);

  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    void fetch("/api/mini-apps/chats?limit=1", {
      headers: { "x-wallet-address": wallet },
      cache: "no-store",
    })
      .then(async (res) => (res.ok ? ((await res.json()) as { chats?: ChatMeta[] }) : null))
      .then((data) => {
        if (!cancelled && data?.chats?.length) setChat(data.chats[0]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  if (!chat) return null;

  return (
    <Card className="mt-4 flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary/10 text-primary">
        <MessageSquare className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="truncate">{chat.title || chat.app_slug || "Letzter KI-Chat"}</span>
          {chat.shared ? <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {chat.preview || "—"} · {timeLabel(chat.updated_at)}
        </p>
      </div>
      <Link href={`/editor?chat=${chat.id}`} className="shrink-0">
        <Button size="sm" variant="outline">
          Weiterbauen <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </Link>
    </Card>
  );
}
