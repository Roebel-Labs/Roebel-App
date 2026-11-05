"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EyeOff, MicOff, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase, hasSupabase } from "@/lib/supabase";
import { liveAdminSafe } from "./api";
import { CHAT_COLUMNS, formatClock, formatEuro, type LiveChatMessage, type LiveOverlay, type LiveShow } from "../types";

const LIMIT = 200;

/** Chat feed for the console (anon read: hidden rows are invisible by RLS). */
export function useLiveChat(showId: string | null) {
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!showId || !hasSupabase) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("live_chat_messages")
      .select(CHAT_COLUMNS)
      .eq("show_id", showId)
      .order("created_at", { ascending: false })
      .limit(LIMIT)
      .then(({ data }) => {
        if (!cancelled) setMessages(((data ?? []) as LiveChatMessage[]).reverse());
      });
    const ch = supabase
      .channel(`live-console-chat:${showId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_chat_messages", filter: `show_id=eq.${showId}` },
        (p) => {
          const m = p.new as LiveChatMessage;
          setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m].slice(-LIMIT)));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_chat_messages", filter: `show_id=eq.${showId}` },
        (p) => {
          const m = p.new as LiveChatMessage;
          setMessages((cur) =>
            m.hidden_at ? cur.filter((x) => x.id !== m.id) : cur.map((x) => (x.id === m.id ? { ...x, ...m } : x)),
          );
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [showId, nonce]);

  const removeLocal = (ids: string[]) => setMessages((cur) => cur.filter((m) => !ids.includes(m.id)));
  /** Refetch (anon RLS hides hidden rows, so an UPDATE that hides a row never arrives over Realtime). */
  const reload = () => setNonce((n) => n + 1);
  return { messages, removeLocal, reload };
}

export function ChatPanel({
  show,
  messages,
  removeLocal,
  reload,
  onLocalShow,
  onLocalOverlay,
}: {
  show: LiveShow;
  messages: LiveChatMessage[];
  removeLocal: (ids: string[]) => void;
  reload: () => void;
  onLocalShow: (patch: Partial<LiveShow>) => void;
  onLocalOverlay: (patch: Partial<LiveOverlay>) => void;
}) {
  const chat = useMemo(() => messages.filter((m) => m.kind !== "support"), [messages]);
  const featuredId = show.overlay.featured_message_id;
  const [system, setSystem] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [chat.length, autoScroll]);

  const setFlags = async (patch: { chat_enabled?: boolean; slow_mode_seconds?: number; voting_open?: boolean }) => {
    const before = {
      chat_enabled: show.chat_enabled,
      slow_mode_seconds: show.slow_mode_seconds,
      voting_open: show.voting_open,
    };
    const next = { ...before, ...patch };
    onLocalShow(next);
    const res = await liveAdminSafe("set_flags", show.id, next);
    if (!res) onLocalShow(before);
  };

  const hide = async (m: LiveChatMessage) => {
    const res = await liveAdminSafe("hide_message", show.id, { message_id: m.id }, "Ausgeblendet");
    if (res) {
      removeLocal([m.id]);
      if (featuredId === m.id) onLocalOverlay({ featured_message_id: null });
    }
  };

  const feature = async (m: LiveChatMessage | null) => {
    const prev = featuredId;
    onLocalOverlay({ featured_message_id: m?.id ?? null });
    const res = await liveAdminSafe("feature_message", show.id, { message_id: m?.id ?? null });
    if (!res) onLocalOverlay({ featured_message_id: prev });
  };

  const mute = async (m: LiveChatMessage) => {
    const name = m.display_name?.trim() || "diese Person";
    if (!window.confirm(`${name} für diese Übertragung stummschalten? Alle Nachrichten von ${name} werden ausgeblendet.`)) return;
    const res = await liveAdminSafe("mute", show.id, { message_id: m.id }, `${name} ist stummgeschaltet`);
    if (res) {
      // Server hides all their chat rows; refetch to drop them from the feed.
      if (featuredId === m.id) await feature(null);
      removeLocal([m.id]);
      reload();
    }
  };

  const sendSystem = async () => {
    const body = system.trim();
    if (!body) return;
    const res = await liveAdminSafe("system_message", show.id, { body }, "Gesendet");
    if (res) setSystem("");
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Chat</CardTitle>
          <span className="text-xs text-muted-foreground">{chat.length} Nachrichten</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
            <span className="text-sm font-semibold">Chat offen</span>
            <Switch checked={show.chat_enabled} onCheckedChange={(v) => setFlags({ chat_enabled: v })} />
          </label>
          <label className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
            <span className="text-sm font-semibold">Langsam</span>
            <select
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              value={show.slow_mode_seconds}
              onChange={(e) => setFlags({ slow_mode_seconds: Number(e.target.value) })}
            >
              {[0, 3, 5, 10, 30, 60].map((s) => (
                <option key={s} value={s}>
                  {s === 0 ? "aus" : `${s} s`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
            <span className="text-sm font-semibold">Abstimmung offen</span>
            <Switch checked={show.voting_open} onCheckedChange={(v) => setFlags({ voting_open: v })} />
          </label>
        </div>
        {featuredId && (
          <div className="flex items-center justify-between rounded-lg bg-[#00498B]/10 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 font-semibold text-[#00498B] dark:text-[#7ABBF2]">
              <Tv className="h-4 w-4" /> Nachricht ist auf Sendung
            </span>
            <Button size="sm" variant="outline" onClick={() => feature(null)}>
              Von Sendung nehmen
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
          }}
          className="h-[460px] space-y-1 overflow-y-auto rounded-lg border border-border p-2"
        >
          {chat.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Noch keine Nachrichten.</div>}
          {chat.map((m) => {
            const isFeatured = m.id === featuredId;
            return (
              <div
                key={m.id}
                className={`group flex items-start gap-3 rounded-md px-2 py-2 ${isFeatured ? "bg-[#00498B]/10 ring-1 ring-[#00498B]/40" : "hover:bg-muted/50"}`}
              >
                <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{formatClock(m.created_at)}</span>
                <div className="min-w-0 flex-1">
                  <span className="mr-2 font-semibold text-foreground">{m.display_name?.trim() || "Jemand"}</span>
                  {m.kind === "system" && (
                    <Badge variant="info" className="mr-2">
                      System
                    </Badge>
                  )}
                  <span className="break-words text-sm text-foreground/90">{m.body}</span>
                </div>
                {m.kind === "chat" && (
                  <div className="flex shrink-0 gap-1 opacity-70 group-hover:opacity-100">
                    <Button
                      size="sm"
                      variant={isFeatured ? "default" : "outline"}
                      className="h-8 px-2"
                      onClick={() => feature(isFeatured ? null : m)}
                      title={isFeatured ? "Von Sendung nehmen" : "Auf Sendung"}
                    >
                      <Tv className="h-4 w-4" />
                      <span className="ml-1 hidden xl:inline">{isFeatured ? "Runter" : "Auf Sendung"}</span>
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => hide(m)} title="Ausblenden">
                      <EyeOff className="h-4 w-4" />
                      <span className="ml-1 hidden xl:inline">Ausblenden</span>
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => mute(m)} title="Stummschalten">
                      <MicOff className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                {m.kind === "system" && (
                  <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => hide(m)} title="Ausblenden">
                    <EyeOff className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendSystem();
          }}
        >
          <Input
            value={system}
            maxLength={280}
            onChange={(e) => setSystem(e.target.value)}
            placeholder="Systemnachricht an alle im Chat (als „Röbel App“)"
          />
          <Button type="submit" disabled={!system.trim()}>
            Senden
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function SupportPanel({ messages }: { messages: LiveChatMessage[] }) {
  const supports = useMemo(() => messages.filter((m) => m.kind === "support").reverse(), [messages]);
  const total = supports.reduce((s, m) => s + (m.amount_cents ?? 0), 0);
  return (
    <Card>
      <CardHeader className="flex flex-row items-baseline justify-between space-y-0">
        <CardTitle className="text-lg">Unterstützungen</CardTitle>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums text-foreground">{formatEuro(total)}</div>
          <div className="text-xs text-muted-foreground">{supports.length} insgesamt</div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[260px] space-y-2 overflow-y-auto">
          {supports.length === 0 && <div className="py-4 text-center text-sm text-muted-foreground">Noch keine Unterstützung.</div>}
          {supports.map((m) => (
            <div key={m.id} className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  {m.display_name?.trim() || "Jemand"}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{formatClock(m.created_at)}</span>
                </div>
                {m.body && <div className="break-words text-sm text-muted-foreground">„{m.body}“</div>}
              </div>
              <div className="shrink-0 font-bold tabular-nums">{formatEuro(m.amount_cents)}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
