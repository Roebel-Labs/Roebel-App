"use client";

// "Inhalte" stage tab — the Mini-CMS as a structured database (CmsDatabase:
// tables → data grid → row editor). Live content editing without republish;
// before the first publish it previews the planned keys.
import { Database } from "lucide-react";
import { CmsDatabase } from "@/components/mini-apps/CmsDatabase";
import type { CmsKeyPlan } from "../lib/cms";

export function CmsPanel({
  appSlug,
  wallet,
  plannedKeys,
}: {
  appSlug: string | null;
  wallet: string | null;
  plannedKeys?: CmsKeyPlan[] | null;
}) {
  if (!appSlug) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Database className="h-6 w-6 text-muted-foreground" />
        <p className="max-w-sm text-sm text-muted-foreground">
          Das Mini-CMS wird mit der App angelegt — veröffentliche sie zuerst, dann bearbeitest du
          die Inhalte hier wie in einer Datenbank (ohne neue Version).
        </p>
        {plannedKeys && plannedKeys.length > 0 && (
          <div className="w-full max-w-sm rounded-[10px] border border-border bg-card p-3 text-left">
            <p className="mb-2 text-xs font-semibold">Geplante Tabellen:</p>
            <ul className="space-y-1">
              {plannedKeys.map((k) => (
                <li key={k.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Database className="h-3 w-3 shrink-0" />
                  <span className="font-mono text-foreground">{k.key}</span>
                  {k.beschreibung ? <span className="truncate">— {k.beschreibung}</span> : null}
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

  return <CmsDatabase app={appSlug} wallet={wallet} className="h-full" />;
}
