"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Rocket, Sparkles, Square, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { GeneratedFiles } from "./components/GeneratedFiles";
import { LivePreview } from "./components/LivePreview";
import { parsePartialPlan, usableFiles, type PartialPlan } from "./lib/streamParse";

type Phase = "idle" | "generating" | "ready" | "publishing" | "published";

const EXAMPLE_PROMPTS = [
  "Eine Umfrage-App: Bürger:innen stimmen über die nächste Stadtfest-Location ab und sehen die Ergebnisse als Balken.",
  "Ein Müll-Meldetool: Standort wählen, Foto-Notiz, Meldung absenden — mit 5 Röbel-Münzen Belohnung.",
  "Ein Quiz über die Röbeler Geschichte mit 5 Fragen und einer Belohnung am Ende.",
  "Ein Kassenstand-Dashboard, das den Röbel-Münzen-Stand und die letzten Aktivitäten zeigt.",
];

export default function NewMiniAppBuilderPage() {
  const [prompt, setPrompt] = useState("");
  const [complexity, setComplexity] = useState<"default" | "hard">("default");
  const [phase, setPhase] = useState<Phase>("idle");
  const [rawStream, setRawStream] = useState("");
  const [plan, setPlan] = useState<PartialPlan | null>(null);
  const [publishUrl, setPublishUrl] = useState<string | null>(null);
  const [deployButtonUrl, setDeployButtonUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const files = useMemo(() => usableFiles(plan), [plan]);
  const manifest = plan?.manifest ?? null;
  const streaming = phase === "generating";

  const generate = useCallback(async () => {
    const p = prompt.trim();
    if (p.length < 3) {
      toast({ title: "Beschreibung fehlt", description: "Beschreibe kurz, was die Mini-App tun soll.", variant: "destructive" });
      return;
    }
    setPhase("generating");
    setRawStream("");
    setPlan(null);
    setPublishUrl(null);
    setErrorMsg(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/mini-apps/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: p, complexity }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `Fehler ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      // Stream loop: accumulate the growing JSON text, parse tolerantly, render live.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setRawStream(acc);
        const partial = parsePartialPlan(acc);
        if (partial) setPlan(partial);
      }
      acc += decoder.decode();
      const finalPlan = parsePartialPlan(acc);
      if (finalPlan) setPlan(finalPlan);

      if (!finalPlan || !finalPlan.files?.length) {
        throw new Error("Keine gültige Mini-App generiert. Versuch es mit einer klareren Beschreibung.");
      }
      setPhase("ready");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        setPhase(plan?.files?.length ? "ready" : "idle");
        return;
      }
      setErrorMsg(e instanceof Error ? e.message : "Generierung fehlgeschlagen");
      setPhase("idle");
      toast({ title: "Generierung fehlgeschlagen", description: e instanceof Error ? e.message : "Unbekannter Fehler", variant: "destructive" });
    } finally {
      abortRef.current = null;
    }
  }, [prompt, complexity, plan]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const publish = useCallback(async () => {
    if (!plan) return;
    setPhase("publishing");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/mini-apps/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error ?? `Fehler ${res.status}`);
      }
      setPublishUrl(data.homeUrl ?? null);
      setDeployButtonUrl(data.deployButtonUrl ?? null);
      setPhase("published");
      toast({
        title: "Zur Prüfung eingereicht",
        description: `„${manifest?.name ?? "Mini-App"}" wurde erstellt und wartet auf die Admin-Freigabe.`,
      });
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Veröffentlichung fehlgeschlagen");
      setPhase("ready");
      toast({ title: "Veröffentlichung fehlgeschlagen", description: e instanceof Error ? e.message : "Unbekannter Fehler", variant: "destructive" });
    }
  }, [plan, manifest]);

  const canPublish = phase === "ready" && files.length > 0 && !!manifest?.slug;

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-[1400px] flex-col gap-4 p-4">
      {/* header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/mini-apps"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-border text-muted-foreground hover:bg-muted"
            aria-label="Zurück"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 font-heading text-lg font-bold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" /> Mini-App bauen
            </h1>
            <p className="text-xs text-muted-foreground">
              Beschreibe deine Idee — die KI baut eine Röbel-konforme Mini-App, die du live testen und einreichen kannst.
            </p>
          </div>
        </div>
      </div>

      {/* prompt bar */}
      <div className="rounded-[10px] border border-border bg-card p-4">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !streaming) generate();
          }}
          placeholder="z. B. Eine Umfrage-App, in der Bürger:innen über die nächste Stadtfest-Location abstimmen…"
          rows={3}
          className="resize-none border-border bg-background text-sm"
          disabled={streaming || phase === "publishing"}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {EXAMPLE_PROMPTS.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPrompt(ex)}
                disabled={streaming || phase === "publishing"}
                className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                {ex.length > 42 ? ex.slice(0, 42) + "…" : ex}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={complexity === "hard"}
                onChange={(e) => setComplexity(e.target.checked ? "hard" : "default")}
                disabled={streaming}
                className="h-3.5 w-3.5 accent-[#00498B]"
              />
              Stärkeres Modell
            </label>
            {streaming ? (
              <Button variant="outline" size="sm" onClick={stop}>
                <Square className="mr-1.5 h-3.5 w-3.5" /> Stopp
              </Button>
            ) : (
              <Button size="sm" onClick={generate} disabled={phase === "publishing"}>
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                {files.length > 0 ? "Neu generieren" : "Generieren"}
              </Button>
            )}
          </div>
        </div>
        {errorMsg ? <p className="mt-2 text-xs text-destructive">{errorMsg}</p> : null}
      </div>

      {/* main: files | preview */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(380px,440px)]">
        <GeneratedFiles files={files} streaming={streaming} />
        <div className="flex min-h-0 flex-col gap-4">
          <LivePreview files={files} streaming={streaming} />
          {/* manifest + publish */}
          <ManifestPublishCard
            manifest={manifest}
            notes={plan?.notes}
            canPublish={canPublish}
            phase={phase}
            publishUrl={publishUrl}
            deployButtonUrl={deployButtonUrl}
            onPublish={publish}
          />
        </div>
      </div>
    </div>
  );
}

function ManifestPublishCard({
  manifest,
  notes,
  canPublish,
  phase,
  publishUrl,
  deployButtonUrl,
  onPublish,
}: {
  manifest: Record<string, unknown> | null;
  notes?: string;
  canPublish: boolean;
  phase: Phase;
  publishUrl: string | null;
  deployButtonUrl: string | null;
  onPublish: () => void;
}) {
  const name = (manifest?.name as string) ?? "—";
  const slug = (manifest?.slug as string) ?? "";
  const category = (manifest?.category as string) ?? "";
  const permissions = (manifest?.permissions as string[]) ?? [];

  return (
    <div className="shrink-0 rounded-[10px] border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-heading text-sm font-semibold text-foreground">{name}</p>
          {slug ? <p className="truncate text-[11px] text-muted-foreground">/{slug}</p> : null}
          {(manifest?.description as string) ? (
            <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
              {manifest?.description as string}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {category ? (
              <Badge variant="secondary" className="text-[10px]">
                {category}
              </Badge>
            ) : null}
            {permissions.map((p) => (
              <Badge key={p} variant="outline" className="text-[10px]">
                {p}
              </Badge>
            ))}
          </div>
        </div>
        <div className="shrink-0">
          {phase === "published" ? (
            <div className="flex flex-col items-end gap-1.5 text-right">
              <Badge className="bg-success text-white">In Prüfung</Badge>
              {publishUrl ? (
                <p className="max-w-[160px] truncate text-[10px] text-muted-foreground" title={publishUrl}>
                  {publishUrl}
                </p>
              ) : null}
              {deployButtonUrl ? (
                <a
                  href={deployButtonUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-foreground px-2 py-1 text-[10px] font-medium text-background hover:opacity-90"
                >
                  <Rocket className="h-3 w-3" />
                  Auf Vercel deployen
                </a>
              ) : null}
            </div>
          ) : (
            <Button size="sm" onClick={onPublish} disabled={!canPublish || phase === "publishing"}>
              <Rocket className="mr-1.5 h-3.5 w-3.5" />
              {phase === "publishing" ? "Reiche ein…" : "Veröffentlichen"}
            </Button>
          )}
        </div>
      </div>
      {notes ? <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground">{notes}</p> : null}
      {phase === "published" ? (
        <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
          Die Mini-App wurde erstellt und in die Admin-Prüfung übernommen. Nach der Freigabe erscheint sie im Mini-App-Store.
        </p>
      ) : null}
    </div>
  );
}
