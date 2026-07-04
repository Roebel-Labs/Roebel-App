"use client";

// The AI Mini-App Builder — a standalone v0-style workspace. Chat on the left
// drives chat-iterative generation of a single-file Röbel mini app; the stage
// on the right runs it live in a phone frame against the real host bridge
// (Vorschau) or shows the streaming document (Code). Publishing stores the app
// in Supabase and serves it from /mini/<slug>.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUp,
  History,
  Rocket,
  Sparkles,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useWalletAddress } from "@/components/mini-apps/useWallet";
import { CanvasView } from "./components/CanvasView";
import { CodePane } from "./components/CodePane";
import { PreviewFrame } from "./components/PreviewFrame";
import { PublishDialog, type PublishSuccess } from "./components/PublishDialog";
import { extractResult, stripFences } from "./lib/stream";

const EXAMPLE_PROMPTS = [
  "Eine Umfrage-App: Bürger:innen stimmen über die nächste Stadtfest-Location ab und sehen die Ergebnisse als Balken.",
  "Ein Müll-Meldetool: Standort wählen, Foto-Notiz, Meldung absenden — mit 5 Röbel-Münzen Belohnung.",
  "Ein Quiz über die Röbeler Geschichte mit 5 Fragen und einer Belohnung am Ende.",
  "Ein Kassenstand-Dashboard, das den Röbel-Münzen-Stand und die letzten Aktivitäten zeigt.",
];

type Complexity = "default" | "hard";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  versionIndex?: number;
  error?: boolean;
}

interface Version {
  html: string;
  notes: string;
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function NewMiniAppBuilderPage() {
  const wallet = useWalletAddress();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [streaming, setStreaming] = useState(false);
  const [stream, setStream] = useState("");
  const [tab, setTab] = useState<"preview" | "canvas" | "code">("preview");
  const [complexity, setComplexity] = useState<Complexity>("default");
  const [input, setInput] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [published, setPublished] = useState<PublishSuccess | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const activeHtml = activeIdx >= 0 ? versions[activeIdx]?.html ?? null : null;
  const started = messages.length > 0;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streaming]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length < 3 || streaming) return;
      const userMsg: ChatMsg = { id: uid(), role: "user", content: trimmed };
      // Assistant history goes to the model as its short notes, not full code —
      // the current document is attached separately server-side.
      const convo = [...messages, userMsg]
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setStreaming(true);
      setStream("");
      // Watch the build where it's visible: the phone preview can't show
      // streaming, so jump to the canvas (screens shimmer as they're written).
      // An explicit Code view stays put.
      setTab((t) => (t === "code" ? "code" : "canvas"));

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/mini-apps/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: convo,
            html: activeHtml ?? undefined,
            complexity,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? `Fehler ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setStream(stripFences(acc));
        }
        acc += decoder.decode();

        const { html, notes } = extractResult(acc);
        if (!html) {
          throw new Error(
            "Die KI hat kein gültiges HTML geliefert. Formuliere die Anfrage anders und versuch es noch einmal.",
          );
        }
        const idx = versions.length;
        setVersions((prev) => [...prev, { html, notes }]);
        setActiveIdx(idx);
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: notes || "Fertig — neue Version gebaut.",
            versionIndex: idx,
          },
        ]);
        setTab((t) => (t === "canvas" ? "canvas" : "preview"));
      } catch (e) {
        const aborted = (e as Error)?.name === "AbortError";
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: aborted
              ? "Abgebrochen. Beschreibe, was anders sein soll, und schick es erneut."
              : e instanceof Error
                ? e.message
                : "Generierung fehlgeschlagen.",
            error: true,
          },
        ]);
        if (versions.length > 0) setTab("preview");
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, versions, activeHtml, complexity, streaming],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const idea = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" · ")
    .slice(0, 3500);

  if (!started) {
    return (
      <EmptyState
        input={input}
        setInput={setInput}
        complexity={complexity}
        setComplexity={setComplexity}
        onSend={send}
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/dashboard/mini-apps"
            aria-label="Zurück zu meinen Apps"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-border text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate font-heading text-sm font-bold text-foreground">
            KI-Baukasten
          </span>
          {versions.length > 0 ? (
            <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">
              Version {activeIdx + 1}/{versions.length}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ModelToggle value={complexity} onChange={setComplexity} disabled={streaming} />
          {published ? (
            <Badge className="hidden bg-success text-white sm:inline-flex">In Prüfung</Badge>
          ) : null}
          <Button
            size="sm"
            onClick={() => setPublishOpen(true)}
            disabled={!activeHtml || streaming}
          >
            <Rocket className="mr-1.5 h-3.5 w-3.5" />
            {published ? "Neue Version einreichen" : "Veröffentlichen"}
          </Button>
        </div>
      </header>

      {/* workspace */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* chat panel */}
        <aside className="flex h-[45dvh] w-full shrink-0 flex-col border-b border-border md:h-auto md:w-[380px] md:border-b-0 md:border-r">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                msg={m}
                activeIdx={activeIdx}
                onRestore={(i) => {
                  setActiveIdx(i);
                  setTab("preview");
                }}
              />
            ))}
            {streaming ? (
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />
                <p className="font-mono text-[11px] text-muted-foreground">
                  ⌁ {stream.length.toLocaleString("de-DE")} Zeichen · baut…
                </p>
              </div>
            ) : null}
            <div ref={chatEndRef} />
          </div>
          <Composer
            input={input}
            setInput={setInput}
            streaming={streaming}
            onSend={send}
            onStop={stop}
            placeholder="Was soll anders sein? z. B. „Mach die Buttons größer und ergänze eine Bestätigung.“"
          />
        </aside>

        {/* stage */}
        <section className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <div className="flex shrink-0 items-center gap-1">
            <StageTab active={tab === "preview"} onClick={() => setTab("preview")}>
              Vorschau
            </StageTab>
            <StageTab active={tab === "canvas"} onClick={() => setTab("canvas")}>
              Canvas
            </StageTab>
            <StageTab active={tab === "code"} onClick={() => setTab("code")}>
              Code
            </StageTab>
            {published ? (
              <a
                href={published.homeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto truncate font-mono text-[11px] text-primary hover:underline"
              >
                {published.homeUrl}
              </a>
            ) : null}
          </div>
          {tab === "preview" ? (
            <PreviewFrame html={activeHtml} appName={published?.slug ?? "Mini-App"} />
          ) : tab === "canvas" ? (
            <CanvasView
              baseHtml={activeHtml}
              stream={stream}
              streaming={streaming}
              appName={published?.slug ?? "Mini-App"}
            />
          ) : (
            <CodePane text={streaming ? stream : activeHtml ?? stream} streaming={streaming} />
          )}
        </section>
      </div>

      {activeHtml ? (
        <PublishDialog
          open={publishOpen}
          onOpenChange={setPublishOpen}
          html={activeHtml}
          idea={idea}
          wallet={wallet}
          onPublished={setPublished}
        />
      ) : null}
    </div>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  activeIdx,
  onRestore,
}: {
  msg: ChatMsg;
  activeIdx: number;
  onRestore: (i: number) => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-[10px] bg-primary px-3 py-2 text-sm text-primary-foreground">
          {msg.content}
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <Sparkles
        className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", msg.error ? "text-destructive" : "text-primary")}
      />
      <div className="min-w-0 space-y-1.5">
        <p
          className={cn(
            "whitespace-pre-wrap text-sm",
            msg.error ? "text-destructive" : "text-foreground",
          )}
        >
          {msg.content}
        </p>
        {msg.versionIndex !== undefined ? (
          <button
            type="button"
            onClick={() => onRestore(msg.versionIndex!)}
            disabled={msg.versionIndex === activeIdx}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px]",
              msg.versionIndex === activeIdx
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:bg-muted",
            )}
          >
            <History className="h-2.5 w-2.5" />
            Version {msg.versionIndex + 1}
            {msg.versionIndex === activeIdx ? " · aktiv" : " · wiederherstellen"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Composer({
  input,
  setInput,
  streaming,
  onSend,
  onStop,
  placeholder,
  autoFocus,
}: {
  input: string;
  setInput: (v: string) => void;
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="shrink-0 border-t border-border p-3">
      <div className="flex items-end gap-2 rounded-[10px] border border-border bg-card p-2 focus-within:border-primary">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!streaming) onSend(input);
            }
          }}
          placeholder={placeholder}
          rows={2}
          autoFocus={autoFocus}
          disabled={streaming}
          className="max-h-32 min-h-[3rem] flex-1 resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        {streaming ? (
          <Button size="sm" variant="outline" onClick={onStop} aria-label="Stoppen">
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => onSend(input)}
            disabled={input.trim().length < 3}
            aria-label="Senden"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function ModelToggle({
  value,
  onChange,
  disabled,
}: {
  value: Complexity;
  onChange: (v: Complexity) => void;
  disabled?: boolean;
}) {
  return (
    <div className="hidden items-center rounded-[10px] border border-border p-0.5 sm:flex">
      {(
        [
          ["default", "Schnell"],
          ["hard", "Stark"],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          disabled={disabled}
          title={
            v === "hard"
              ? "Denkt vor dem Bauen nach — gründlicher, aber langsamer"
              : "Baut direkt los — schnellste Antwort"
          }
          className={cn(
            "rounded-[8px] px-2.5 py-1 text-[11px] font-medium",
            value === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function StageTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[10px] px-3 py-1.5 text-xs font-medium",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({
  input,
  setInput,
  complexity,
  setComplexity,
  onSend,
}: {
  input: string;
  setInput: (v: string) => void;
  complexity: Complexity;
  setComplexity: (v: Complexity) => void;
  onSend: (text: string) => void;
}) {
  return (
    <div className="relative flex h-dvh flex-col bg-background">
      {/* Bauplan backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 [background-size:24px_24px] [background-image:linear-gradient(to_right,rgba(0,73,139,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,73,139,0.05)_1px,transparent_1px)] dark:[background-image:linear-gradient(to_right,rgba(122,187,242,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(122,187,242,0.05)_1px,transparent_1px)]"
      />
      <header className="relative z-10 flex h-12 shrink-0 items-center px-3">
        <Link
          href="/dashboard/mini-apps"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Meine Apps
        </Link>
      </header>
      <main className="relative z-10 flex min-h-0 flex-1 items-center justify-center p-4">
        <div className="w-full max-w-xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-[14px] bg-primary">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="font-heading text-3xl font-bold text-foreground">
              Was baust du für Röbel?
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Beschreibe deine Idee — die KI baut eine Mini-App im Röbel-Design mit echtem SDK.
              Live testen, anpassen, zur Prüfung einreichen.
            </p>
          </div>

          <div className="rounded-[14px] border border-border bg-card p-3 shadow-sm">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend(input);
                }
              }}
              placeholder="z. B. Eine Umfrage-App, in der Bürger:innen über die nächste Stadtfest-Location abstimmen…"
              rows={3}
              autoFocus
              className="w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <ModelToggle value={complexity} onChange={setComplexity} />
              <Button size="sm" onClick={() => onSend(input)} disabled={input.trim().length < 3}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" /> App bauen
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {EXAMPLE_PROMPTS.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setInput(ex)}
                className="rounded-[10px] border border-border bg-card p-3 text-left text-xs text-muted-foreground hover:border-primary hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
