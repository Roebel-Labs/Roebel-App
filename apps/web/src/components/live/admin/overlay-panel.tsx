"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { liveAdminSafe } from "./api";
import type { LiveOverlay, LiveShow } from "../types";

type FlagKey = "lower_third" | "next_up" | "bug" | "qr" | "poll" | "alerts" | "reactions";

const FLAGS: { key: FlagKey; label: string; hint: string }[] = [
  { key: "lower_third", label: "Bauchbinde", hint: "Gruppe auf der Fläche, unten links" },
  { key: "next_up", label: "Als Nächstes", hint: "Chip über der Bauchbinde" },
  { key: "bug", label: "Logo „Live in der Röbel App“", hint: "oben rechts" },
  { key: "qr", label: "QR-Code", hint: "unter dem Logo, führt zur Live-Seite" },
  // No "alerts" switch: Unterstützen is never on air (only in the app), Max 2026-11-05.
  { key: "poll", label: "Publikumsliebling", hint: "Meinungsbild Top 5, links" },
  { key: "reactions", label: "Reaktionen", hint: "Emojis am rechten Rand" },
];

export function OverlayPanel({ show, onLocalPatch }: { show: LiveShow; onLocalPatch: (patch: Partial<LiveOverlay>) => void }) {
  const overlay = show.overlay;
  const [message, setMessage] = useState(overlay.message ?? "");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => setMessage(show.overlay.message ?? ""), [show.id, show.overlay.message]);

  const overlayUrl = `${origin}/live/${show.slug}/overlay`;

  const patch = async (p: Partial<LiveOverlay>) => {
    const before: Partial<LiveOverlay> = {};
    for (const k of Object.keys(p) as (keyof LiveOverlay)[]) (before as Record<string, unknown>)[k] = overlay[k];
    onLocalPatch(p); // optimistic
    const res = await liveAdminSafe("set_overlay", show.id, { patch: p });
    if (!res) onLocalPatch(before);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Kopiert");
    } catch {
      toast.error("Kopieren nicht möglich");
    }
  };

  const allOn = FLAGS.every((f) => overlay[f.key]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">Einblendungen (OBS)</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => patch(Object.fromEntries(FLAGS.map((f) => [f.key, !allOn])) as Partial<LiveOverlay>)}
        >
          {allOn ? "Alle aus" : "Alle an"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y divide-border rounded-lg border border-border">
          {FLAGS.map((f) => (
            <label key={f.key} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
              <div>
                <div className="font-semibold text-foreground">{f.label}</div>
                <div className="text-xs text-muted-foreground">{f.hint}</div>
              </div>
              <Switch checked={overlay[f.key]} onCheckedChange={(v) => patch({ [f.key]: v } as Partial<LiveOverlay>)} />
            </label>
          ))}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold text-foreground">Laufband / Hinweis</div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              patch({ message: message.trim() || null });
            }}
          >
            <Input
              value={message}
              maxLength={200}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="z. B. Gleich geht's weiter mit der Siegerehrung"
            />
            <Button type="submit" disabled={!message.trim()}>
              Einblenden
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!overlay.message}
              onClick={() => {
                setMessage("");
                patch({ message: null });
              }}
            >
              Weg
            </Button>
          </form>
          {overlay.message && <div className="text-xs text-muted-foreground">Auf Sendung: „{overlay.message}“</div>}
        </div>

        <div className="space-y-2 rounded-lg bg-muted/40 p-3">
          <div className="text-sm font-semibold text-foreground">Browserquelle für OBS (1920 × 1080)</div>
          <div className="flex gap-2">
            <Input readOnly value={overlayUrl} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="outline" size="icon" onClick={() => copy(overlayUrl)} aria-label="URL kopieren">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`${overlayUrl}?preview=live`} target="_blank" rel="noopener noreferrer">
                <Eye className="mr-1.5 h-4 w-4" /> Vorschau (echte Daten)
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`${overlayUrl}?preview=1`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-4 w-4" /> Design-Vorschau (Beispieldaten)
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
