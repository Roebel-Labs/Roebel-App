"use client";

// Import an externally built mini app into the personal dashboard:
//   URL        — an app hosted anywhere (Lovable, Vercel, eigener Server);
//                server-side inspect prefills the manifest + checks embed headers.
//   HTML-Datei — a single-file app built in Claude Code (or exported from the
//                KI-Baukasten); stored like AI apps and served from /mini/<slug>.
//   Claude Code & MCP — setup snippets for building with agents.
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileCode2, Globe, Loader2, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PageHeader, categoryLabel } from "@/components/mini-apps/ui";
import { ManifestForm } from "@/components/mini-apps/ManifestForm";
import { miniAppWrite } from "@/components/mini-apps/client";
import { useWalletAddress } from "@/components/mini-apps/useWallet";
import type { ManifestDraft } from "@/lib/miniapp/ai/manifest";
import { MINI_APP_CATEGORIES, MINI_APP_PERMISSIONS } from "@/lib/miniapp/ai/manifest";
import type { MiniAppManifest, MiniAppRow } from "@/lib/miniapp/types";

type Tab = "url" | "html" | "mcp";

interface InspectResult {
  title: string | null;
  description: string | null;
  iconUrl: string | null;
  themeColor: string | null;
  embeddable: boolean;
  sdkDetected: boolean;
  warnings: string[];
  finalUrl: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export default function ImportMiniApp() {
  const [tab, setTab] = useState<Tab>("url");
  return (
    <div>
      <PageHeader
        title="App importieren"
        description="Hol eine bestehende App in die Röbel App — egal ob mit Lovable, Claude Code oder von Hand gebaut. Nach dem Einreichen prüft ein Admin deine App."
      />
      <div className="mb-4 flex gap-1">
        {(
          [
            ["url", "Gehostete URL", Globe],
            ["html", "HTML-Datei", FileCode2],
            ["mcp", "Claude Code & MCP", TerminalSquare],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium",
              tab === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
      {tab === "url" ? <UrlImport /> : tab === "html" ? <HtmlImport /> : <McpGuide />}
    </div>
  );
}

// ── URL import (Lovable / Vercel / anywhere) ────────────────────────────────

function UrlImport() {
  const wallet = useWalletAddress();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspect, setInspect] = useState<InspectResult | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [done, setDone] = useState<MiniAppRow | null>(null);

  const prefill = useMemo(() => {
    if (!inspect) return null;
    const name = (inspect.title ?? "").slice(0, 32);
    return {
      slug: slugify(name || new URL(inspect.finalUrl).hostname.split(".")[0]),
      name,
      icon_url: inspect.iconUrl,
      home_url: inspect.finalUrl,
      description: (inspect.description ?? "").slice(0, 200),
      category: "utility",
      tags: [],
      screenshots: [],
      permissions: [],
      primary_color: inspect.themeColor ?? "#00498B",
    } as unknown as MiniAppRow;
  }, [inspect]);

  async function runInspect() {
    setBusy(true);
    setError(null);
    setInspect(null);
    try {
      const res = await fetch("/api/mini-apps/import/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setInspect(json as InspectResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit(manifest: MiniAppManifest) {
    if (!wallet) {
      setError("Bitte verbinde dich zuerst.");
      return;
    }
    setSubmitBusy(true);
    setError(null);
    try {
      const { app } = await miniAppWrite<{ app: MiniAppRow }>(
        "submit",
        "POST",
        { manifest, wallet },
        wallet,
      );
      setDone(app);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitBusy(false);
    }
  }

  if (done) return <SuccessCard app={done} />;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <Label htmlFor="import-url">URL der gehosteten App</Label>
        <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
          z. B. deine mit Lovable gebaute App (<span className="font-mono">…lovable.app</span>) oder
          ein Vercel-Deployment. Wir lesen Titel, Beschreibung und Icon aus und prüfen, ob die
          Seite im Röbel-Host eingebettet werden kann.
        </p>
        <div className="flex gap-2">
          <Input
            id="import-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!busy && url.trim()) runInspect();
              }
            }}
            placeholder="https://meine-app.lovable.app"
          />
          <Button onClick={runInspect} disabled={busy || !url.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Prüfen"}
          </Button>
        </div>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        {inspect ? (
          <div className="mt-3 space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm">
              {inspect.embeddable ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-warning" />
              )}
              {inspect.embeddable
                ? "Die Seite kann im Röbel-Host eingebettet werden."
                : "Achtung: Die Seite blockiert das Einbetten — siehe Hinweise."}
            </p>
            {inspect.warnings.map((w) => (
              <p key={w} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                {w}
              </p>
            ))}
          </div>
        ) : null}
      </Card>

      {inspect && prefill ? (
        <Card className="p-5">
          <p className="mb-4 text-sm font-semibold">Manifest prüfen & einreichen</p>
          <ManifestForm
            app={prefill}
            submitLabel="Zur Prüfung einreichen"
            onSubmit={submit}
            busy={submitBusy}
          />
        </Card>
      ) : null}
    </div>
  );
}

// ── Single-file HTML import (Claude Code) ───────────────────────────────────

function HtmlImport() {
  const wallet = useWalletAddress();
  const [html, setHtml] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [draft, setDraft] = useState<ManifestDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<{ slug: string; homeUrl: string } | null>(null);

  const readFile = useCallback(async (file: File) => {
    setError(null);
    const text = await file.text();
    const head = text.trimStart().slice(0, 200).toLowerCase();
    if (!head.startsWith("<!doctype html") && !head.startsWith("<html")) {
      setError("Die Datei ist kein vollständiges HTML-Dokument (<!doctype html> fehlt).");
      return;
    }
    if (!text.includes("actions.ready")) {
      setError(
        "Die App ruft sdk.actions.ready() nicht auf — ohne diesen Aufruf bleibt der Lade-Splash im Röbel-Host stehen. Siehe die SDK-Doku unter /developers/mini-apps.",
      );
      return;
    }
    setHtml(text);
    setFileName(file.name);
    setDraft(null);
    // AI-Entwurf des Manifests aus dem Dokument.
    setBusy(true);
    try {
      const res = await fetch("/api/mini-apps/manifest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ html: text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setDraft(json.manifest as ManifestDraft);
    } catch {
      // Entwurf ist Komfort — Formular startet dann leer.
      setDraft({
        name: fileNameToName(file.name),
        slug: slugify(fileNameToName(file.name)),
        description: "",
        category: "utility",
        tags: [],
        permissions: [],
        primaryColor: "#00498B",
      });
    } finally {
      setBusy(false);
    }
  }, []);

  async function publish() {
    if (!wallet) {
      setError("Bitte verbinde dich zuerst.");
      return;
    }
    if (!html || !draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mini-apps/publish", {
        method: "POST",
        headers: { "content-type": "application/json", "x-wallet-address": wallet },
        body: JSON.stringify({ html, manifest: draft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setPublished({ slug: json.slug, homeUrl: json.homeUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (published) {
    return (
      <Card className="space-y-2 p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
        <p className="text-sm font-semibold">Eingereicht — deine App ist in der Prüfung.</p>
        <p className="font-mono text-xs text-primary">{published.homeUrl}</p>
        <div className="flex justify-center gap-2 pt-2">
          <Link href="/dashboard/mini-apps">
            <Button size="sm">Zu meinen Apps</Button>
          </Link>
          <Link href={`/editor?app=${published.slug}`}>
            <Button size="sm" variant="outline">
              Im KI-Baukasten öffnen
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <Label>Selbstständige HTML-Datei</Label>
        <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
          Eine einzelne .html-Datei — z. B. mit Claude Code gebaut (Anleitung im Tab „Claude Code
          & MCP“). Sie wird wie eine KI-App gespeichert und unter roebel.app/mini/&lt;slug&gt;
          ausgeliefert.
        </p>
        <label
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void readFile(f);
          }}
          onDragOver={(e) => e.preventDefault()}
          className="flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border border-dashed border-border p-8 text-center hover:border-primary"
        >
          <FileCode2 className="h-6 w-6 text-muted-foreground" />
          <span className="text-sm">
            {fileName ? (
              <span className="font-mono">{fileName}</span>
            ) : (
              "HTML-Datei hierher ziehen oder klicken"
            )}
          </span>
          <input
            type="file"
            accept=".html,text/html"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        {busy && !draft ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Manifest wird entworfen…
          </p>
        ) : null}
      </Card>

      {html && draft ? (
        <Card className="space-y-4 p-5">
          <p className="text-sm font-semibold">Store-Eintrag</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="h-name">Name</Label>
              <Input
                id="h-name"
                value={draft.name}
                maxLength={32}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="h-slug">slug</Label>
              <Input
                id="h-slug"
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: slugify(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="h-desc">Beschreibung</Label>
            <Input
              id="h-desc"
              value={draft.description}
              maxLength={200}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="h-cat">Kategorie</Label>
            <select
              id="h-cat"
              value={draft.category}
              onChange={(e) =>
                setDraft({ ...draft, category: e.target.value as ManifestDraft["category"] })
              }
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {MINI_APP_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Berechtigungen</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {MINI_APP_PERMISSIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      permissions: draft.permissions.includes(p)
                        ? draft.permissions.filter((x) => x !== p)
                        : [...draft.permissions, p],
                    })
                  }
                  className={
                    draft.permissions.includes(p)
                      ? "rounded-full border border-[#00498B] bg-[#00498B]/10 px-3 py-1 text-xs font-medium text-[#00498B]"
                      : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-foreground/40"
                  }
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={publish} disabled={busy || !draft.name || !draft.slug}>
            {busy ? "Wird eingereicht…" : "Zur Prüfung einreichen"}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}

function fileNameToName(name: string): string {
  return name
    .replace(/\.html?$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 32);
}

// ── Claude Code & MCP guide ─────────────────────────────────────────────────

function McpGuide() {
  const base = typeof window !== "undefined" ? window.location.origin : "https://www.roebel.app";
  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <p className="text-sm font-semibold">Mit Claude Code (oder jedem KI-Agenten) bauen</p>
        <p className="text-sm text-muted-foreground">
          Gib deinem Agenten die Doku — sie enthält das komplette SDK, die Design-Regeln und den
          Veröffentlichungs-Weg:
        </p>
        <Snippet label="Doku für KI-Agenten (llms-full.txt)">{`${base}/mini-apps/llms-full.txt`}</Snippet>
        <p className="text-sm text-muted-foreground">
          Beispiel-Prompt: „Lies {base}/mini-apps/llms-full.txt und baue mir eine Röbel Mini-App
          als einzelne HTML-Datei: …“ — die fertige Datei reichst du im Tab „HTML-Datei“ ein oder
          direkt per MCP.
        </p>
      </Card>
      <Card className="space-y-3 p-5">
        <p className="text-sm font-semibold">MCP-Server verbinden (empfohlen)</p>
        <p className="text-sm text-muted-foreground">
          Über den Netizen-MCP-Server kann dein Agent Apps direkt auflisten, validieren und
          einreichen. Erstelle zuerst einen API-Key unter{" "}
          <Link href="/dashboard/mini-apps/api" className="text-primary hover:underline">
            API & MCP
          </Link>
          , dann:
        </p>
        <Snippet label="Claude Code">{`claude mcp add --transport http netizen ${base}/api/mcp --header "Authorization: Bearer nz_DEIN_KEY"`}</Snippet>
        <p className="text-xs text-muted-foreground">
          Werkzeuge: get_started, get_docs, validate_html, list_my_apps, get_app,
          publish_html_app, submit_external_app, update_app_manifest, get_app_analytics.
        </p>
      </Card>
      <Card className="space-y-3 p-5">
        <p className="text-sm font-semibold">Mit Lovable (oder v0 & Co.) bauen</p>
        <p className="text-sm text-muted-foreground">
          Installiere in deinem Lovable-Projekt das SDK{" "}
          <span className="font-mono text-xs">@netizen-labs/miniapp-sdk</span> und füge den
          Lovable-Prompt aus der{" "}
          <Link href="/developers/mini-apps" className="text-primary hover:underline">
            Entwickler-Doku
          </Link>{" "}
          ein. Außerhalb des Röbel-Hosts läuft das SDK im Mock-Modus — deine App bleibt in der
          Lovable-Vorschau voll bedienbar. Danach: veröffentlichen und die URL im Tab „Gehostete
          URL“ einreichen.
        </p>
      </Card>
    </div>
  );
}

function Snippet({ label, children }: { label: string; children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(children).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        title="Kopieren"
        className="block w-full overflow-x-auto rounded-[10px] border border-border bg-muted/50 p-2.5 text-left font-mono text-xs hover:border-primary"
      >
        {children}
        {copied ? <span className="ml-2 text-success">✓ kopiert</span> : null}
      </button>
    </div>
  );
}

function SuccessCard({ app }: { app: MiniAppRow }) {
  return (
    <Card className="space-y-2 p-6 text-center">
      <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
      <p className="text-sm font-semibold">„{app.name}“ ist eingereicht und in der Prüfung.</p>
      <div className="flex justify-center gap-2 pt-2">
        <Link href={`/dashboard/mini-apps/${app.id}`}>
          <Button size="sm">Zur App-Seite</Button>
        </Link>
        <Link href="/dashboard/mini-apps">
          <Button size="sm" variant="outline">
            Meine Apps
          </Button>
        </Link>
      </div>
    </Card>
  );
}
