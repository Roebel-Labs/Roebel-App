"use client";

// "Mitteilungen" card on the app detail pages (developer + admin): shows how
// many users opted in, sends a broadcast to all of them (max 3/Tag), and
// lists the recent sends. Delivery runs through the notifications push hub.
import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailCard } from "@/components/mini-apps/ui";
import type { MiniAppRow } from "@/lib/miniapp/types";

type SendLog = {
  id: string;
  created_at: string;
  title: string;
  body: string;
  target_url: string | null;
  recipients: number;
};

const DATE_FMT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function NotificationsSection({
  app,
  wallet,
}: {
  app: MiniAppRow;
  /** null → admin session cookie authenticates instead of the wallet header. */
  wallet: string | null;
}) {
  const [optins, setOptins] = useState<number | null>(null);
  const [sends, setSends] = useState<SendLog[]>([]);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/mini-apps/notifications?appId=${app.id}`, {
      cache: "no-store",
      headers: wallet ? { "x-wallet-address": wallet } : undefined,
    })
      .then((r) => r.json())
      .then((j) => {
        if (typeof j.optins === "number") setOptins(j.optins);
        if (Array.isArray(j.sends)) setSends(j.sends as SendLog[]);
      })
      .catch(() => {});
  }, [app.id, wallet]);

  useEffect(load, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/mini-apps/notifications`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(wallet ? { "x-wallet-address": wallet } : {}),
        },
        body: JSON.stringify({
          appId: app.id,
          broadcast: true,
          title,
          body: text,
          targetUrl: targetUrl || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setOkMsg(
        json.recipients === 0
          ? "Gesendet — aktuell hat aber noch niemand Benachrichtigungen aktiviert."
          : `Gesendet an ${json.recipients} Nutzer:innen.`,
      );
      setTitle("");
      setText("");
      setTargetUrl("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const notLive = app.status !== "live";

  return (
    <DetailCard title="Mitteilungen">
      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Bell className="h-4 w-4" />
        {optins === null ? "Lade …" : `${optins} Nutzer:innen haben Benachrichtigungen aktiviert.`}
      </div>

      {notLive ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Mitteilungen lassen sich senden, sobald die App live ist.
        </p>
      ) : (
        <form onSubmit={send} className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={80}
            placeholder="Titel (max. 80 Zeichen)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
            maxLength={200}
            rows={2}
            placeholder="Nachricht (max. 200 Zeichen)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="Ziel-URL (optional, https://…)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          )}
          {okMsg && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-200">
              {okMsg}
            </p>
          )}
          <Button type="submit" size="sm" disabled={busy || !title || !text}>
            {busy ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1 h-3.5 w-3.5" />
            )}
            An alle senden
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Maximal 3 Mitteilungen pro Tag. Nur Nutzer:innen, die
            Benachrichtigungen für diese App aktiviert haben, erhalten sie.
          </p>
        </form>
      )}

      {sends.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Zuletzt gesendet
          </p>
          <ul className="space-y-2">
            {sends.map((s) => (
              <li key={s.id} className="text-sm">
                <span className="font-medium">{s.title}</span>{" "}
                <span className="text-muted-foreground">
                  · {DATE_FMT.format(new Date(s.created_at))} · {s.recipients} Empfänger
                </span>
                <p className="text-xs text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DetailCard>
  );
}
