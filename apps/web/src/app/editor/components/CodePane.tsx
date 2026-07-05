"use client";

// Read-only code view: the generated HTML document, streaming in live.
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download } from "lucide-react";

export function CodePane({ text, streaming }: { text: string; streaming: boolean }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);

  // Follow the stream like a build log.
  useEffect(() => {
    if (streaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text, streaming]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const download = () => {
    const blob = new Blob([text], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mini-app.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  const lines = text ? text.split("\n").length : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-card">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="font-mono text-[11px] text-muted-foreground">
          mini-app.html · {lines.toLocaleString("de-DE")} Zeilen
          {streaming ? " · baut…" : ""}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={copy}
            disabled={!text}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
            {copied ? "Kopiert" : "Kopieren"}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!text}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <Download className="h-3 w-3" />
            Herunterladen
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        {text ? (
          <pre className="p-4 font-mono text-[11px] leading-relaxed text-foreground">
            {text}
            {streaming ? <span className="animate-pulse text-primary">▌</span> : null}
          </pre>
        ) : (
          <p className="p-4 text-xs text-muted-foreground">
            Noch kein Code. Beschreibe links, was die Mini-App tun soll.
          </p>
        )}
      </div>
    </div>
  );
}
