"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Pencil, Trash2, Upload, Plus, Check, X, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiveAdminError, liveAdmin, liveAdminSafe } from "./api";
import { currentItem, formatClock, nextItem, type LiveRundownItem, type LiveShow } from "../types";

type Row = { title: string; subtitle: string; detail: string; time: string };
const EMPTY_ROW: Row = { title: "", subtitle: "", detail: "", time: "" };

/** "14:30" on the show's day (Europe/Berlin as the operator's browser sees it) → ISO; full dates pass through. */
function timeToIso(time: string, show: LiveShow): string | null {
  const t = time.trim();
  if (!t) return null;
  const hm = /^(\d{1,2})[:.](\d{2})$/.exec(t);
  if (hm) {
    const base = show.starts_at ? new Date(show.starts_at) : new Date();
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Number(hm[1]), Number(hm[2]));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const parsed = Date.parse(t);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** Titel;Untertitel;Details;Uhrzeit — separator auto-detected (tab, ; or ,), header row skipped. */
export function parseRundownCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const first = lines[0];
  const sep = first.includes("\t") ? "\t" : first.includes(";") ? ";" : ",";
  const split = (line: string): string[] => {
    // Minimal quote support: "a, b";c
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (c === sep && !q) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const rows = lines.map(split);
  if (/^titel$/i.test(rows[0][0] ?? "")) rows.shift();
  return rows
    .map(([title = "", subtitle = "", detail = "", time = ""]) => ({ title, subtitle, detail, time }))
    .filter((r) => r.title);
}

export function RundownPanel({
  show,
  items,
  onChanged,
}: {
  show: LiveShow;
  items: LiveRundownItem[];
  onChanged: () => void;
}) {
  const cur = currentItem(show, items);
  const next = nextItem(show, items);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const runStage = useCallback(
    async (fn: () => Promise<{ notified?: number } | null>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const res = await fn();
        if (res?.notified) toast.success(`${res.notified} Erinnerung${res.notified === 1 ? "" : "en"} verschickt`);
        onChanged();
      } finally {
        // Small cooldown so a double-tap on N never skips a group.
        window.setTimeout(() => {
          busyRef.current = false;
          setBusy(false);
        }, 800);
      }
    },
    [onChanged],
  );

  const goNext = useCallback(
    () =>
      runStage(async () => {
        try {
          return await liveAdmin<{ notified?: number }>("next", show.id);
        } catch (e) {
          if (e instanceof LiveAdminError && e.code === "END_OF_RUNDOWN") toast.info("Ende des Ablaufs – kein weiterer Programmpunkt.");
          else toast.error(e instanceof Error ? e.message : String(e));
          return null;
        }
      }),
    [runStage, show.id],
  );

  const putOnStage = (itemId: string | null) =>
    runStage(() => liveAdminSafe<{ notified?: number }>("set_on_stage", show.id, { item_id: itemId }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext]);

  // Editing
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Row>(EMPTY_ROW);
  const [newRow, setNewRow] = useState<Row>(EMPTY_ROW);
  const [importOpen, setImportOpen] = useState(false);

  const startEdit = (it: LiveRundownItem) => {
    setEditId(it.id);
    setDraft({
      title: it.title,
      subtitle: it.subtitle ?? "",
      detail: it.detail ?? "",
      time: formatClock(it.planned_at),
    });
  };

  const saveRow = async (row: Row, id?: string, position?: number) => {
    if (!row.title.trim()) {
      toast.error("Titel fehlt");
      return false;
    }
    const item: Record<string, unknown> = {
      title: row.title.trim(),
      subtitle: row.subtitle.trim() || null,
      detail: row.detail.trim() || null,
      planned_at: timeToIso(row.time, show),
    };
    if (id) item.id = id;
    if (position !== undefined) item.position = position;
    const res = await liveAdminSafe("rundown_upsert", show.id, { item }, id ? "Gespeichert" : "Hinzugefügt");
    if (res) onChanged();
    return !!res;
  };

  const remove = async (it: LiveRundownItem) => {
    if (!window.confirm(`„${it.title}“ aus dem Ablauf löschen?`)) return;
    const res = await liveAdminSafe("rundown_delete", show.id, { item_id: it.id }, "Gelöscht");
    if (res) onChanged();
  };

  const doneCount = items.filter((i) => i.status === "done").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-lg">Ablauf</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {doneCount}/{items.length} durch
          </span>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" />
            CSV einfügen
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* On stage / next + big advance button */}
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <div className="rounded-xl border-2 border-red-500/60 bg-red-500/5 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-red-600">
              <span className="h-2 w-2 rounded-full bg-red-600" /> Auf der Fläche
            </div>
            <div className="mt-1 text-xl font-bold text-foreground">{cur?.title ?? "—"}</div>
            {cur?.subtitle && <div className="text-sm text-muted-foreground">{cur.subtitle}</div>}
          </div>
          <div className="rounded-xl border border-border p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Als Nächstes</div>
            <div className="mt-1 text-xl font-bold text-foreground">{next?.title ?? "—"}</div>
            {next?.subtitle && <div className="text-sm text-muted-foreground">{next.subtitle}</div>}
          </div>
          <div className="flex flex-col gap-2">
            <Button
              className="h-full min-h-[72px] px-8 text-lg"
              onClick={goNext}
              disabled={busy || !next}
              title="Tastenkürzel: N"
            >
              Nächste Gruppe <ChevronRight className="ml-1 h-6 w-6" />
              <kbd className="ml-3 rounded border border-white/40 px-1.5 text-xs font-mono">N</kbd>
            </Button>
            <Button variant="outline" size="sm" onClick={() => putOnStage(null)} disabled={busy || !cur}>
              <Square className="mr-1.5 h-3.5 w-3.5" /> Fläche leeren
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">#</th>
                <th className="w-20 px-3 py-2">Uhrzeit</th>
                <th className="px-3 py-2">Titel</th>
                <th className="px-3 py-2">Untertitel</th>
                <th className="px-3 py-2">Details</th>
                <th className="w-28 px-3 py-2">Status</th>
                <th className="w-[230px] px-3 py-2 text-right">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) =>
                editId === it.id ? (
                  <tr key={it.id} className="border-t border-border bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                    <td className="px-2 py-2">
                      <Input value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} placeholder="14:30" />
                    </td>
                    <td className="px-2 py-2">
                      <Input autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                    </td>
                    <td className="px-2 py-2">
                      <Input value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} />
                    </td>
                    <td className="px-2 py-2">
                      <Input value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} />
                    </td>
                    <td />
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (await saveRow(draft, it.id)) setEditId(null);
                          }}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={it.id}
                    className={`border-t border-border ${it.status === "on_stage" || it.id === cur?.id ? "bg-red-500/5" : ""} ${it.status === "done" ? "text-muted-foreground" : ""}`}
                  >
                    <td className="px-3 py-2">{idx + 1}</td>
                    <td className="px-3 py-2 tabular-nums">{formatClock(it.planned_at)}</td>
                    <td className="px-3 py-2 font-semibold">{it.title}</td>
                    <td className="px-3 py-2">{it.subtitle}</td>
                    <td className="max-w-[240px] truncate px-3 py-2" title={it.detail ?? ""}>
                      {it.detail}
                    </td>
                    <td className="px-3 py-2">
                      {it.id === cur?.id || it.status === "on_stage" ? (
                        <Badge variant="destructive">Auf der Fläche</Badge>
                      ) : it.status === "done" ? (
                        <Badge variant="pending">Durch</Badge>
                      ) : (
                        <Badge variant="outline">Geplant</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant={it.id === cur?.id ? "secondary" : "outline"}
                          disabled={busy || it.id === cur?.id}
                          onClick={() => putOnStage(it.id)}
                        >
                          Auf die Fläche
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(it)} aria-label="Bearbeiten">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(it)} aria-label="Löschen">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    Noch kein Ablauf. Zeilen unten hinzufügen oder per CSV einfügen.
                  </td>
                </tr>
              )}
              {/* Add row */}
              <tr className="border-t border-border bg-muted/20">
                <td className="px-3 py-2 text-muted-foreground">
                  <Plus className="h-4 w-4" />
                </td>
                <td className="px-2 py-2">
                  <Input value={newRow.time} onChange={(e) => setNewRow({ ...newRow, time: e.target.value })} placeholder="14:30" />
                </td>
                <td className="px-2 py-2">
                  <Input value={newRow.title} onChange={(e) => setNewRow({ ...newRow, title: e.target.value })} placeholder="Titel" />
                </td>
                <td className="px-2 py-2">
                  <Input value={newRow.subtitle} onChange={(e) => setNewRow({ ...newRow, subtitle: e.target.value })} placeholder="Untertitel" />
                </td>
                <td className="px-2 py-2">
                  <Input value={newRow.detail} onChange={(e) => setNewRow({ ...newRow, detail: e.target.value })} placeholder="Details" />
                </td>
                <td />
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (await saveRow(newRow)) setNewRow(EMPTY_ROW);
                    }}
                  >
                    Hinzufügen
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} show={show} onDone={onChanged} hasItems={items.length > 0} />
    </Card>
  );
}

function CsvImportDialog({
  open,
  onOpenChange,
  show,
  onDone,
  hasItems,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  show: LiveShow;
  onDone: () => void;
  hasItems: boolean;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const rows = useMemo(() => parseRundownCsv(text), [text]);

  const submit = async () => {
    if (rows.length === 0) return;
    if (hasItems && !window.confirm(`Den bestehenden Ablauf durch ${rows.length} Zeilen ersetzen?`)) return;
    setSaving(true);
    const res = await liveAdminSafe(
      "rundown_replace",
      show.id,
      {
        rows: rows.map((r) => ({
          title: r.title,
          subtitle: r.subtitle || null,
          detail: r.detail || null,
          planned_at: timeToIso(r.time, show),
        })),
      },
      `${rows.length} Programmpunkte importiert`,
    );
    setSaving(false);
    if (res) {
      setText("");
      onOpenChange(false);
      onDone();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Ablauf aus CSV einfügen</DialogTitle>
          <DialogDescription>
            Spalten: Titel; Untertitel; Details; Uhrzeit — getrennt mit Semikolon, Komma oder Tab (direkt aus Excel kopieren
            geht). Eine Kopfzeile „Titel…“ wird übersprungen. Ersetzt den kompletten Ablauf.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="font-mono text-xs"
          placeholder={"Titel;Untertitel;Details;Uhrzeit\nTanzgruppe Sonnenschein;Kinder 6–9;TSV Röbel;14:00"}
        />
        {rows.length > 0 && (
          <div className="max-h-64 overflow-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-2 py-1">#</th>
                  <th className="px-2 py-1">Titel</th>
                  <th className="px-2 py-1">Untertitel</th>
                  <th className="px-2 py-1">Details</th>
                  <th className="px-2 py-1">Uhrzeit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1">{i + 1}</td>
                    <td className="px-2 py-1 font-semibold">{r.title}</td>
                    <td className="px-2 py-1">{r.subtitle}</td>
                    <td className="px-2 py-1">{r.detail}</td>
                    <td className="px-2 py-1">
                      {r.time}
                      {r.time && !timeToIso(r.time, show) && <span className="ml-1 text-destructive">(ungültig)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={rows.length === 0 || saving}>
            {rows.length > 0 ? `${rows.length} Zeilen übernehmen` : "Übernehmen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
