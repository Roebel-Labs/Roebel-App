"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type AuditRow = {
  id: string;
  event_type: string;
  actor_wallet: string | null;
  target_id: string | null;
  tx_hash: string | null;
  payload: unknown;
  created_at: string;
};

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Alle" },
  { value: "share_key_registered", label: "Share-Key registriert" },
  { value: "key_generated", label: "Schlüssel generiert" },
  { value: "pubkey_set_proposed", label: "Proposal eingereicht" },
  { value: "pubkey_set_executed", label: "Ausgeführt" },
  { value: "session_trigger_requested", label: "Session getriggert" },
  { value: "session_opened", label: "Session offen" },
  { value: "share_submitted", label: "Anteil eingereicht" },
  { value: "session_completed", label: "Session beendet" },
  { value: "session_expired", label: "Session abgelaufen" },
  { value: "session_aborted", label: "Session abgebrochen" },
];

const PAGE_SIZE = 50;

export default function CoordinatorHistoryPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [eventType, setEventType] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (cursorArg: string | null, eventTypeArg: string, append: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
        if (cursorArg) qs.set("cursor", cursorArg);
        if (eventTypeArg) qs.set("eventType", eventTypeArg);
        const res = await fetch(`/api/coordinator/audit-log?${qs}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        setRows((prev) => (append ? [...prev, ...json.rows] : json.rows));
        setNextCursor(json.nextCursor as string | null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchPage(null, eventType, false);
  }, [eventType, fetchPage]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-foreground">
            Coordinator Audit-Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vollständiger zeitlicher Verlauf aller Coordinator-Operationen.
            Filtere nach Event-Typ; scrolle nach unten und klicke "Mehr laden"
            für ältere Einträge.
          </p>
        </div>
        <Link href="/admin/dashboard/coordinator">
          <Button variant="outline">← Zurück zur Übersicht</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle>Filter</CardTitle>
            <select
              value={eventType}
              onChange={(e) => {
                setRows([]);
                setEventType(e.target.value);
              }}
              className="bg-card border border-border rounded-md px-3 py-2 text-sm"
            >
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <CardDescription>
            {rows.length} Einträge geladen
            {nextCursor ? " (weitere verfügbar)" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 mb-3">
              {error}
            </div>
          )}
          {rows.length === 0 && !loading ? (
            <div className="text-sm text-muted-foreground">
              Keine Einträge für diesen Filter.
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="border border-border rounded p-3 text-xs space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className="font-mono">
                      {row.event_type}
                    </Badge>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString("de-DE")}
                    </span>
                  </div>
                  {row.actor_wallet && (
                    <div>
                      <span className="text-muted-foreground">Wallet: </span>
                      <span className="font-mono break-all">
                        {row.actor_wallet}
                      </span>
                    </div>
                  )}
                  {row.target_id && (
                    <div>
                      <span className="text-muted-foreground">Target: </span>
                      <span className="font-mono break-all">
                        {row.target_id}
                      </span>
                    </div>
                  )}
                  {row.tx_hash && (
                    <div>
                      <a
                        href={`https://basescan.org/tx/${row.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-700 underline font-mono"
                      >
                        Tx {row.tx_hash.slice(0, 14)}…
                      </a>
                    </div>
                  )}
                  {row.payload != null && (
                    <details>
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Payload
                      </summary>
                      <pre className="mt-2 bg-muted border border-border rounded p-2 overflow-auto text-[10px] font-mono">
                        {JSON.stringify(row.payload, null, 2)}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
          {nextCursor && (
            <div className="pt-4 border-t border-border mt-4">
              <Button
                type="button"
                onClick={() => {
                  fetchPage(nextCursor, eventType, true);
                }}
                disabled={loading}
                variant="outline"
                className="w-full"
              >
                {loading ? "Lade…" : "Mehr laden"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
