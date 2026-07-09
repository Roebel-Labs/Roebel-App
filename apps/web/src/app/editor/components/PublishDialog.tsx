"use client";

// Publish flow: AI drafts the store manifest from the built app, the developer
// edits it, publishing stores the HTML in Supabase and enters admin review.
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Rocket } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { miniAppWrite } from "@/components/mini-apps/client";
import {
  MINI_APP_CATEGORIES,
  MINI_APP_PERMISSIONS,
  safeIconDataUri,
  type ManifestDraft,
} from "@/lib/miniapp/ai/manifest";

const CATEGORY_LABELS: Record<string, string> = {
  community: "Gemeinschaft",
  governance: "Mitbestimmung",
  finance: "Finanzen",
  utility: "Werkzeuge",
  games: "Spiele",
  education: "Bildung",
  news: "Nachrichten",
  culture: "Kultur",
  environment: "Umwelt",
};

const PERMISSION_LABELS: Record<string, string> = {
  wallet: "Wallet",
  rewards: "Belohnungen",
  notifications: "Mitteilungen",
  circles: "Röbel-Münzen",
  share: "Teilen",
};

export interface PublishSuccess {
  slug: string;
  homeUrl: string;
  version?: string;
  republished?: boolean;
}

export function PublishDialog({
  open,
  onOpenChange,
  html,
  idea,
  wallet,
  preset,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  html: string;
  idea: string;
  wallet: string | undefined;
  /** Manifest of a re-opened app — used instead of an AI draft so re-publishing keeps the slug. */
  preset?: ManifestDraft | null;
  onPublished: (result: PublishSuccess) => void;
}) {
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ManifestDraft | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [success, setSuccess] = useState<PublishSuccess | null>(null);

  const loadDraft = useCallback(async () => {
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch("/api/mini-apps/manifest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ html, idea }),
      });
      const json = await res.json();
      if (!res.ok || !json.manifest) throw new Error(json.error ?? `HTTP ${res.status}`);
      setDraft(json.manifest as ManifestDraft);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "Entwurf fehlgeschlagen");
    } finally {
      setDrafting(false);
    }
  }, [html, idea]);

  // Draft once per opened dialog (re-drafts when a new version is being published).
  // A preset (re-opened app) wins over the AI draft so the slug stays stable.
  useEffect(() => {
    if (open && !draft && !drafting && !success) {
      if (preset) setDraft(preset);
      else void loadDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A new build invalidates the old draft + success state.
  useEffect(() => {
    setDraft(null);
    setSuccess(null);
    setPublishError(null);
  }, [html]);

  const set = <K extends keyof ManifestDraft>(key: K, value: ManifestDraft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const togglePermission = (p: ManifestDraft["permissions"][number]) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            permissions: d.permissions.includes(p)
              ? d.permissions.filter((x) => x !== p)
              : [...d.permissions, p],
          }
        : d,
    );

  const publish = async () => {
    if (!draft) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const result = await miniAppWrite<PublishSuccess & { ok: boolean }>(
        "publish",
        "POST",
        { html, manifest: draft },
        wallet,
      );
      setSuccess(result);
      onPublished(result);
    } catch (e) {
      const err = e as Error & { code?: string };
      setPublishError(
        err.message?.startsWith("slug_taken")
          ? "Dieser Kurzname ist schon vergeben — wähle einen anderen."
          : err.message ?? "Veröffentlichung fehlgeschlagen",
      );
    } finally {
      setPublishing(false);
    }
  };

  const iconUri = safeIconDataUri(draft?.iconSvg);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        {success ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-heading">
                <CheckCircle2 className="h-5 w-5 text-success" /> Eingereicht
              </DialogTitle>
              <DialogDescription>
                {success.republished
                  ? `Version ${success.version ?? ""} wurde eingereicht und ersetzt nach der Freigabe die bisherige.`
                  : "Deine Mini-App wurde erstellt und wartet auf die Freigabe durch das Röbel-Team."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-[10px] border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">Adresse der App</p>
                <a
                  href={success.homeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 flex items-center gap-1.5 break-all font-mono text-xs text-primary hover:underline"
                >
                  {success.homeUrl}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
              <p className="text-xs text-muted-foreground">
                Nach der Freigabe erscheint sie im Mini-App-Store der Röbel App. Du kannst hier
                weiterbauen — erneutes Veröffentlichen reicht eine neue Version ein.
              </p>
              <Button className="w-full" onClick={() => onOpenChange(false)}>
                Weiter bauen
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading">Veröffentlichen</DialogTitle>
              <DialogDescription>
                Prüfe den Store-Eintrag — die KI hat ihn aus deiner App vorbereitet.
              </DialogDescription>
            </DialogHeader>

            {drafting ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Store-Eintrag wird vorbereitet…
              </div>
            ) : draftError ? (
              <div className="space-y-3 py-4">
                <p className="text-sm text-destructive">{draftError}</p>
                <Button variant="outline" size="sm" onClick={loadDraft}>
                  Nochmal versuchen
                </Button>
              </div>
            ) : draft ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {iconUri ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={iconUri}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-[10px] border border-border bg-white"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-primary font-heading text-lg font-bold text-primary-foreground">
                      {draft.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor="ma-name" className="text-xs">
                      Name
                    </Label>
                    <Input
                      id="ma-name"
                      value={draft.name}
                      maxLength={32}
                      onChange={(e) => set("name", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ma-slug" className="text-xs">
                    Kurzname (Adresse: &lt;kurzname&gt;.roebel.site)
                  </Label>
                  <Input
                    id="ma-slug"
                    value={draft.slug}
                    onChange={(e) =>
                      set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
                    }
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ma-desc" className="text-xs">
                    Beschreibung
                  </Label>
                  <Textarea
                    id="ma-desc"
                    value={draft.description}
                    maxLength={200}
                    rows={2}
                    onChange={(e) => set("description", e.target.value)}
                    className="resize-none text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ma-cat" className="text-xs">
                    Kategorie
                  </Label>
                  <select
                    id="ma-cat"
                    value={draft.category}
                    onChange={(e) => set("category", e.target.value as ManifestDraft["category"])}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                  >
                    {MINI_APP_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c] ?? c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-foreground">Berechtigungen</p>
                  <div className="flex flex-wrap gap-1.5">
                    {MINI_APP_PERMISSIONS.map((p) => {
                      const active = draft.permissions.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePermission(p)}
                          className={
                            active
                              ? "rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground"
                              : "rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                          }
                        >
                          {PERMISSION_LABELS[p] ?? p}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Nur anfragen, was die App wirklich nutzt — der Host blockiert alles andere.
                  </p>
                </div>

                {draft.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {draft.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {publishError ? <p className="text-xs text-destructive">{publishError}</p> : null}

                <Button
                  className="w-full"
                  onClick={publish}
                  disabled={publishing || !wallet || !draft.name || !draft.slug}
                >
                  {publishing ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Reiche ein…
                    </>
                  ) : (
                    <>
                      <Rocket className="mr-1.5 h-3.5 w-3.5" /> Zur Prüfung einreichen
                    </>
                  )}
                </Button>
                {!wallet ? (
                  <p className="text-center text-[11px] text-muted-foreground">
                    Verbinde eine Wallet, um zu veröffentlichen.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
