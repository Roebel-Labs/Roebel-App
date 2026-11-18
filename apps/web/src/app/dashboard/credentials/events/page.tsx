"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Award } from "lucide-react";
import { useCredentials } from "@/components/credentials/CredentialsContext";
import { countLine } from "@/lib/credentials/event-panel";
import { credentialsRequest } from "@/lib/credentials/client";

/** event_badges_list row (server: eventBadgesList in lib/credentials/event-badges.ts). */
type EventBadgeRow = {
  eventId: string;
  title: string;
  date: string;
  badge: { typeId: string; name: string; chain: "draft" | "onchain"; auto: boolean } | null;
  attendees: number;
  issued: number;
  accepted: number;
};

const day = (d: string) => {
  const t = Date.parse(d);
  return Number.isNaN(t) ? d : new Date(t).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

function badgeState(b: EventBadgeRow["badge"]): { label: string; style: string } {
  if (!b) return { label: "Kein Abzeichen", style: "bg-muted text-[#6B7280]" };
  if (b.chain === "draft") return { label: "Vorbereitet", style: "bg-amber-100 text-amber-800" };
  return { label: b.auto ? "Im Register · sofort" : "Im Register", style: "bg-green-100 text-green-800" };
}

/** All events of the org with their badge state; each row opens the event's "Abzeichen" tab. */
export default function CredentialEventsPage() {
  const { account, org } = useCredentials();
  const [rows, setRows] = useState<EventBadgeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await credentialsRequest<EventBadgeRow[]>(account, "org", "event_badges_list", { accountId: org.accountId });
    if (!r.ok) return setError(r.message);
    setRows(r.data);
  }, [account, org.accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="rounded-lg border border-[#B4B8C1] bg-card p-4 text-sm text-red-600">{error}</div>;
  if (!rows) return <div className="h-32 animate-pulse rounded-lg border border-[#B4B8C1] bg-card" aria-busy />;
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-[#B4B8C1] bg-card p-6 text-center text-sm text-[#6B7280]">
        Eure Organisation hat noch keine Veranstaltungen. Lege eine unter Events an, dann kannst du hier Abzeichen für die Teilnehmenden vergeben.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-[#B4B8C1] rounded-lg border border-[#B4B8C1] bg-card">
      {rows.map((e) => {
        const s = badgeState(e.badge);
        return (
          <li key={e.eventId}>
            <Link href={`/dashboard/events/${e.eventId}/edit?tab=abzeichen`} className="flex items-center gap-3 p-4 hover:bg-muted">
              <Award className="h-5 w-5 shrink-0 text-[#00498B]" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{e.title}</p>
                <p className="text-xs text-[#6B7280]">
                  {day(e.date)} · {countLine(e)}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.style}`}>{s.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
