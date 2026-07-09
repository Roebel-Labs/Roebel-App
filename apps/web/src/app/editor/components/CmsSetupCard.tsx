"use client";

// "Mini-CMS einrichten" — shown in the chat when the pre-flight check says the
// planned app has maintainable content. The user can rename keys, tweak the
// example structures (JSON), drop keys, then build WITH or WITHOUT the CMS.
// The confirmed plan is appended to the build prompt and seeded after publish.
import { useState } from "react";
import { Database, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CmsKeyPlan, CmsPlan, CmsUserKeyPlan } from "../lib/cms";

function pretty(v: unknown): string {
  try {
    return JSON.stringify(v, null, 1);
  } catch {
    return "null";
  }
}

const KEY_RE = /^[a-z0-9][a-z0-9-_.]{0,63}$/;

export function CmsSetupCard({
  plan,
  resolved,
  onBuild,
}: {
  plan: CmsPlan;
  /** After a decision the card stays in the chat but locks (no buttons). */
  resolved: "cms" | "plain" | null;
  onBuild: (withCms: boolean, keys: CmsKeyPlan[], userKeys: CmsUserKeyPlan[]) => void;
}) {
  const [keys, setKeys] = useState<{ key: string; beschreibung: string; beispiel: string }[]>(
    plan.keys.map((k) => ({ key: k.key, beschreibung: k.beschreibung, beispiel: pretty(k.beispiel) })),
  );
  const [error, setError] = useState<string | null>(null);

  function confirm(withCms: boolean) {
    if (!withCms) {
      onBuild(false, [], []);
      return;
    }
    const parsed: CmsKeyPlan[] = [];
    for (const k of keys) {
      const key = k.key.trim();
      if (!KEY_RE.test(key)) {
        setError(`Schlüssel „${key || "(leer)"}“: nur a-z, 0-9, - _ . (max. 64 Zeichen).`);
        return;
      }
      try {
        parsed.push({ key, beschreibung: k.beschreibung.trim(), beispiel: JSON.parse(k.beispiel) });
      } catch {
        setError(`Beispiel für „${key}“ ist kein gültiges JSON.`);
        return;
      }
    }
    if (parsed.length === 0) {
      onBuild(false, [], []);
      return;
    }
    setError(null);
    onBuild(true, parsed, plan.userKeys);
  }

  const locked = resolved !== null;

  return (
    <div className="rounded-[10px] border border-primary/40 bg-primary/5 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Database className="h-4 w-4 text-primary" />
        Mini-CMS empfohlen
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {plan.reason ??
          "Diese App hat pflegbare Inhalte — mit dem Mini-CMS änderst du sie später im Dashboard, ohne die App neu zu bauen."}
      </p>

      <div className="mt-2 space-y-2">
        {keys.map((k, i) => (
          <div key={i} className="rounded-[8px] border border-border bg-card p-2">
            <div className="flex items-center gap-1.5">
              <input
                value={k.key}
                disabled={locked}
                onChange={(e) =>
                  setKeys((prev) => prev.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
                }
                className="h-7 w-40 rounded-[6px] border border-border bg-background px-1.5 font-mono text-xs outline-none focus:border-primary disabled:opacity-60"
              />
              <input
                value={k.beschreibung}
                disabled={locked}
                onChange={(e) =>
                  setKeys((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, beschreibung: e.target.value } : x)),
                  )
                }
                className="h-7 min-w-0 flex-1 rounded-[6px] border border-border bg-background px-1.5 text-xs outline-none focus:border-primary disabled:opacity-60"
              />
              {!locked ? (
                <button
                  type="button"
                  onClick={() => setKeys((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`${k.key} entfernen`}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <textarea
              value={k.beispiel}
              disabled={locked}
              onChange={(e) =>
                setKeys((prev) => prev.map((x, j) => (j === i ? { ...x, beispiel: e.target.value } : x)))
              }
              rows={Math.min(6, Math.max(2, k.beispiel.split("\n").length))}
              spellCheck={false}
              className="mt-1.5 w-full resize-y rounded-[6px] border border-border bg-background p-1.5 font-mono text-[11px] outline-none focus:border-primary disabled:opacity-60"
            />
          </div>
        ))}
        {!locked ? (
          <button
            type="button"
            onClick={() =>
              setKeys((prev) => [...prev, { key: "", beschreibung: "", beispiel: "[]" }])
            }
            className="inline-flex items-center gap-1 rounded-[8px] border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> Schlüssel
          </button>
        ) : null}
      </div>

      {plan.userKeys.length > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Pro Nutzer:in gespeichert:{" "}
          {plan.userKeys.map((u) => (
            <span key={u.key} className="font-mono">
              {u.key}{" "}
            </span>
          ))}
          ({plan.userKeys.map((u) => u.beschreibung).join("; ")})
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

      {locked ? (
        <p className="mt-2 text-[11px] font-medium text-muted-foreground">
          {resolved === "cms" ? "✓ Mit Mini-CMS gebaut" : "Ohne CMS gebaut"}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => confirm(true)}>
            Mit CMS bauen
          </Button>
          <Button size="sm" variant="outline" onClick={() => confirm(false)}>
            Ohne CMS bauen
          </Button>
        </div>
      )}
    </div>
  );
}
