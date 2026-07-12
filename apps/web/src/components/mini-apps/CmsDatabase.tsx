"use client";

// The Mini-CMS as a structured database (Supabase/Airtable idiom):
// every content key is a "table" (tab strip with row counts), array values
// render as a data grid with typed columns (Aa / # / ✓ / Bild / {}),
// spreadsheet-style inline cell editing, an expandable row editor (Airtable
// record panel) with image upload, add-row/add-field, and a sticky save bar.
// Objects render as a property grid, primitives as a single value row.
// Shared by the editor "Inhalte" tab and the dashboard/admin ContentSection.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Braces,
  CaseSensitive,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Hash,
  ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  ToggleLeft,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  deleteCmsKey,
  isImageField,
  loadCmsItems,
  saveCmsValue,
  uploadContentImage,
  type CmsItem,
} from "@/app/editor/lib/cmsData";

type ColType = "text" | "number" | "bool" | "image" | "json";

const KEY_RE = /^[a-z0-9][a-z0-9-_.]{0,63}$/;

function pretty(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null)) as T;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Union of field names across all rows, ordered by first appearance. */
function columnsOf(rows: unknown[]): string[] {
  const cols: string[] = [];
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    for (const k of Object.keys(row)) if (!cols.includes(k)) cols.push(k);
  }
  return cols;
}

function columnType(name: string, rows: unknown[]): ColType {
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const v = row[name];
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "boolean") return "bool";
    if (typeof v === "number") return "number";
    if (typeof v === "string") return isImageField(name, v) ? "image" : "text";
    return "json";
  }
  return isImageField(name, "https://x.png") ? "image" : "text";
}

function TypeIcon({ type }: { type: ColType }) {
  const cls = "h-3 w-3 shrink-0 text-muted-foreground/80";
  if (type === "number") return <Hash className={cls} />;
  if (type === "bool") return <ToggleLeft className={cls} />;
  if (type === "image") return <ImageIcon className={cls} />;
  if (type === "json") return <Braces className={cls} />;
  return <CaseSensitive className={cls} />;
}

function blankFor(type: ColType): unknown {
  if (type === "number") return 0;
  if (type === "bool") return false;
  if (type === "json") return {};
  return "";
}

/** Empty row shaped like the sample (strings blank, numbers 0, bools false). */
function blankRowLike(sample: unknown): Record<string, unknown> {
  if (!isPlainObject(sample)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sample)) {
    out[k] =
      typeof v === "number" ? 0 : typeof v === "boolean" ? false : typeof v === "string" ? "" : clone(v);
  }
  return out;
}

// ── inline cell editors (spreadsheet feel) ───────────────────────────────────

function CellEditor({
  type,
  value,
  onChange,
  onExpand,
}: {
  type: ColType;
  value: unknown;
  onChange: (v: unknown) => void;
  onExpand: () => void;
}) {
  if (type === "bool") {
    return (
      <div className="flex h-full items-center justify-center">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-3.5 w-3.5"
        />
      </div>
    );
  }
  if (type === "number") {
    return (
      <input
        type="number"
        value={typeof value === "number" && Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className="h-full w-full bg-transparent px-2 font-mono text-xs tabular-nums outline-none focus:bg-primary/5"
      />
    );
  }
  if (type === "image") {
    const url = typeof value === "string" ? value : "";
    return (
      <button
        type="button"
        onClick={onExpand}
        title="Zeile öffnen, um das Bild zu ändern"
        className="flex h-full w-full items-center gap-1.5 px-2 text-left hover:bg-primary/5"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-6 w-6 shrink-0 rounded border border-border object-cover" />
        ) : (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-dashed border-border">
            <ImageIcon className="h-3 w-3 text-muted-foreground" />
          </span>
        )}
        <span className="truncate text-[11px] text-muted-foreground">
          {url ? url.split("/").pop() : "— kein Bild —"}
        </span>
      </button>
    );
  }
  if (type === "json") {
    return (
      <button
        type="button"
        onClick={onExpand}
        title="Zeile öffnen, um die Struktur zu bearbeiten"
        className="flex h-full w-full items-center px-2 text-left font-mono text-[11px] text-muted-foreground hover:bg-primary/5"
      >
        <span className="truncate">{pretty(value).replace(/\s+/g, " ").slice(0, 60)}</span>
      </button>
    );
  }
  return (
    <input
      value={typeof value === "string" ? value : value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
      className="h-full w-full bg-transparent px-2 text-xs outline-none focus:bg-primary/5"
    />
  );
}

// ── expanded row editor (Airtable record panel) ──────────────────────────────

function FieldEditor({
  name,
  value,
  onChange,
  onUpload,
}: {
  name: string;
  value: unknown;
  onChange: (v: unknown) => void;
  onUpload: (file: File, done: (url: string) => void) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (typeof value === "boolean") {
    return (
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
    );
  }
  if (typeof value === "number") {
    return (
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 font-mono text-xs"
      />
    );
  }
  if (typeof value === "string" && isImageField(name, value)) {
    return (
      <div className="flex items-center gap-2">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-12 w-12 shrink-0 rounded-md border border-border object-cover" />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-border">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </span>
        )}
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… (Bild-URL)"
          className="h-8 flex-1 text-xs"
        />
        <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-accent">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Hochladen"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              try {
                await onUpload(file, (url) => onChange(url));
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
    );
  }
  if (value !== null && typeof value === "object") {
    return (
      <Textarea
        value={pretty(value)}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            /* only valid JSON is applied */
          }
        }}
        rows={3}
        className="font-mono text-[11px]"
      />
    );
  }
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  return text.length > 70 ? (
    <Textarea value={text} onChange={(e) => onChange(e.target.value)} rows={3} className="text-xs" />
  ) : (
    <Input value={text} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs" />
  );
}

// ── the database view ────────────────────────────────────────────────────────

export function CmsDatabase({
  app,
  wallet,
  className,
}: {
  /** mini app id or slug (the data API resolves both) */
  app: string;
  wallet: string | null;
  className?: string;
}) {
  const [items, setItems] = useState<CmsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, unknown>>({});
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newFieldFor, setNewFieldFor] = useState<string | null>(null);
  const [newField, setNewField] = useState("");

  const walletHeader = wallet ?? "";

  const load = useCallback(async () => {
    setError(null);
    const loaded = await loadCmsItems(app);
    if (loaded === null) {
      setError("Inhalte konnten nicht geladen werden.");
      setItems([]);
      return;
    }
    setItems(loaded);
    setSelected((cur) => cur && loaded.some((i) => i.key === cur) ? cur : loaded[0]?.key ?? null);
  }, [app]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = items?.find((i) => i.key === selected) ?? null;
  const draft = selected && selected in drafts ? drafts[selected] : clone(current?.value ?? null);
  const dirty = current !== null && selected !== null && selected in drafts &&
    pretty(drafts[selected]) !== pretty(current.value);

  const rows = Array.isArray(draft) ? (draft as unknown[]) : null;
  const cols = useMemo(() => (rows ? columnsOf(rows) : []), [rows]);
  const colTypes = useMemo(() => {
    const map: Record<string, ColType> = {};
    if (rows) for (const c of cols) map[c] = columnType(c, rows);
    return map;
  }, [rows, cols]);

  const setDraft = (next: unknown) => {
    if (!selected) return;
    setDrafts((d) => ({ ...d, [selected]: next }));
  };

  const upload = useCallback(
    async (file: File, done: (url: string) => void) => {
      const url = await uploadContentImage(app, walletHeader, file, file.name);
      if (url) done(url);
      else toast.error("Bild-Upload fehlgeschlagen.");
    },
    [app, walletHeader],
  );

  const save = async () => {
    if (!selected) return;
    let value = draft;
    if (jsonMode) {
      try {
        value = JSON.parse(jsonText);
      } catch {
        toast.error("Ungültiges JSON.");
        return;
      }
    }
    setBusy(true);
    const res = await saveCmsValue(app, walletHeader, selected, value);
    setBusy(false);
    if (res.ok) {
      toast.success(`„${selected}" gespeichert — die App zeigt die Inhalte beim nächsten Öffnen.`);
      setItems((prev) =>
        (prev ?? []).map((i) =>
          i.key === selected ? { ...i, value: clone(value), updated_at: new Date().toISOString() } : i,
        ),
      );
      setDrafts((d) => {
        const next = { ...d };
        delete next[selected];
        return next;
      });
      if (jsonMode) setJsonMode(false);
    } else {
      toast.error(res.error ?? "Speichern fehlgeschlagen.");
    }
  };

  const discard = () => {
    if (!selected) return;
    setDrafts((d) => {
      const next = { ...d };
      delete next[selected];
      return next;
    });
    setExpandedRow(null);
  };

  const removeTable = async () => {
    if (!selected) return;
    if (!window.confirm(`Tabelle „${selected}" mit allen Einträgen löschen?`)) return;
    setBusy(true);
    const ok = await deleteCmsKey(app, walletHeader, selected);
    setBusy(false);
    if (ok) {
      toast.success(`„${selected}" gelöscht.`);
      setItems((prev) => (prev ?? []).filter((i) => i.key !== selected));
      setSelected(null);
      setExpandedRow(null);
    } else toast.error("Löschen fehlgeschlagen.");
  };

  const createTable = async (kind: "list" | "object" | "text") => {
    const key = newKey.trim().toLowerCase();
    if (!KEY_RE.test(key) || items?.some((i) => i.key === key)) {
      toast.error("Ungültiger oder vergebener Name (a-z, 0-9, - _ .).");
      return;
    }
    const initial = kind === "list" ? [] : kind === "object" ? {} : "";
    setBusy(true);
    const res = await saveCmsValue(app, walletHeader, key, initial);
    setBusy(false);
    if (res.ok) {
      setItems((prev) => [...(prev ?? []), { key, value: initial, updated_at: new Date().toISOString() }]);
      setSelected(key);
      setCreating(false);
      setNewKey("");
      toast.success(`Tabelle „${key}" angelegt.`);
    } else toast.error(res.error ?? "Anlegen fehlgeschlagen.");
  };

  const addField = () => {
    const name = newField.trim();
    if (!name || !rows) return;
    setDraft(
      rows.map((r) =>
        isPlainObject(r) ? { ...clone(r), [name]: (r as Record<string, unknown>)[name] ?? "" } : r,
      ),
    );
    setNewFieldFor(null);
    setNewField("");
  };

  // ── render ──────────────────────────────────────────────────────────────────

  if (items === null) {
    return (
      <div className={cn("flex items-center gap-2 p-4 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Inhalte werden geladen…
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {/* table tabs */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
        {items.map((item) => {
          const count = Array.isArray(item.value)
            ? item.value.length
            : isPlainObject(item.value)
              ? Object.keys(item.value).length
              : null;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setSelected(item.key);
                setExpandedRow(null);
                setJsonMode(false);
              }}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2 font-mono text-[11px]",
                item.key === selected
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Database className="h-3 w-3" />
              {item.key}
              {count !== null && (
                <span className="rounded-full bg-border/60 px-1.5 text-[10px] tabular-nums text-muted-foreground">
                  {count}
                </span>
              )}
            </button>
          );
        })}
        {creating ? (
          <span className="inline-flex items-center gap-1">
            <Input
              autoFocus
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toLowerCase())}
              placeholder="tabellen-name"
              className="h-7 w-36 font-mono text-[11px]"
              onKeyDown={(e) => {
                if (e.key === "Enter") void createTable("list");
                if (e.key === "Escape") setCreating(false);
              }}
            />
            <button type="button" title="Als Liste anlegen" onClick={() => void createTable("list")} className="rounded p-1 text-muted-foreground hover:bg-accent"><Check className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => setCreating(false)} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-3.5 w-3.5" /></button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> Tabelle
          </button>
        )}
        <span className="ml-auto flex items-center gap-0.5">
          <button type="button" title="Neu laden" onClick={() => void load()} className="rounded p-1.5 text-muted-foreground hover:bg-accent">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      {error && (
        <div className="m-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {!current ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <Database className="h-6 w-6 text-muted-foreground" />
          <p className="max-w-xs text-xs text-muted-foreground">
            Noch keine Inhalte. Lege eine Tabelle an oder bitte die KI im Chat, ein CMS einzurichten
            (z. B. „Hol die Bilder von …&quot;).
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* table toolbar */}
          <div className="flex shrink-0 items-center gap-2 px-3 py-2">
            <span className="font-mono text-xs font-semibold">{current.key}</span>
            <span className="text-[11px] text-muted-foreground">
              {rows
                ? `${rows.length} ${rows.length === 1 ? "Zeile" : "Zeilen"} · ${cols.length} Felder`
                : isPlainObject(draft)
                  ? `Objekt · ${Object.keys(draft as object).length} Felder`
                  : "Einzelwert"}
              {" · "}
              {new Date(current.updated_at).toLocaleString("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="ml-auto flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => {
                  if (!jsonMode) setJsonText(pretty(draft));
                  setJsonMode((m) => !m);
                }}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px]",
                  jsonMode ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent",
                )}
              >
                <Braces className="h-3 w-3" /> JSON
              </button>
              <button
                type="button"
                title="Tabelle löschen"
                onClick={() => void removeTable()}
                className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>

          {/* content */}
          <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
            {jsonMode ? (
              <Textarea
                value={jsonText}
                onChange={(e) => {
                  setJsonText(e.target.value);
                  try {
                    setDraft(JSON.parse(e.target.value));
                  } catch {
                    /* applied on save with validation */
                  }
                }}
                rows={Math.min(18, Math.max(6, jsonText.split("\n").length))}
                spellCheck={false}
                className="font-mono text-[11px]"
              />
            ) : rows ? (
              <div className="overflow-x-auto rounded-[10px] border border-border">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-card">
                      <th className="w-9 border-r border-border px-2 py-1.5 text-center font-mono text-[10px] font-normal text-muted-foreground">#</th>
                      {cols.map((c) => (
                        <th key={c} className="min-w-[120px] border-r border-border px-2 py-1.5 text-left">
                          <span className="flex items-center gap-1.5">
                            <TypeIcon type={colTypes[c]} />
                            <span className="truncate font-mono text-[11px] font-medium">{c}</span>
                          </span>
                        </th>
                      ))}
                      <th className="w-16 px-1 py-1.5">
                        {newFieldFor === current.key ? (
                          <span className="flex items-center gap-0.5">
                            <input
                              autoFocus
                              value={newField}
                              onChange={(e) => setNewField(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") addField();
                                if (e.key === "Escape") setNewFieldFor(null);
                              }}
                              placeholder="feld"
                              className="h-6 w-16 rounded border border-border bg-background px-1 font-mono text-[10px] outline-none"
                            />
                            <button type="button" onClick={addField} className="rounded p-0.5 hover:bg-accent"><Check className="h-3 w-3" /></button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            title="Feld hinzufügen"
                            onClick={() => setNewFieldFor(current.key)}
                            className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
                          >
                            <Plus className="h-3 w-3" /> Feld
                          </button>
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, ri) => (
                      <RowView
                        key={ri}
                        row={row}
                        index={ri}
                        cols={cols}
                        colTypes={colTypes}
                        expanded={expandedRow === ri}
                        onToggle={() => setExpandedRow((cur) => (cur === ri ? null : ri))}
                        onChange={(next) => {
                          const arr = [...rows];
                          arr[ri] = next;
                          setDraft(arr);
                        }}
                        onMove={(dir) => {
                          const j = ri + dir;
                          if (j < 0 || j >= rows.length) return;
                          const arr = [...rows];
                          [arr[ri], arr[j]] = [arr[j], arr[ri]];
                          setDraft(arr);
                          setExpandedRow(null);
                        }}
                        onDelete={() => {
                          setDraft(rows.filter((_, j) => j !== ri));
                          setExpandedRow(null);
                        }}
                        onUpload={upload}
                      />
                    ))}
                    <tr>
                      <td colSpan={cols.length + 2}>
                        <button
                          type="button"
                          onClick={() => {
                            const sample = rows[rows.length - 1];
                            setDraft([
                              ...rows,
                              rows.length && isPlainObject(sample)
                                ? blankRowLike(sample)
                                : cols.length
                                  ? Object.fromEntries(cols.map((c) => [c, blankFor(colTypes[c])]))
                                  : "",
                            ]);
                            setExpandedRow(rows.length);
                          }}
                          className="flex w-full items-center gap-1.5 px-2 py-2 text-left text-[11px] text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                        >
                          <Plus className="h-3 w-3" /> Neue Zeile
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : isPlainObject(draft) ? (
              <div className="overflow-hidden rounded-[10px] border border-border">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-card">
                      <th className="w-1/3 border-r border-border px-2 py-1.5 text-left font-mono text-[11px] font-medium">Feld</th>
                      <th className="px-2 py-1.5 text-left font-mono text-[11px] font-medium">Wert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(draft as Record<string, unknown>).map(([field, val]) => (
                      <tr key={field} className="border-b border-border/60 last:border-b-0">
                        <td className="border-r border-border px-2 py-1.5 align-top">
                          <span className="flex items-center gap-1.5">
                            <TypeIcon type={typeof val === "boolean" ? "bool" : typeof val === "number" ? "number" : typeof val === "string" && isImageField(field, val) ? "image" : typeof val === "object" && val !== null ? "json" : "text"} />
                            <span className="font-mono text-[11px]">{field}</span>
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          <FieldEditor
                            name={field}
                            value={val}
                            onChange={(v) => setDraft({ ...(draft as Record<string, unknown>), [field]: v })}
                            onUpload={upload}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-[10px] border border-border p-3">
                <FieldEditor name={current.key} value={draft} onChange={setDraft} onUpload={upload} />
              </div>
            )}
          </div>

          {/* save bar */}
          {(dirty || jsonMode) && (
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-card px-3 py-2">
              <span className="text-[11px] text-muted-foreground">
                {dirty ? "Ungespeicherte Änderungen" : "JSON-Modus"}
              </span>
              <span className="flex items-center gap-1.5">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={discard} disabled={busy}>
                  <Undo2 className="mr-1 h-3 w-3" /> Verwerfen
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={() => void save()} disabled={busy}>
                  {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                  Speichern
                </Button>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── one grid row + its expanded record panel ─────────────────────────────────

function RowView({
  row,
  index,
  cols,
  colTypes,
  expanded,
  onToggle,
  onChange,
  onMove,
  onDelete,
  onUpload,
}: {
  row: unknown;
  index: number;
  cols: string[];
  colTypes: Record<string, ColType>;
  expanded: boolean;
  onToggle: () => void;
  onChange: (next: unknown) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onUpload: (file: File, done: (url: string) => void) => Promise<void>;
}) {
  const obj = isPlainObject(row) ? row : null;
  return (
    <>
      <tr className={cn("group border-b border-border/60", expanded && "bg-primary/5")}>
        <td className="border-r border-border p-0 text-center">
          <button
            type="button"
            onClick={onToggle}
            title={expanded ? "Zeile schließen" : "Zeile öffnen (alle Felder + Bilder)"}
            className="flex h-8 w-full items-center justify-center gap-0.5 font-mono text-[10px] text-muted-foreground hover:bg-primary/5 hover:text-foreground"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {index + 1}
          </button>
        </td>
        {obj ? (
          cols.map((c) => (
            <td key={c} className="h-8 border-r border-border/60 p-0">
              <CellEditor
                type={colTypes[c]}
                value={obj[c]}
                onChange={(v) => onChange({ ...obj, [c]: v })}
                onExpand={onToggle}
              />
            </td>
          ))
        ) : (
          <td colSpan={cols.length} className="h-8 border-r border-border/60 p-0">
            <CellEditor
              type={typeof row === "number" ? "number" : typeof row === "boolean" ? "bool" : "text"}
              value={row}
              onChange={onChange}
              onExpand={onToggle}
            />
          </td>
        )}
        <td className="p-0">
          <span className="flex items-center justify-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button type="button" onClick={() => onMove(-1)} className="rounded p-0.5 text-muted-foreground hover:bg-accent"><ArrowUp className="h-3 w-3" /></button>
            <button type="button" onClick={() => onMove(1)} className="rounded p-0.5 text-muted-foreground hover:bg-accent"><ArrowDown className="h-3 w-3" /></button>
            <button type="button" onClick={onDelete} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
          </span>
        </td>
      </tr>
      {expanded && obj && (
        <tr className="border-b border-border/60 bg-primary/5">
          <td colSpan={cols.length + 2} className="p-3">
            <div className="space-y-2">
              {Object.entries(obj).map(([field, val]) => (
                <div key={field} className="grid grid-cols-[120px_1fr] items-center gap-2">
                  <span className="flex items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground" title={field}>
                    <TypeIcon type={typeof val === "boolean" ? "bool" : typeof val === "number" ? "number" : typeof val === "string" && isImageField(field, val) ? "image" : typeof val === "object" && val !== null ? "json" : "text"} />
                    {field}
                  </span>
                  <FieldEditor
                    name={field}
                    value={val}
                    onChange={(v) => onChange({ ...obj, [field]: v })}
                    onUpload={onUpload}
                  />
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
