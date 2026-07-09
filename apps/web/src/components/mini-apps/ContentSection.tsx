"use client";

// "Inhalte" — the mini-CMS for an app's shared content (mini_app_data, scope
// 'app'). The app reads these keys at runtime via sdk.data.get/list; editing
// here changes the live app WITHOUT re-publishing code. Values are JSON.
import { useCallback, useEffect, useState } from "react";
import { Database, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DetailCard } from "@/components/mini-apps/ui";
import type { MiniAppRow } from "@/lib/miniapp/types";

interface Item {
  key: string;
  value: unknown;
  updated_at: string;
}

function pretty(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function ContentSection({ app, wallet }: { app: MiniAppRow; wallet?: string | null }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");

  const headers = useCallback(
    (): Record<string, string> => ({
      "content-type": "application/json",
      ...(wallet ? { "x-wallet-address": wallet } : {}),
    }),
    [wallet],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/mini-apps/data?app=${encodeURIComponent(app.id)}&scope=app`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setItems(json.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    }
  }, [app.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(key: string, raw: string) {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      setError(`„${key}“: Kein gültiges JSON. Texte in Anführungszeichen setzen, z. B. "Hallo".`);
      return;
    }
    setBusyKey(key);
    setError(null);
    try {
      const res = await fetch("/api/mini-apps/data", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ app: app.id, scope: "app", key, value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  }

  async function remove(key: string) {
    if (!window.confirm(`Inhalt „${key}“ wirklich löschen?`)) return;
    setBusyKey(key);
    setError(null);
    try {
      const res = await fetch("/api/mini-apps/data", {
        method: "DELETE",
        headers: headers(),
        body: JSON.stringify({ app: app.id, scope: "app", key }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  }

  function addKey() {
    const key = newKey
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_.]/g, "-");
    if (key.length < 1 || items?.some((i) => i.key === key)) return;
    setItems((prev) => [...(prev ?? []), { key, value: null, updated_at: "" }]);
    setDrafts((d) => ({ ...d, [key]: "" }));
    setNewKey("");
  }

  return (
    <DetailCard title="Inhalte (Mini-CMS)">
      <p className="mb-3 text-xs text-muted-foreground">
        Inhalte, die deine App zur Laufzeit über{" "}
        <span className="font-mono">sdk.data.get(&quot;schlüssel&quot;)</span> lädt — hier ändern,
        ohne die App neu zu veröffentlichen. Werte sind JSON (Text: {"„"}
        <span className="font-mono">&quot;Hallo&quot;</span>
        {"“"}, Listen/Objekte beliebig).
      </p>
      {error ? <p className="mb-2 text-sm text-destructive">{error}</p> : null}
      {items === null ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Lädt…
        </p>
      ) : (
        <div className="space-y-3">
          {items.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Database className="h-3.5 w-3.5" /> Noch keine Inhalte gespeichert.
            </p>
          ) : (
            items.map((item) => {
              const draft = drafts[item.key] ?? pretty(item.value);
              const dirty = drafts[item.key] !== undefined;
              return (
                <div key={item.key} className="rounded-[10px] border border-border p-2.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{item.key}</span>
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => save(item.key, draft)}
                        disabled={busyKey === item.key || !dirty}
                        title="Speichern"
                        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                      >
                        {busyKey === item.key ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="h-3 w-3" />
                        )}
                        Speichern
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(item.key)}
                        disabled={busyKey === item.key}
                        title="Löschen"
                        className="inline-flex h-7 items-center rounded-md px-2 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [item.key]: e.target.value }))}
                    rows={Math.min(10, Math.max(2, draft.split("\n").length))}
                    spellCheck={false}
                    className="w-full resize-y rounded-[8px] border border-border bg-background p-2 font-mono text-xs outline-none focus:border-primary"
                  />
                </div>
              );
            })
          )}
          <div className="flex gap-2">
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKey();
                }
              }}
              placeholder="neuer-schluessel (z. B. lektionen)"
              className="max-w-xs font-mono text-xs"
            />
            <Button size="sm" variant="outline" onClick={addKey} disabled={!newKey.trim()}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Schlüssel
            </Button>
          </div>
        </div>
      )}
    </DetailCard>
  );
}
