"use client";

import { useCallback, useEffect, useState } from "react";
import { EyeOff, Flag, MicOff, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { liveAdmin, liveAdminSafe } from "./api";
import type { LiveShow } from "../types";

type Report = {
  message_id: string; display_name: string; body: string; hidden: boolean; count: number; reasons: string[]; last_at: string;
};

const REASON: Record<string, string> = { spam: "Spam", abuse: "Beleidigung", other: "Anderes" };

/** Viewer reports from the app (3 reporters hide a message automatically); polled every 10 s. */
export function ReportsPanel({ show }: { show: LiveShow }) {
  const [reports, setReports] = useState<Report[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await liveAdmin<{ reports: Report[] }>("reports_list", show.id);
      setReports(data.reports ?? []);
    } catch {
      // Table missing until migration 20261106b runs, or a transient error: keep the last list.
    }
  }, [show.id]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(t);
  }, [load]);

  const act = async (action: string, r: Report, success: string) => {
    if (await liveAdminSafe(action, show.id, { message_id: r.message_id }, success)) void load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Flag className="size-4" /> Meldungen
        </CardTitle>
        {reports.length > 0 && <Badge variant="secondary">{reports.length}</Badge>}
      </CardHeader>
      <CardContent className="space-y-2">
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Meldungen. Ab 3 Meldungen wird eine Nachricht automatisch ausgeblendet.</p>
        ) : (
          reports.map((r) => (
            <div key={r.message_id} className="space-y-1 rounded-md border p-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold">{r.display_name}</span>
                <Badge variant={r.count >= 3 ? "destructive" : "outline"}>{r.count}× gemeldet</Badge>
                <span className="text-xs text-muted-foreground">{r.reasons.map((x) => REASON[x] ?? x).join(", ")}</span>
                {r.hidden && <span className="text-xs text-muted-foreground">· ausgeblendet</span>}
              </div>
              <p className="break-words text-sm">{r.body || "—"}</p>
              <div className="flex flex-wrap gap-1">
                {!r.hidden && (
                  <Button size="sm" variant="outline" onClick={() => act("hide_message", r, "Ausgeblendet")}>
                    <EyeOff className="mr-1 size-3.5" /> Ausblenden
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => act("mute", r, `${r.display_name} ist stummgeschaltet`)}>
                  <MicOff className="mr-1 size-3.5" /> Stummschalten
                </Button>
                <Button size="sm" variant="ghost" onClick={() => act("unmute", r, `${r.display_name} darf wieder schreiben`)}>
                  <Mic className="mr-1 size-3.5" /> Freischalten
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
