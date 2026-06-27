"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { muenzenWrite } from "./data";
import { fmtRcrc } from "./format";
import { toast } from "@/hooks/use-toast";

export interface LootboxRow {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  coinsPerKey: number | null;
  guaranteedRewardType: string | null;
  isPublished: boolean;
  displayOrder: number | null;
  keysOutstanding: number;
  totalPurchased: number;
  totalUsed: number;
  rcrcRevenue: number;
  rcrcSales: number;
}

interface FormState {
  name: string;
  price: string;
  coinsPerKey: string;
  displayOrder: string;
  description: string;
  imageUrl: string;
  isPublished: boolean;
}

const empty: FormState = {
  name: "",
  price: "",
  coinsPerKey: "",
  displayOrder: "",
  description: "",
  imageUrl: "",
  isPublished: false,
};

function toForm(l: LootboxRow): FormState {
  return {
    name: l.name ?? "",
    price: String(l.price ?? ""),
    coinsPerKey: l.coinsPerKey != null ? String(l.coinsPerKey) : "",
    displayOrder: l.displayOrder != null ? String(l.displayOrder) : "",
    description: l.description ?? "",
    imageUrl: l.imageUrl ?? "",
    isPublished: l.isPublished,
  };
}

function LootboxForm({
  initial,
  onSubmit,
  onCancel,
  busy,
}: {
  initial: FormState;
  onSubmit: (f: FormState) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [f, setF] = useState(initial);
  const field = "rounded-md border border-border bg-background px-2 py-1.5 text-sm";
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <input className={field} placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input className={field} type="number" step="0.1" placeholder="Preis (RCRC)" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
      <input className={field} type="number" placeholder="Münzen pro Schlüssel" value={f.coinsPerKey} onChange={(e) => setF({ ...f, coinsPerKey: e.target.value })} />
      <input className={field} type="number" placeholder="Reihenfolge" value={f.displayOrder} onChange={(e) => setF({ ...f, displayOrder: e.target.value })} />
      <input className={`${field} sm:col-span-2`} placeholder="Bild-URL" value={f.imageUrl} onChange={(e) => setF({ ...f, imageUrl: e.target.value })} />
      <textarea className={`${field} sm:col-span-2`} placeholder="Beschreibung" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.isPublished} onChange={(e) => setF({ ...f, isPublished: e.target.checked })} />
        Veröffentlicht
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
          Abbrechen
        </button>
        <button
          type="button"
          disabled={busy || !f.name.trim()}
          onClick={() => onSubmit(f)}
          className="rounded-md bg-[#00498B] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "…" : "Speichern"}
        </button>
      </div>
    </div>
  );
}

export function LootboxManager({ rows, onChanged }: { rows: LootboxRow[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const payload = (f: FormState) => ({
    name: f.name.trim(),
    price: f.price === "" ? 0 : Number(f.price),
    coinsPerKey: f.coinsPerKey === "" ? null : Number(f.coinsPerKey),
    displayOrder: f.displayOrder === "" ? 0 : Number(f.displayOrder),
    description: f.description || null,
    imageUrl: f.imageUrl || null,
    isPublished: f.isPublished,
  });

  const create = async (f: FormState) => {
    setBusy(true);
    try {
      await muenzenWrite("lootboxes", "POST", payload(f));
      toast({ title: "Lootbox erstellt" });
      setCreating(false);
      onChanged();
    } catch (e) {
      toast({ title: "Fehler", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const update = async (id: string, f: FormState) => {
    setBusy(true);
    try {
      await muenzenWrite("lootboxes", "PATCH", { id, ...payload(f) });
      toast({ title: "Lootbox aktualisiert" });
      setEditing(null);
      onChanged();
    } catch (e) {
      toast({ title: "Fehler", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (l: LootboxRow) => {
    try {
      await muenzenWrite("lootboxes", "PATCH", { id: l.id, isPublished: !l.isPublished });
      onChanged();
    } catch (e) {
      toast({ title: "Fehler", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const remove = async (l: LootboxRow) => {
    if (!confirm(`Lootbox „${l.name}" löschen?`)) return;
    try {
      await muenzenWrite(`lootboxes?id=${l.id}`, "DELETE");
      toast({ title: "Lootbox gelöscht" });
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
          {creating ? "Abbrechen" : "Neue Lootbox"}
        </button>
      </div>

      {creating && (
        <Card className="border-dashed p-4">
          <LootboxForm initial={empty} busy={busy} onSubmit={create} onCancel={() => setCreating(false)} />
        </Card>
      )}

      <div className="space-y-2">
        {rows.map((l) => (
          <Card key={l.id} className="p-3">
            {editing === l.id ? (
              <LootboxForm initial={toForm(l)} busy={busy} onSubmit={(f) => update(l.id, f)} onCancel={() => setEditing(null)} />
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{l.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${l.isPublished ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
                      {l.isPublished ? "live" : "Entwurf"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fmtRcrc(l.price)} · {l.keysOutstanding} Schlüssel offen · {l.totalPurchased} gekauft · {fmtRcrc(l.rcrcRevenue)} Erlös
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => togglePublish(l)} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
                    {l.isPublished ? "Verbergen" : "Live"}
                  </button>
                  <button type="button" onClick={() => setEditing(l.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => remove(l)} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </Card>
        ))}
        {rows.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Noch keine Lootboxen.</p>}
      </div>
    </div>
  );
}
