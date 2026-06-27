"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { muenzenWrite } from "./data";
import { fmtDateTime } from "./format";
import { toast } from "@/hooks/use-toast";

export interface EventRow {
  id: string;
  label: string;
  startsAt: string | null;
  expiresAt: string | null;
  active: boolean;
  live: boolean;
  createdBy: string | null;
  createdAt: string | null;
  attendance: number;
}

function toIso(localValue: string): string | null {
  if (!localValue) return null;
  const d = new Date(localValue);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function EventManager({ rows, onChanged }: { rows: EventRow[]; onChanged: () => void }) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [starts, setStarts] = useState("");
  const [expires, setExpires] = useState("");

  const field = "rounded-md border border-border bg-background px-2 py-1.5 text-sm";

  const create = async () => {
    if (!label.trim()) return;
    setBusy(true);
    try {
      await muenzenWrite("events", "POST", {
        label: label.trim(),
        startsAt: toIso(starts),
        expiresAt: toIso(expires),
        active: true,
      });
      toast({ title: "Event angelegt" });
      setLabel("");
      setStarts("");
      setExpires("");
      setCreating(false);
      onChanged();
    } catch (e) {
      toast({ title: "Fehler", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (ev: EventRow) => {
    try {
      await muenzenWrite("events", "PATCH", { id: ev.id, active: !ev.active });
      onChanged();
    } catch (e) {
      toast({ title: "Fehler", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const remove = async (ev: EventRow) => {
    if (!confirm(`Event „${ev.label}" löschen?`)) return;
    try {
      await muenzenWrite(`events?id=${ev.id}`, "DELETE");
      toast({ title: "Event gelöscht" });
      onChanged();
    } catch (e) {
      toast({ title: "Fehler", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {creating ? "Abbrechen" : "Neues Event"}
        </button>
      </div>

      {creating && (
        <Card className="border-dashed p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <input className={`${field} sm:col-span-2`} placeholder="Event-Bezeichnung" value={label} onChange={(e) => setLabel(e.target.value)} />
            <label className="text-xs text-muted-foreground">
              Start
              <input className={`${field} mt-1 w-full`} type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
            </label>
            <label className="text-xs text-muted-foreground">
              Ende
              <input className={`${field} mt-1 w-full`} type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </label>
            <div className="flex justify-end sm:col-span-2">
              <button
                type="button"
                disabled={busy || !label.trim()}
                onClick={create}
                className="rounded-md bg-[#00498B] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "…" : "Anlegen"}
              </button>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {rows.map((ev) => (
          <Card key={ev.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{ev.label}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs ${ev.live ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
                  {ev.live ? "läuft" : ev.active ? "geplant" : "inaktiv"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {fmtDateTime(ev.startsAt ? Date.parse(ev.startsAt) : null)} – {fmtDateTime(ev.expiresAt ? Date.parse(ev.expiresAt) : null)} · {ev.attendance} Teilnahmen
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => toggleActive(ev)} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
                {ev.active ? "Deaktivieren" : "Aktivieren"}
              </button>
              <button type="button" onClick={() => remove(ev)} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ))}
        {rows.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Noch keine Events registriert.</p>}
      </div>
    </div>
  );
}
