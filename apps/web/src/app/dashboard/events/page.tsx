"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "@/lib/context/AccountContext";
import { createClient } from "@/lib/supabase/client";
import { Calendar, Plus } from "lucide-react";

interface EventRow {
  id: string;
  title: string | null;
  starts_at: string | null;
  status: string | null;
}

export default function OrgEventsPage() {
  const { activeAccount } = useAccount();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeAccount) return;
    const supabase = createClient();
    supabase
      .from("events")
      .select("id, title, starts_at, status")
      .eq("account_id", activeAccount.id)
      .order("starts_at", { ascending: false })
      .then(({ data }) => {
        setEvents((data as EventRow[]) || []);
        setLoading(false);
      });
  }, [activeAccount]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium">Events</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Veranstaltungen dieser Organisation.
          </p>
        </div>
        <Link
          href="/app/submit"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Neues Event
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-16 bg-muted rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-[10px]">
          <Calendar className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Noch keine Events.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => (
            <div
              key={ev.id}
              className="flex items-center justify-between bg-card border border-border rounded-lg p-4"
            >
              <div>
                <p className="text-sm font-medium">{ev.title ?? "Ohne Titel"}</p>
                <p className="text-xs text-muted-foreground">
                  {ev.starts_at
                    ? new Date(ev.starts_at).toLocaleString("de-DE")
                    : "—"}
                </p>
              </div>
              {ev.status && (
                <span className="text-xs text-muted-foreground">
                  {ev.status}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
