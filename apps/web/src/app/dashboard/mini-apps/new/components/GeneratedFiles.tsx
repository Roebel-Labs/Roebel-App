"use client";

import { useEffect, useState } from "react";
import { FileCode2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PartialFile } from "../lib/streamParse";

/**
 * Streaming file explorer: a list of generated files + a read-only viewer for
 * the selected one. Updates live as the model emits.
 */
export function GeneratedFiles({
  files,
  streaming,
}: {
  files: PartialFile[];
  streaming: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  // Auto-select the entry screen (or first file) once we have files.
  useEffect(() => {
    if (files.length === 0) {
      setSelected(null);
      return;
    }
    const stillThere = selected && files.some((f) => f.path === selected);
    if (!stillThere) {
      const page = files.find((f) => f.path === "app/page.tsx");
      setSelected(page?.path ?? files[0]?.path ?? null);
    }
  }, [files, selected]);

  const active = files.find((f) => f.path === selected) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-heading text-sm font-semibold text-foreground">Dateien</span>
        <span className="text-xs text-muted-foreground tabular-nums">{files.length}</span>
      </div>
      <div className="flex min-h-0 flex-1">
        {/* file list */}
        <ul className="w-40 shrink-0 overflow-y-auto border-r border-border py-1">
          {files.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              {streaming ? "Generiere…" : "Noch keine Dateien"}
            </li>
          ) : (
            files.map((f) => (
              <li key={f.path}>
                <button
                  type="button"
                  onClick={() => setSelected(f.path ?? null)}
                  className={cn(
                    "flex w-full items-center gap-1.5 truncate px-3 py-1.5 text-left text-xs",
                    f.path === selected
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                  title={f.path}
                >
                  <FileCode2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{f.path}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        {/* viewer */}
        <div className="min-w-0 flex-1 overflow-auto bg-background">
          {active ? (
            <pre className="min-h-full whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-foreground">
              {active.content ?? ""}
              {streaming && active.path === files[files.length - 1]?.path ? (
                <Loader2 className="ml-1 inline h-3 w-3 animate-spin text-muted-foreground" />
              ) : null}
            </pre>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
              Wähle eine Datei, um den Code zu sehen.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
