"use client";

// The dashboard's primary "build with AI" banner — stateful and scoped to the
// currently selected mini app. With no chat yet for this app it invites
// creating a new AI chat ("Mit KI erstellen" → /editor?app=<slug>, so the new
// chat binds to this app). Once a chat exists it morphs into the latest chat's
// info with a "Weiterbauen" action that reopens only that chat
// (/editor?chat=<id>). Chat history comes from /api/mini-apps/chats, filtered
// to this app's slug. Replaces the former standalone LatestChatCard.
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MiniAppRow } from "@/lib/miniapp/types";

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

const SHELL =
  "mt-10 flex flex-col items-start gap-4 bg-primary p-6 text-primary-foreground sm:flex-row sm:items-center";

export function AppBuilderBanner({
  app,
  wallet,
}: {
  app: MiniAppRow | null;
  wallet: string | null;
}) {
  const slug = app?.slug ?? null;
  const [chat, setChat] = useState<ChatMeta | null>(null);

  useEffect(() => {
    // Reset while (re)resolving so a freshly selected app never flashes the
    // previous app's chat — default state is the "create" invite.
    setChat(null);
    if (!wallet || !slug) return;
    let cancelled = false;
    void fetch("/api/mini-apps/chats?limit=100", {
      headers: { "x-wallet-address": wallet },
      cache: "no-store",
    })
      .then(async (res) => (res.ok ? ((await res.json()) as { chats?: ChatMeta[] }) : null))
      .then((data) => {
        if (cancelled || !data?.chats) return;
        const latest = data.chats
          .filter((c) => c.app_slug === slug)
          .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];
        setChat(latest ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [wallet, slug]);

  // Weiterbauen — this app already has an AI chat: reopen the latest one only.
  if (chat) {
    return (
      <Card className={SHELL}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white/15 text-white">
          <MessageSquare className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-lg font-bold">
            {chat.title || app?.name || "Weiterbauen"}
          </p>
          <p className="truncate text-sm text-primary-foreground/80">
            {chat.preview || "Weiter am KI-Chat dieser Mini-App bauen."} ·{" "}
            {timeLabel(chat.updated_at)}
          </p>
        </div>
        <Link href={`/editor?chat=${chat.id}`} className="shrink-0">
          <Button variant="secondary" className="rounded-full font-bold">
            Weiterbauen <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </Link>
      </Card>
    );
  }

  // No chat yet for this app — start a new AI chat bound to it.
  return (
    <Card className={SHELL}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white">
        <Image
          src="/logo.png"
          alt=""
          width={30}
          height={30}
          className="h-[30px] w-[30px] object-contain"
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-lg font-bold">Bau die nächste Mini-App mit KI</p>
        <p className="text-sm text-primary-foreground/80">
          Idee beschreiben, live testen, veröffentlichen — direkt im Browser.
        </p>
      </div>
      <Link href={slug ? `/editor?app=${slug}` : "/editor"} className="shrink-0">
        <Button variant="secondary" className="rounded-full font-bold">
          <Sparkles className="mr-1.5 h-4 w-4" /> Mit KI erstellen
        </Button>
      </Link>
    </Card>
  );
}
