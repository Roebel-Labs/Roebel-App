"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { muenzenWrite } from "./data";
import { toast } from "@/hooks/use-toast";

export interface ConfigRow {
  action: string;
  label: string;
  amount: number;
  amountAtto: string;
  enabled: boolean;
  perReference: boolean;
  cooldownHours: number | null;
  dailyCap: number | null;
  description: string | null;
}

type Edit = { amount: number; dailyCap: number | null; cooldownHours: number | null; enabled: boolean };

function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function RewardConfigEditor({ rows, onChanged }: { rows: ConfigRow[]; onChanged: () => void }) {
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const editOf = (r: ConfigRow): Edit =>
    edits[r.action] ?? {
      amount: r.amount,
      dailyCap: r.dailyCap,
      cooldownHours: r.cooldownHours,
      enabled: r.enabled,
    };
  const set = (action: string, patch: Partial<Edit>) =>
    setEdits((e) => ({ ...e, [action]: { ...editOf(rows.find((r) => r.action === action)!), ...e[action], ...patch } }));

  const dirty = (r: ConfigRow) => {
    const e = edits[r.action];
    if (!e) return false;
    return (
      e.amount !== r.amount ||
      e.dailyCap !== r.dailyCap ||
      e.cooldownHours !== r.cooldownHours ||
      e.enabled !== r.enabled
    );
  };

  const save = async (r: ConfigRow) => {
    const e = editOf(r);
    setSaving(r.action);
    try {
      await muenzenWrite("reward-config", "POST", {
        action: r.action,
        amount: e.amount,
        dailyCap: e.dailyCap,
        cooldownHours: e.cooldownHours,
        enabled: e.enabled,
      });
      toast({ title: "Gespeichert", description: `${r.label} aktualisiert.` });
      setEdits((prev) => {
        const next = { ...prev };
        delete next[r.action];
        return next;
      });
      onChanged();
    } catch (err) {
      toast({ title: "Fehler", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-2 font-medium">Aktion</th>
            <th className="px-2 py-2 font-medium">Betrag (RCRC)</th>
            <th className="px-2 py-2 font-medium">Tageslimit</th>
            <th className="px-2 py-2 font-medium">Cooldown (h)</th>
            <th className="px-2 py-2 font-medium">Aktiv</th>
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const e = editOf(r);
            return (
              <tr key={r.action} className="border-b border-border/60">
                <td className="px-2 py-2">
                  <p className="font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{r.description}</p>
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    step="0.1"
                    value={e.amount}
                    onChange={(ev) => set(r.action, { amount: Number(ev.target.value) })}
                    className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    placeholder="—"
                    value={e.dailyCap ?? ""}
                    onChange={(ev) => set(r.action, { dailyCap: numOrNull(ev.target.value) })}
                    className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    placeholder="—"
                    value={e.cooldownHours ?? ""}
                    onChange={(ev) => set(r.action, { cooldownHours: numOrNull(ev.target.value) })}
                    className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={e.enabled}
                    onClick={() => set(r.action, { enabled: !e.enabled })}
                    className={`relative h-5 w-9 rounded-full transition-colors ${e.enabled ? "bg-emerald-500" : "bg-muted"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${e.enabled ? "left-4" : "left-0.5"}`} />
                  </button>
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    disabled={!dirty(r) || saving === r.action}
                    onClick={() => save(r)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saving === r.action ? "…" : "Speichern"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
