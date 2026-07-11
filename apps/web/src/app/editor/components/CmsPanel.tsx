"use client";

// "Inhalte" stage tab — the visual Mini-CMS editor inside /editor.
// Renders each mini_app_data app-scope key as structured form fields
// (list items as cards, per-field inputs, image fields with thumbnail +
// upload) instead of raw JSON; a per-key JSON toggle stays available for
// exotic structures. Saving updates the LIVE app without re-publishing.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Braces,
  Database,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CmsKeyPlan } from "../lib/cms";
import {
  deleteCmsKey,
  isImageField,
  loadCmsItems,
  saveCmsValue,
  uploadContentImage,
  type CmsItem,
} from "../lib/cmsData";

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

/** Empty-ish copy of an item, keeping the field structure. */
function blankLike(sample: unknown): unknown {
  if (Array.isArray(sample)) return [];
  if (sample && typeof sample === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(sample as Record<string, unknown>)) {
      out[k] = typeof v === "number" ? 0 : typeof v === "boolean" ? false : typeof v === "string" ? "" : clone(v);
    }
    return out;
  }
  return typeof sample === "number" ? 0 : typeof sample === "boolean" ? false : "";
}

// ── field-level editors ──────────────────────────────────────────────────────

function ImageField({
  value,
  onChange,
  onUpload,
}: {
  value: string;
  onChange: (v: string) => void;
  onUpload: (file: File) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {value ? (
        <img
          src={value}
          alt=""
          className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
          <ImagePlus className="h-4 w-4" />
        </div>
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
              await onUpload(file);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
    </div>
  );
}

function PrimitiveField({
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
  if (typeof value === "boolean") {
    return (
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
    );
  }
  if (typeof value === "number") {
    return (
      <Input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 text-xs"
      />
    );
  }
  const text = typeof value === "string" ? value : pretty(value);
  if (isImageField(name, value)) {
    return (
      <ImageField
        value={text}
        onChange={onChange}
        onUpload={(file) => onUpload(file, (url) => onChange(url))}
      />
    );
  }
  if (text.length > 80) {
    return (
      <Textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="text-xs"
      />
    );
  }
  return (
    <Input value={text} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs" />
  );
}

function ObjectFields({
  obj,
  onChange,
  onUpload,
}: {
  obj: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  onUpload: (file: File, done: (url: string) => void) => Promise<void>;
}) {
  return (
    <div className="space-y-2">
      {Object.entries(obj).map(([field, val]) => (
        <div key={field} className="grid grid-cols-[110px_1fr] items-center gap-2">
          <span className="truncate text-xs font-medium text-muted-foreground" title={field}>
            {field}
          </span>
          {val !== null && typeof val === "object" ? (
            <Textarea
              value={pretty(val)}
              onChange={(e) => {
                try {
                  onChange({ ...obj, [field]: JSON.parse(e.target.value) });
                } catch {
                  /* keep typing — only valid JSON is applied */
                }
              }}
              rows={2}
              className="font-mono text-[11px]"
            />
          ) : (
            <PrimitiveField
              name={field}
              value={val}
              onChange={(v) => onChange({ ...obj, [field]: v })}
              onUpload={onUpload}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── per-key editor card ──────────────────────────────────────────────────────

function KeyCard({
  item,
  appSlug,
  wallet,
  onSaved,
  onDeleted,
}: {
  item: CmsItem;
  appSlug: string;
  wallet: string;
  onSaved: (key: string, value: unknown) => void;
  onDeleted: (key: string) => void;
}) {
  const [draft, setDraft] = useState<unknown>(() => clone(item.value));
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState(() => pretty(item.value));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useMemo(() => pretty(draft) !== pretty(item.value), [draft, item.value]);

  const upload = useCallback(
    async (file: File, done: (url: string) => void) => {
      const url = await uploadContentImage(appSlug, wallet, file, file.name);
      if (url) {
        done(url);
        toast.success("Bild hochgeladen.");
      } else {
        toast.error("Bild-Upload fehlgeschlagen.");
      }
    },
    [appSlug, wallet],
  );

  const save = async () => {
    let value = draft;
    if (jsonMode) {
      try {
        value = JSON.parse(jsonText);
      } catch {
        setJsonError("Ungültiges JSON.");
        return;
      }
    }
    setBusy(true);
    const res = await saveCmsValue(appSlug, wallet, item.key, value);
    setBusy(false);
    if (res.ok) {
      toast.success(`„${item.key}" gespeichert — die App zeigt den Inhalt beim nächsten Öffnen.`);
      onSaved(item.key, value);
      setDraft(clone(value));
      setJsonText(pretty(value));
      setJsonError(null);
    } else {
      toast.error(res.error ?? "Speichern fehlgeschlagen.");
    }
  };

  const isArray = Array.isArray(draft);
  const isObject = !isArray && draft !== null && typeof draft === "object";

  return (
    <div className="rounded-[10px] border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-xs font-semibold">{item.key}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              if (!jsonMode) setJsonText(pretty(draft));
              else {
                try {
                  setDraft(JSON.parse(jsonText));
                  setJsonError(null);
                } catch {
                  setJsonError("Ungültiges JSON.");
                  return;
                }
              }
              setJsonMode((m) => !m);
            }}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px]",
              jsonMode ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent",
            )}
            title="Zwischen Formular und JSON wechseln"
          >
            <Braces className="h-3 w-3" /> JSON
          </button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-muted-foreground hover:text-red-600"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(`Schlüssel „${item.key}" wirklich löschen?`)) return;
              setBusy(true);
              const ok = await deleteCmsKey(appSlug, wallet, item.key);
              setBusy(false);
              if (ok) {
                toast.success(`„${item.key}" gelöscht.`);
                onDeleted(item.key);
              } else toast.error("Löschen fehlgeschlagen.");
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {jsonMode ? (
        <>
          <Textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setJsonError(null);
            }}
            rows={Math.min(14, Math.max(4, jsonText.split("\n").length))}
            className="font-mono text-[11px]"
          />
          {jsonError && <p className="mt-1 text-xs text-red-600">{jsonError}</p>}
        </>
      ) : isArray ? (
        <div className="space-y-2">
          {(draft as unknown[]).map((entry, i) => (
            <div key={i} className="rounded-md border border-border/70 bg-background p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Eintrag {i + 1}
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                    disabled={i === 0}
                    onClick={() => {
                      const arr = [...(draft as unknown[])];
                      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                      setDraft(arr);
                    }}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                    disabled={i === (draft as unknown[]).length - 1}
                    onClick={() => {
                      const arr = [...(draft as unknown[])];
                      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                      setDraft(arr);
                    }}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-red-600"
                    onClick={() => setDraft((draft as unknown[]).filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              {entry !== null && typeof entry === "object" && !Array.isArray(entry) ? (
                <ObjectFields
                  obj={entry as Record<string, unknown>}
                  onChange={(next) => {
                    const arr = [...(draft as unknown[])];
                    arr[i] = next;
                    setDraft(arr);
                  }}
                  onUpload={upload}
                />
              ) : (
                <PrimitiveField
                  name={item.key}
                  value={entry}
                  onChange={(v) => {
                    const arr = [...(draft as unknown[])];
                    arr[i] = v;
                    setDraft(arr);
                  }}
                  onUpload={upload}
                />
              )}
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full text-xs"
            onClick={() => {
              const arr = draft as unknown[];
              setDraft([...arr, blankLike(arr[arr.length - 1] ?? "")]);
            }}
          >
            <Plus className="mr-1 h-3 w-3" /> Eintrag hinzufügen
          </Button>
        </div>
      ) : isObject ? (
        <ObjectFields
          obj={draft as Record<string, unknown>}
          onChange={setDraft}
          onUpload={upload}
        />
      ) : (
        <PrimitiveField name={item.key} value={draft} onChange={setDraft} onUpload={upload} />
      )}

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          Zuletzt geändert: {new Date(item.updated_at).toLocaleString("de-DE")}
        </span>
        <Button size="sm" className="h-7 text-xs" disabled={busy || (!dirty && !jsonMode)} onClick={save}>
          {busy ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Save className="mr-1 h-3 w-3" />
          )}
          Speichern
        </Button>
      </div>
    </div>
  );
}

// ── the panel ────────────────────────────────────────────────────────────────

export function CmsPanel({
  appSlug,
  wallet,
  plannedKeys,
}: {
  appSlug: string | null;
  wallet: string | null;
  plannedKeys?: CmsKeyPlan[] | null;
}) {
  const [items, setItems] = useState<CmsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");

  const load = useCallback(async () => {
    if (!appSlug) return;
    setError(null);
    const loaded = await loadCmsItems(appSlug);
    if (loaded === null) setError("Inhalte konnten nicht geladen werden.");
    setItems(loaded ?? []);
  }, [appSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!appSlug) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Database className="h-6 w-6 text-muted-foreground" />
        <p className="max-w-sm text-sm text-muted-foreground">
          Das Mini-CMS wird mit der App angelegt — veröffentliche sie zuerst, dann kannst du die
          Inhalte hier bearbeiten (ohne neue Version).
        </p>
        {plannedKeys && plannedKeys.length > 0 && (
          <div className="w-full max-w-sm rounded-[10px] border border-border bg-card p-3 text-left">
            <p className="mb-2 text-xs font-semibold">Geplante Inhalte:</p>
            <ul className="space-y-1">
              {plannedKeys.map((k) => (
                <li key={k.key} className="text-xs text-muted-foreground">
                  <span className="font-mono text-foreground">{k.key}</span>
                  {k.beschreibung ? ` — ${k.beschreibung}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Verbinde dich, um Inhalte zu bearbeiten.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Änderungen wirken sofort in der veröffentlichten App — ganz ohne neue Version.
        </p>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {items === null ? (
        <div className="h-24 animate-pulse rounded-[10px] border border-border bg-muted/40" />
      ) : items.length === 0 && !error ? (
        <p className="rounded-[10px] border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Noch keine Inhalte. Lege unten einen Schlüssel an oder bitte die KI im Chat, ein CMS
          einzurichten.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <KeyCard
              key={item.key}
              item={item}
              appSlug={appSlug}
              wallet={wallet}
              onSaved={(key, value) =>
                setItems((prev) =>
                  (prev ?? []).map((it) =>
                    it.key === key
                      ? { ...it, value, updated_at: new Date().toISOString() }
                      : it,
                  ),
                )
              }
              onDeleted={(key) => setItems((prev) => (prev ?? []).filter((it) => it.key !== key))}
            />
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value.toLowerCase())}
          placeholder="neuer-schluessel"
          className="h-8 flex-1 font-mono text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={!/^[a-z0-9][a-z0-9-_.]{0,63}$/.test(newKey) || items?.some((i) => i.key === newKey)}
          onClick={async () => {
            const res = await saveCmsValue(appSlug, wallet, newKey, "");
            if (res.ok) {
              setItems((prev) => [
                ...(prev ?? []),
                { key: newKey, value: "", updated_at: new Date().toISOString() },
              ]);
              setNewKey("");
              toast.success(`„${newKey}" angelegt.`);
            } else toast.error(res.error ?? "Anlegen fehlgeschlagen.");
          }}
        >
          <Plus className="mr-1 h-3 w-3" /> Anlegen
        </Button>
      </div>
    </div>
  );
}
