"use client";

// "Beliebte Apps" — the public global mini-app ranking: every published app
// ranked by aktive Nutzer over the trailing 7 days. Medal tiles for the top 3,
// search, and a countdown to the next weekly refresh (freitags 18 Uhr — the
// Sommer-Camp-Rhythmus). No wallet required.
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, Globe, Info, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AppIcon } from "@/components/mini-apps/ui";
import type { AppRankings } from "@/lib/miniapp/types";

const nf = new Intl.NumberFormat("de-DE");

// Wöchentlicher Takt: freitags 18:00 deutscher Zeit (wie die Camp-Runden).
function msUntilNextFriday18(now: Date): number {
  const berlin = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const target = new Date(berlin);
  target.setDate(berlin.getDate() + ((5 - berlin.getDay() + 7) % 7));
  target.setHours(18, 0, 0, 0);
  if (target.getTime() <= berlin.getTime()) target.setDate(target.getDate() + 7);
  return target.getTime() - berlin.getTime();
}

function CountdownCard() {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setRemaining(msUntilNextFriday18(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const total = Math.max(0, Math.floor((remaining ?? 0) / 1000));
  const cells = [
    { v: Math.floor(total / 86400), label: "Tage" },
    { v: Math.floor((total % 86400) / 3600), label: "Std" },
    { v: Math.floor((total % 3600) / 60), label: "Min" },
    { v: total % 60, label: "Sek" },
  ];

  return (
    <Card className="overflow-hidden">
      <p className="border-b border-border bg-muted/50 px-6 py-2.5 text-center text-sm text-muted-foreground">
        Nächste Runde in
      </p>
      <div className="flex items-start justify-center gap-6 px-6 py-3">
        {cells.map((c) => (
          <div key={c.label} className="text-center">
            <p className="font-heading text-2xl font-bold tabular-nums">
              {remaining === null ? "–" : String(c.v).padStart(2, "0")}
            </p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Rank tile: gold/silver/bronze medal look for the top 3, plain after. */
function RankTile({ rank }: { rank: number }) {
  const medal =
    rank === 1
      ? "bg-gradient-to-b from-[#FFE28A] to-[#E3A82B] text-[#7A5200] shadow"
      : rank === 2
        ? "bg-gradient-to-b from-[#EDEDEF] to-[#B9BCC4] text-[#565A64] shadow"
        : rank === 3
          ? "bg-gradient-to-b from-[#E8B98A] to-[#B0713A] text-[#5E3714] shadow"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-sm font-bold",
        medal,
      )}
    >
      {rank}
    </span>
  );
}

export default function RankingsPage() {
  const [data, setData] = useState<AppRankings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/mini-apps/rankings", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) setError(String(json.error));
        else setData(json as AppRankings);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const all = (data?.apps ?? []).map((a, i) => ({ ...a, rank: i + 1 }));
    const query = q.trim().toLowerCase();
    if (!query) return all;
    return all.filter(
      (a) => a.name.toLowerCase().includes(query) || a.slug.toLowerCase().includes(query),
    );
  }, [data, q]);

  const updatedAt = data
    ? new Intl.DateTimeFormat("de-DE", { dateStyle: "full" }).format(new Date(data.generatedAt))
    : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <Link
            href="/dashboard/mini-apps"
            aria-label="Zurück zum Dashboard"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="inline-flex items-center gap-1 rounded-full border border-border p-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-3.5 py-1 text-sm font-semibold shadow-sm">
              <Image src="/logo.png" alt="" width={16} height={16} className="h-4 w-4 object-contain" />
              Röbel App
            </span>
            <span
              title="Getrennte Web-Auswertung kommt bald"
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full px-3.5 py-1 text-sm text-muted-foreground/60"
            >
              <Globe className="h-4 w-4" /> Web
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-tight">Beliebte Apps</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {updatedAt ? `Stand: ${updatedAt}` : "Wird geladen …"} · aktive Nutzer der
              letzten {data?.windowDays ?? 7} Tage
            </p>
            <Link
              href="/developers/mini-apps"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <Info className="h-4 w-4" /> FAQs
            </Link>
          </div>
          <CountdownCard />
        </div>

        <div className="relative mt-8">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nach App-Name oder URL suchen"
            className="w-full rounded-xl border border-border bg-background py-3 pl-11 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          {error ? (
            <p className="p-8 text-center text-sm text-red-600">{error}</p>
          ) : !data ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                  <div className="h-10 w-10 animate-pulse rounded-[12px] bg-muted/60" />
                  <div className="h-10 w-10 animate-pulse rounded-[12px] bg-muted/50" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-36 animate-pulse rounded bg-muted/60" />
                    <div className="h-3 w-52 animate-pulse rounded bg-muted/50" />
                  </div>
                  <div className="h-4 w-16 animate-pulse rounded bg-muted/50" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              {q
                ? "Keine App passt zu deiner Suche."
                : "Noch keine veröffentlichten Apps — bald geht's los!"}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((a) => (
                <div key={a.id} className="flex items-center gap-4 p-4">
                  <RankTile rank={a.rank} />
                  <AppIcon name={a.name} iconUrl={a.icon_url} color={a.primary_color} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{a.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.slug}.roebel.site
                    </p>
                  </div>
                  <p className="shrink-0 text-sm">
                    <span className="font-bold">{nf.format(a.users)}</span>{" "}
                    <span className="text-muted-foreground">Nutzer</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
