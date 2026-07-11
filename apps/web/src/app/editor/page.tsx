"use client";

// The AI Mini-App Builder — a standalone v0-style workspace. Chat on the left
// drives chat-iterative generation of a single-file Röbel mini app; the stage
// on the right runs it live in a phone frame against the real host bridge
// (Vorschau) or shows the streaming document (Code). Publishing stores the app
// in Supabase and serves it from /mini/<slug>.
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUp,
  Bug,
  History,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  MousePointerClick,
  Rocket,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useWalletAddress } from "@/components/mini-apps/useWallet";
import { AutoStoreImages } from "./components/AutoStoreImages";
import { CanvasView } from "./components/CanvasView";
import { ChatSwitcher } from "./components/ChatSwitcher";
import { CmsImagePicker } from "./components/CmsImagePicker";
import { CmsPanel } from "./components/CmsPanel";
import { CmsSetupCard } from "./components/CmsSetupCard";
import { CodePane } from "./components/CodePane";
import { PreviewFrame } from "./components/PreviewFrame";
import { PublishDialog, type PublishSuccess } from "./components/PublishDialog";
import { fetchChat, schedulePush, trimForServer } from "./lib/chatSync";
import { uploadContentImage } from "./lib/cmsData";
import {
  buildCmsPromptBlock,
  fetchCmsPlan,
  type CmsKeyPlan,
  type CmsUserKeyPlan,
} from "./lib/cms";
import { isAcceptedImage, prepareImage, type PreparedImage } from "./lib/images";
import {
  buildElementContext,
  buildErrorFixPrompt,
  elementLabel,
  type InspectedElement,
  type RuntimeError,
} from "./lib/inspect";
import { extractResult, makeFrameParser, stripFences } from "./lib/stream";
import {
  DRAFT_KEY,
  appSessionKey,
  clearSession,
  loadSession,
  saveSession,
  type ChatMsg,
  type StoredSession,
  type Version,
} from "./lib/sessionStore";
import type { ManifestDraft } from "@/lib/miniapp/ai/manifest";

const EXAMPLE_PROMPTS = [
  "Eine Umfrage-App: Bürger:innen stimmen über die nächste Stadtfest-Location ab und sehen die Ergebnisse als Balken.",
  "Ein Müll-Meldetool: Standort wählen, Foto-Notiz, Meldung absenden — mit 5 Röbel-Münzen Belohnung.",
  "Ein Quiz über die Röbeler Geschichte mit 5 Fragen und einer Belohnung am Ende.",
  "Ein Kassenstand-Dashboard, das den Röbel-Münzen-Stand und die letzten Aktivitäten zeigt.",
];

type Complexity = "default" | "hard";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  // Live narration while generating: current phase + the model's Gedankengang.
  const [phase, setPhase] = useState<"vision" | "code" | null>(null);
  const [thinking, setThinking] = useState("");
  // Server-side job backing the current/last generation — survives sleep,
  // reload and tab close; resumed via /api/mini-apps/generate/status.
  const [pendingJob, setPendingJob] = useState<{ id: string; startedAt: number } | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const resumeGuardRef = useRef(false);
  const resumeCancelRef = useRef(false);
  // Mini-CMS pre-flight: check runs on the first build; a positive plan defers
  // the generation until the user decides on the setup card.
  const [checkingCms, setCheckingCms] = useState(false);
  const [cmsKeys, setCmsKeys] = useState<CmsKeyPlan[] | null>(null);
  const pendingBuildRef = useRef<{ text: string; images: string[] } | null>(null);
  const [tab, setTab] = useState<"preview" | "canvas" | "code" | "cms">("preview");
  const [complexity, setComplexity] = useState<Complexity>("default");
  // Server-side chat row this session syncs into (mini_app_editor_chats).
  const [chatId, setChatId] = useState<string | null>(null);
  const chatLoadedRef = useRef(false);
  // Sidebar-wide image drop target state (visible overlay while dragging).
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const [input, setInput] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [published, setPublished] = useState<PublishSuccess | null>(null);
  // Post-publish: auto-generate the store images (icon/hero/1:1 previews)
  // once per publish — keyed by runId so a re-publish starts a fresh run.
  // force=true (Toolbar „Store-Bilder neu erstellen“) replaces existing images.
  const [autoImagesJob, setAutoImagesJob] = useState<{
    html: string;
    slug: string;
    runId: number;
    force?: boolean;
  } | null>(null);
  // Set when an existing app is re-opened (?app=…): prefills the publish form
  // so re-publishing lands on the SAME slug as a new version.
  const [preset, setPreset] = useState<ManifestDraft | null>(null);
  const [loadingApp, setLoadingApp] = useState(false);
  const [attachments, setAttachments] = useState<PreparedImage[]>([]);
  const [inspected, setInspected] = useState<InspectedElement | null>(null);
  const [runtimeErrors, setRuntimeErrors] = useState<RuntimeError[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const addFiles = useCallback(async (files: Iterable<File>) => {
    const accepted = Array.from(files).filter(isAcceptedImage);
    for (const file of accepted) {
      try {
        const prepared = await prepareImage(file);
        setAttachments((prev) => (prev.length >= 4 ? prev : [...prev, prepared]));
      } catch {
        /* not decodable — skip silently */
      }
    }
  }, []);

  const onRuntimeError = useCallback((err: RuntimeError) => {
    setRuntimeErrors((prev) =>
      prev.length >= 5 || prev.some((e) => e.message === err.message) ? prev : [...prev, err],
    );
  }, []);

  const onInspect = useCallback((el: InspectedElement) => {
    setInspected(el);
  }, []);

  const activeHtml = activeIdx >= 0 ? versions[activeIdx]?.html ?? null : null;
  const started = messages.length > 0;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streaming]);

  const restoreSession = useCallback((s: StoredSession) => {
    setMessages(s.messages);
    setVersions(s.versions);
    setActiveIdx(s.activeIdx);
    setPreset(s.preset);
    setPublished(s.published);
    setPendingJob(s.pendingJob ?? null);
    setCmsKeys(s.cmsKeys ?? null);
    setChatId(s.chatId ?? null);
  }, []);

  // Re-open an existing AI-built app (?app=<slug|id>) or restore the last
  // unpublished draft session. Saved sessions carry the FULL chat + version
  // history; the registry is only the fallback when no session exists locally.
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    if (search.get("chat")) return; // server-chat restore effect handles this
    const param = search.get("app");
    if (!param) {
      const draft = loadSession(DRAFT_KEY);
      if (draft && draft.messages.length > 0) restoreSession(draft);
      return;
    }

    // Sessions are keyed by slug; the URL may carry the slug directly.
    const direct = loadSession(appSessionKey(param));
    if (direct && direct.messages.length > 0) {
      restoreSession(direct);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingApp(true);
      try {
        const res = await fetch(`/api/mini-apps/${encodeURIComponent(param)}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `Fehler ${res.status}`);
        const app = json.app as {
          name: string;
          slug: string;
          description: string | null;
          category: string;
          tags: string[] | null;
          permissions: string[] | null;
          primary_color: string | null;
          home_url: string;
        };
        if (cancelled) return;
        window.history.replaceState(null, "", `/editor?app=${app.slug}`);

        // The URL carried the uuid — check for a saved session under the slug.
        const bySlug = loadSession(appSessionKey(app.slug));
        if (bySlug && bySlug.messages.length > 0) {
          restoreSession(bySlug);
          return;
        }

        const versionRows = (json.versions ?? []) as { html?: string | null; version: string }[];
        const withHtml = versionRows.find((v) => typeof v.html === "string" && v.html.length > 0);
        if (!withHtml?.html) {
          throw new Error(
            "Für diese App ist kein Quelltext gespeichert — extern gehostete Apps können hier nicht geöffnet werden.",
          );
        }
        setVersions([{ html: withHtml.html, notes: "" }]);
        setActiveIdx(0);
        setPreset({
          name: app.name,
          slug: app.slug,
          description: app.description ?? "",
          category: (app.category ?? "utility") as ManifestDraft["category"],
          tags: (app.tags ?? []).slice(0, 5),
          permissions: (app.permissions ?? []) as ManifestDraft["permissions"],
          primaryColor: app.primary_color ?? "#00498B",
        });
        setPublished({ slug: app.slug, homeUrl: app.home_url });
        setMessages([
          {
            id: uid(),
            role: "assistant",
            content: `„${app.name}“ (Version ${withHtml.version}) ist geladen. Beschreibe, was du ändern möchtest — Veröffentlichen reicht eine neue Version ein. (Der frühere Chat-Verlauf ist nur auf dem Gerät gespeichert, auf dem er entstand.)`,
            versionIndex: 0,
          },
        ]);
      } catch (e) {
        if (!cancelled) {
          setMessages([
            {
              id: uid(),
              role: "assistant",
              content:
                e instanceof Error ? e.message : "Die App konnte nicht geladen werden.",
              error: true,
            },
          ]);
        }
      } finally {
        if (!cancelled) setLoadingApp(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open a server-side chat (?chat=<id>[&invite=<token>]) — cross-device
  // history and the invite flow. Waits for the wallet (the chats API needs it);
  // a valid invite token adds this wallet as collaborator before loading.
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const chatParam = search.get("chat");
    if (!chatParam || !wallet || chatLoadedRef.current) return;
    chatLoadedRef.current = true;
    setLoadingApp(true);
    void (async () => {
      const remote = await fetchChat(chatParam, wallet, search.get("invite"));
      if (remote && Array.isArray(remote.session?.messages)) {
        const s: StoredSession = { ...remote.session, chatId: remote.id };
        // Server copies keep only the newest version HTMLs — never restore
        // pointing at a trimmed (html-less) version (mirrors loadSession).
        if (s.activeIdx >= 0 && !s.versions?.[s.activeIdx]?.html) {
          s.activeIdx = (s.versions ?? []).reduce((acc, v, i) => (v.html ? i : acc), -1);
        }
        restoreSession(s);
        setChatId(remote.id);
        window.history.replaceState(null, "", `/editor?chat=${remote.id}`);
      } else {
        setMessages([
          {
            id: uid(),
            role: "assistant",
            content:
              "Der Chat konnte nicht geladen werden — kein Zugriff, gelöscht oder der Einladungslink ist ungültig.",
            error: true,
          },
        ]);
      }
      setLoadingApp(false);
    })();
  }, [wallet, restoreSession]);

  // One-time backfill: sessions saved BEFORE server-side history existed live
  // only in this browser's localStorage. Push each un-synced one to
  // mini_app_editor_chats once (chatId written back) so the switcher and the
  // dashboard card show the full history immediately. The ACTIVE session is
  // excluded entirely — its own live sync owns it (anything else duplicates
  // the row when both land in the same window).
  const backfillRef = useRef(false);
  const activeStorageKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!wallet || backfillRef.current) return;
    backfillRef.current = true;
    const t = setTimeout(() => {
      void (async () => {
        const keys: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k?.startsWith("netizen-builder:")) keys.push(k);
        }
        for (const key of keys) {
          if (key === activeStorageKeyRef.current) continue;
          const s = loadSession(key);
          if (!s || s.chatId || s.messages.length === 0) continue;
          try {
            const res = await fetch("/api/mini-apps/chats", {
              method: "POST",
              headers: { "content-type": "application/json", "x-wallet-address": wallet },
              body: JSON.stringify({
                id: null,
                session: trimForServer(s),
                appSlug: s.published?.slug ?? null,
              }),
            });
            if (res.ok) {
              const data = (await res.json()) as { chat?: { id?: string } };
              if (data.chat?.id) saveSession(key, { ...s, chatId: data.chat.id });
            }
          } catch {
            /* offline — the next visit retries */
          }
        }
      })();
    }, 4000);
    return () => clearTimeout(t);
  }, [wallet]);

  // Auto-save the session (debounced). Published apps save under their slug —
  // re-opening restores the full chat; unpublished work lives in the draft slot.
  // A connected wallet additionally mirrors the session to the server
  // (mini_app_editor_chats) so chats survive devices and power the dashboard.
  useEffect(() => {
    if (!started || loadingApp) return;
    // Mark which storage slot the ACTIVE session occupies (backfill skips it).
    activeStorageKeyRef.current = published?.slug ? appSessionKey(published.slug) : DRAFT_KEY;
    const t = setTimeout(() => {
      const session: StoredSession = {
        messages,
        versions,
        activeIdx,
        preset,
        published,
        pendingJob,
        cmsKeys,
        chatId,
        savedAt: Date.now(),
      };
      if (published?.slug) {
        saveSession(appSessionKey(published.slug), session);
        clearSession(DRAFT_KEY);
      } else {
        saveSession(DRAFT_KEY, session);
      }
      if (wallet) {
        schedulePush(session, wallet, chatId, (id, replaced) =>
          setChatId((prev) => (replaced ? id : prev ?? id)),
        );
      }
    }, 800);
    return () => clearTimeout(t);
  }, [messages, versions, activeIdx, preset, published, pendingJob, cmsKeys, chatId, wallet, started, loadingApp]);

  const newChat = useCallback(() => {
    if (
      versions.length > 0 &&
      !window.confirm("Aktuelle Sitzung verwerfen und eine neue App starten?")
    ) {
      return;
    }
    abortRef.current?.abort();
    resumeCancelRef.current = true;
    setPendingJob(null);
    jobIdRef.current = null;
    setCmsKeys(null);
    setCheckingCms(false);
    pendingBuildRef.current = null;
    // The per-app session (if any) stays saved — only the draft slot resets.
    clearSession(DRAFT_KEY);
    setChatId(null);
    chatLoadedRef.current = true; // don't re-load a ?chat= session after reset
    setMessages([]);
    setVersions([]);
    setActiveIdx(-1);
    setStream("");
    setStreaming(false);
    setInput("");
    setPublished(null);
    setPreset(null);
    setPublishOpen(false);
    setTab("preview");
    window.history.replaceState(null, "", "/editor");
  }, [versions.length]);

  // Turn a finished generation (from the live stream OR a resumed background
  // job) into a version + chat entry — or a precise error bubble.
  const applyResult = useCallback(
    (htmlAcc: string, thinkAcc: string, briefAcc: string, finishReason: string): boolean => {
      const { html, notes, truncated } = extractResult(htmlAcc);
      if (!html) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: truncated
              ? finishReason === "length"
                ? "Die App wurde abgeschnitten: Die Antwort hat das Ausgabe-Limit erreicht (im Modus „Stark“ zählt auch das Nachdenken mit). Versuch es mit „Schnell“ oder formuliere die Anforderung kompakter."
                : "Die Übertragung ist mittendrin abgebrochen — diese Version ist unvollständig und wurde verworfen. Schick die Anfrage einfach noch einmal ab."
              : "Die KI hat kein gültiges HTML geliefert. Formuliere die Anfrage anders und versuch es noch einmal.",
            error: true,
          },
        ]);
        return false;
      }
      setVersions((prev) => {
        const idx = prev.length;
        setActiveIdx(idx);
        setMessages((msgs) => [
          ...msgs,
          {
            id: uid(),
            role: "assistant",
            content: notes || "Fertig — neue Version gebaut.",
            versionIndex: idx,
            reasoning: thinkAcc ? thinkAcc.slice(0, 6000) : undefined,
            brief: briefAcc ? briefAcc.slice(0, 6000) : undefined,
          },
        ]);
        return [...prev, { html, notes }];
      });
      // Done → always land on the live phone preview (canvas was only the
      // construction view while streaming).
      setTab("preview");
      return true;
    },
    [],
  );

  // Resume a background job (laptop woke up, page reloaded, stream dropped):
  // poll the job state and feed the same UI states the live stream would.
  const resumeJob = useCallback(
    async (jobId: string) => {
      resumeCancelRef.current = false;
      setStreaming(true);
      setStream("");
      setThinking("");
      setPhase("code");
      try {
        for (let i = 0; i < 360; i++) {
          if (resumeCancelRef.current) return;
          const res = await fetch(`/api/mini-apps/generate/status?job=${jobId}`, {
            cache: "no-store",
          });
          if (res.status === 404) {
            // freshly created jobs can lag a poll or two behind
            if (i < 3) {
              await sleep(2000);
              continue;
            }
            throw new Error(
              "Der Hintergrund-Job ist nicht mehr auffindbar — schick die Anfrage bitte erneut ab.",
            );
          }
          if (!res.ok) throw new Error(`Fehler ${res.status}`);
          const st = (await res.json()) as {
            status: "running" | "done" | "error";
            phase: string;
            thinkingTail?: string;
            brief?: string;
            html?: string;
            finishReason?: string;
            error?: string;
            updatedAt: number;
          };
          setPhase(st.phase === "vision" ? "vision" : "code");
          if (st.thinkingTail) setThinking(st.thinkingTail);
          if (st.html) setStream(stripFences(st.html));
          if (st.status === "done") {
            applyResult(st.html ?? "", st.thinkingTail ?? "", st.brief ?? "", st.finishReason ?? "");
            setPendingJob(null);
            return;
          }
          if (st.status === "error") {
            throw new Error(st.error || "Generierung fehlgeschlagen.");
          }
          if (Date.now() - st.updatedAt > 180_000) {
            throw new Error(
              "Der Hintergrund-Job meldet sich nicht mehr — schick die Anfrage bitte erneut ab.",
            );
          }
          await sleep(2500);
        }
        throw new Error("Zeitüberschreitung beim Warten auf den Hintergrund-Job.");
      } catch (e) {
        setPendingJob(null);
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: e instanceof Error ? e.message : String(e),
            error: true,
          },
        ]);
      } finally {
        setStreaming(false);
        setPhase(null);
        setThinking("");
      }
    },
    [applyResult],
  );

  // Auto-resume: a restored session (or a dropped stream) leaves pendingJob
  // set while nothing is streaming → pick the job back up.
  useEffect(() => {
    if (!pendingJob || streaming || loadingApp || resumeGuardRef.current) return;
    if (Date.now() - pendingJob.startedAt > 20 * 60_000) {
      setPendingJob(null);
      return;
    }
    resumeGuardRef.current = true;
    void resumeJob(pendingJob.id).finally(() => {
      resumeGuardRef.current = false;
    });
  }, [pendingJob, streaming, loadingApp, resumeJob]);

  /** Core generation run — shared by send() and the CMS-setup confirm path. */
  const runGeneration = useCallback(
    async (
      convo: { role: "user" | "assistant"; content: string; images?: string[] }[],
      hadImages: boolean,
    ) => {
      setStreaming(true);
      setStream("");
      setThinking("");
      setPhase(hadImages ? "vision" : "code");
      jobIdRef.current = null;
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
            protocol: 2,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? `Fehler ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let htmlAcc = "";
        let thinkAcc = "";
        let briefAcc = "";
        let finishReason = "";
        const feed = makeFrameParser((f) => {
          if (f.t === "html" && f.v) {
            htmlAcc += f.v;
            setStream(stripFences(htmlAcc));
          } else if (f.t === "think" && f.v) {
            thinkAcc += f.v;
            setThinking(thinkAcc);
          } else if (f.t === "brief" && f.v) {
            briefAcc = f.v;
          } else if (f.t === "status" && (f.v === "vision" || f.v === "code")) {
            setPhase(f.v);
          } else if (f.t === "done" && f.v) {
            finishReason = f.v;
          } else if (f.t === "job" && f.v) {
            // Server-side job backing this generation — survives disconnects.
            jobIdRef.current = f.v;
            setPendingJob({ id: f.v, startedAt: Date.now() });
          }
        });
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          feed(decoder.decode(value, { stream: true }));
        }
        feed(decoder.decode());

        applyResult(htmlAcc, thinkAcc, briefAcc, finishReason);
        jobIdRef.current = null;
        setPendingJob(null);
      } catch (e) {
        const aborted = (e as Error)?.name === "AbortError";
        if (aborted) {
          // Deliberate stop: don't resume the server-side job.
          jobIdRef.current = null;
          setPendingJob(null);
        } else if (jobIdRef.current) {
          // Stream died (sleep/network) but the job lives on server-side —
          // the auto-resume effect picks it up from pendingJob.
          jobIdRef.current = null;
          return;
        }
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
        setPhase(null);
        setThinking("");
        abortRef.current = null;
      }
    },
    [versions.length, activeHtml, complexity, applyResult],
  );

  const send = useCallback(
    async (text: string) => {
      let trimmed = text.trim();
      if (streaming || checkingCms) return;
      if (trimmed.length < 3) {
        if (attachments.length === 0) return;
        trimmed = "Setze die angehängte Vorlage als Mini-App um.";
      }
      // Published app + attachments: persist the full-size images as content
      // assets first. The model gets the public URLs (usable directly in the
      // document or as CMS values) and the bubble offers "In CMS übernehmen".
      let imageUrls: string[] = [];
      if (attachments.length > 0 && published?.slug && wallet) {
        const uploaded = await Promise.all(
          attachments.map(async (a) => {
            try {
              const blob = await (await fetch(a.dataUrl)).blob();
              return await uploadContentImage(published.slug, wallet, blob, a.name);
            } catch {
              return null;
            }
          }),
        );
        imageUrls = uploaded.filter((u): u is string => Boolean(u));
      }

      const userMsg: ChatMsg = {
        id: uid(),
        role: "user",
        content: trimmed,
        images: attachments.length > 0 ? attachments.map((a) => a.thumb) : undefined,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        elementLabel: inspected ? elementLabel(inspected) : undefined,
      };
      // Assistant history goes to the model as its short notes, not full code —
      // the current document is attached separately server-side. The newest turn
      // carries the element context ("Bearbeiten" mode) + full-size attachments.
      const convo = [...messages, userMsg]
        .filter((m) => !m.error && !m.cmsPlan)
        .map((m, i, arr) => {
          const isLast = i === arr.length - 1;
          let content =
            isLast && inspected
              ? buildElementContext(inspected) + m.content
              : m.content;
          if (isLast && imageUrls.length > 0) {
            content += `\n\n[Die angehängten Bilder liegen als öffentliche URLs vor — nutze sie direkt (z. B. in <img src>) statt Platzhaltern: ${imageUrls.join(" ")}]`;
          }
          content = content.slice(0, 12000);
          return isLast && attachments.length > 0
            ? { role: m.role, content, images: attachments.map((a) => a.dataUrl) }
            : { role: m.role, content };
        });

      const hadImages = attachments.length > 0;
      const fullImages = attachments.map((a) => a.dataUrl);
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setAttachments([]);
      setInspected(null);
      setRuntimeErrors([]);

      // FIRST build: quick pre-flight — would this app benefit from the
      // Mini-CMS? If yes, show the setup card and defer the generation until
      // the user decides (Mit CMS / Ohne CMS). Fails soft on any error.
      if (messages.length === 0 && versions.length === 0) {
        setCheckingCms(true);
        const plan = await fetchCmsPlan(trimmed);
        setCheckingCms(false);
        if (plan?.cms && plan.keys.length > 0) {
          pendingBuildRef.current = { text: trimmed, images: fullImages };
          setMessages((prev) => [
            ...prev,
            { id: uid(), role: "assistant", content: "", cmsPlan: plan },
          ]);
          return;
        }
      }

      void runGeneration(convo, hadImages);
    },
    [messages, versions.length, streaming, checkingCms, attachments, inspected, published, wallet, runGeneration],
  );

  /** Decision on the CMS setup card: build with the confirmed keys or without. */
  const confirmCms = useCallback(
    (withCms: boolean, keys: CmsKeyPlan[], userKeys: CmsUserKeyPlan[]) => {
      const pending = pendingBuildRef.current;
      if (!pending || streaming) return;
      pendingBuildRef.current = null;
      setMessages((prev) =>
        prev.map((m) =>
          m.cmsPlan && !m.cmsResolved ? { ...m, cmsResolved: withCms ? "cms" : "plain" } : m,
        ),
      );
      setCmsKeys(withCms ? keys : null);
      const content = withCms
        ? `${pending.text}\n${buildCmsPromptBlock(keys, userKeys)}`
        : pending.text;
      void runGeneration(
        [
          {
            role: "user",
            content: content.slice(0, 12000),
            ...(pending.images.length > 0 ? { images: pending.images } : {}),
          },
        ],
        pending.images.length > 0,
      );
    },
    [streaming, runGeneration],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    // Also stop a resume-polling loop and drop the job (deliberate cancel).
    resumeCancelRef.current = true;
    setPendingJob(null);
  }, []);

  // One-click update for already-published apps: push the current code as a
  // new version, reuse ALL existing metadata (icon/images stay). Metadata
  // edits live in the dashboard. The manifest comes from the local preset —
  // or, when this session predates it, straight from the registry. Falls back
  // to the full publish dialog only when even that fails.
  const [updating, setUpdating] = useState(false);
  const quickUpdate = useCallback(async () => {
    if (!activeHtml || !published || !wallet || updating) return;
    setUpdating(true);
    try {
      let manifest = preset;
      if (!manifest) {
        const appRes = await fetch(`/api/mini-apps/${encodeURIComponent(published.slug)}`, {
          cache: "no-store",
          headers: { "x-wallet-address": wallet },
        });
        const appJson = await appRes.json().catch(() => ({}));
        if (!appRes.ok) throw new Error(appJson.error ?? `Fehler ${appRes.status}`);
        const app = appJson.app as {
          name: string;
          slug: string;
          description: string | null;
          category: string;
          tags: string[] | null;
          permissions: string[] | null;
          primary_color: string | null;
        };
        manifest = {
          name: app.name,
          slug: app.slug,
          description: app.description?.trim() || app.name,
          category: (app.category ?? "utility") as ManifestDraft["category"],
          tags: (app.tags ?? []).slice(0, 5),
          permissions: (app.permissions ?? []) as ManifestDraft["permissions"],
          primaryColor: app.primary_color ?? "#00498B",
        };
        setPreset(manifest);
      }
      const res = await fetch("/api/mini-apps/publish", {
        method: "POST",
        headers: { "content-type": "application/json", "x-wallet-address": wallet },
        body: JSON.stringify({ html: activeHtml, manifest }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? `Fehler ${res.status}`);
      setPublished({
        slug: json.slug,
        homeUrl: json.homeUrl,
        version: json.version,
        republished: true,
      });
      if (activeHtml) {
        setAutoImagesJob({ html: activeHtml, slug: json.slug, runId: Date.now() });
      }
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: `Update eingereicht — Version ${json.version} ist in der Prüfung. Name, Beschreibung und Bilder pflegst du jederzeit im Dashboard.`,
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: `Schnell-Update fehlgeschlagen (${e instanceof Error ? e.message : String(e)}) — prüfe die Angaben im Dialog.`,
          error: true,
        },
      ]);
      setPublishOpen(true);
    } finally {
      setUpdating(false);
    }
  }, [activeHtml, preset, published, wallet, updating]);

  // Switching versions invalidates preview-derived state.
  useEffect(() => {
    setRuntimeErrors([]);
    setInspected(null);
  }, [activeIdx]);

  const idea = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" · ")
    .slice(0, 3500);

  if (loadingApp) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">App wird geladen…</p>
      </div>
    );
  }

  if (!started) {
    return (
      <EmptyState
        input={input}
        setInput={setInput}
        complexity={complexity}
        setComplexity={setComplexity}
        onSend={send}
        attachments={attachments}
        onAddFiles={addFiles}
        onRemoveAttachment={(i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
        wallet={wallet ?? null}
        onOpenChat={(id) => {
          window.location.href = `/editor?chat=${id}`;
        }}
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
          <Image
            src="/logo.png"
            alt=""
            width={20}
            height={20}
            className="h-5 w-5 shrink-0 object-contain"
          />
          <span className="truncate font-heading text-sm font-bold text-foreground">
            KI-Baukasten
          </span>
          {versions.length > 0 ? (
            <select
              value={activeIdx}
              onChange={(e) => {
                setActiveIdx(Number(e.target.value));
                setTab("preview");
              }}
              disabled={streaming}
              title="Versionsverlauf — frühere Version wiederherstellen"
              className="hidden h-7 shrink-0 rounded-[8px] border border-border bg-card px-1.5 font-mono text-[11px] text-muted-foreground outline-none hover:text-foreground sm:inline-block"
            >
              {versions.map((v, i) => (
                <option key={i} value={i} disabled={!v.html}>
                  Version {i + 1}/{versions.length}
                  {v.html ? "" : " · nicht mehr gespeichert"}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ChatSwitcher
            wallet={wallet ?? null}
            activeChatId={chatId}
            onOpenChat={(id) => {
              // Full navigation: resets all builder state and loads the chat.
              window.location.href = `/editor?chat=${id}`;
            }}
            onNewChat={newChat}
          />
          <button
            type="button"
            onClick={newChat}
            disabled={streaming}
            title="Neue App starten (aktuelle Sitzung verwerfen)"
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Neu</span>
          </button>
          <ModelToggle value={complexity} onChange={setComplexity} disabled={streaming} />
          {published ? (
            <Badge className="hidden bg-success text-white sm:inline-flex">In Prüfung</Badge>
          ) : null}
          {published && activeHtml ? (
            <button
              type="button"
              disabled={streaming || !wallet}
              title="Alle Store-Bilder (Icon, Artwork, Vorschauen) mit KI neu erstellen — ersetzt vorhandene"
              onClick={() => {
                if (
                  !window.confirm(
                    "Alle Store-Bilder (Icon, Artwork, Vorschauen) neu erstellen? Vorhandene Bilder werden ersetzt.",
                  )
                )
                  return;
                setAutoImagesJob({
                  html: activeHtml,
                  slug: published.slug,
                  runId: Date.now(),
                  force: true,
                });
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Store-Bilder</span>
            </button>
          ) : null}
          <Button
            size="sm"
            onClick={() => (published ? void quickUpdate() : setPublishOpen(true))}
            disabled={!activeHtml || streaming || updating}
            title={
              published
                ? "Neue Code-Version mit den bestehenden App-Daten einreichen — Metadaten pflegst du im Dashboard"
                : undefined
            }
          >
            {updating ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Rocket className="mr-1.5 h-3.5 w-3.5" />
            )}
            {published
              ? updating
                ? "Wird eingereicht…"
                : "Update veröffentlichen"
              : "Veröffentlichen"}
          </Button>
        </div>
      </header>

      {/* workspace */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* chat panel — the whole sidebar accepts image drops */}
        <aside
          className="relative flex h-[45dvh] w-full shrink-0 flex-col border-b border-border md:h-auto md:w-[380px] md:border-b-0 md:border-r"
          onDragEnter={(e) => {
            if (Array.from(e.dataTransfer?.items ?? []).some((i) => i.type.startsWith("image/"))) {
              dragDepth.current += 1;
              setDragActive(true);
            }
          }}
          onDragLeave={() => {
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragActive(false);
          }}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer?.items ?? []).some((i) => i.type.startsWith("image/"))) {
              e.preventDefault();
            }
          }}
          onDrop={(e) => {
            dragDepth.current = 0;
            setDragActive(false);
            const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
              f.type.startsWith("image/"),
            );
            if (files.length > 0) {
              e.preventDefault();
              void addFiles(files);
            }
          }}
        >
          {dragActive && (
            <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-[10px] border-2 border-dashed border-primary bg-primary/5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-medium text-primary shadow-sm">
                <ImagePlus className="h-3.5 w-3.5" /> Bilder hier ablegen
              </span>
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                msg={m}
                activeIdx={activeIdx}
                restorable={
                  m.versionIndex === undefined || Boolean(versions[m.versionIndex]?.html)
                }
                onRestore={(i) => {
                  setActiveIdx(i);
                  setTab("preview");
                }}
                onCmsBuild={confirmCms}
                appSlug={published?.slug ?? null}
                wallet={wallet}
              />
            ))}
            {checkingCms ? (
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />
                <p className="font-mono text-[11px] text-muted-foreground">
                  ⌁ Prüfe, ob ein Mini-CMS für diese App sinnvoll ist…
                </p>
              </div>
            ) : null}
            {streaming ? (
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {phase === "vision"
                      ? "⌁ Vorlage wird analysiert…"
                      : stream.length > 0
                        ? `⌁ ${stream.length.toLocaleString("de-DE")} Zeichen · baut…`
                        : thinking
                          ? "⌁ denkt nach…"
                          : "⌁ startet…"}
                  </p>
                  {thinking && stream.length === 0 ? (
                    <p className="whitespace-pre-wrap break-words text-[11px] italic leading-snug text-muted-foreground">
                      {thinking.length > 480 ? `…${thinking.slice(-480)}` : thinking}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div ref={chatEndRef} />
          </div>
          {runtimeErrors.length > 0 && !streaming ? (
            <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-[10px] border border-destructive/40 bg-destructive/10 px-2.5 py-1.5">
              <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-destructive">
                <Bug className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {runtimeErrors.length === 1
                    ? "1 Laufzeitfehler in der Vorschau"
                    : `${runtimeErrors.length} Laufzeitfehler in der Vorschau`}
                </span>
              </span>
              <button
                type="button"
                onClick={() => send(buildErrorFixPrompt(runtimeErrors))}
                className="shrink-0 rounded-full bg-destructive px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90"
              >
                Automatisch beheben
              </button>
            </div>
          ) : null}
          {inspected ? (
            <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-[10px] border border-primary/40 bg-primary/10 px-2.5 py-1.5">
              <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-primary">
                <MousePointerClick className="h-3 w-3 shrink-0" />
                <span className="truncate">Ausgewählt: {elementLabel(inspected)}</span>
              </span>
              <button
                type="button"
                onClick={() => setInspected(null)}
                aria-label="Auswahl aufheben"
                className="shrink-0 rounded-full p-0.5 text-primary hover:bg-primary/20"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : null}
          <Composer
            input={input}
            setInput={setInput}
            streaming={streaming}
            onSend={send}
            onStop={stop}
            attachments={attachments}
            onAddFiles={addFiles}
            onRemoveAttachment={(i) =>
              setAttachments((prev) => prev.filter((_, idx) => idx !== i))
            }
            placeholder={
              inspected
                ? "Was soll an dem ausgewählten Element anders sein?"
                : "Was soll anders sein? z. B. „Mach die Buttons größer und ergänze eine Bestätigung.“"
            }
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
            <StageTab active={tab === "cms"} onClick={() => setTab("cms")}>
              Inhalte
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
            <PreviewFrame
              html={activeHtml}
              appName={published?.slug ?? "Mini-App"}
              appSlug={published?.slug ?? preset?.slug ?? null}
              wallet={wallet}
              onInspect={onInspect}
              onRuntimeError={onRuntimeError}
            />
          ) : tab === "canvas" ? (
            <CanvasView
              baseHtml={activeHtml}
              stream={stream}
              streaming={streaming}
              appName={published?.slug ?? "Mini-App"}
            />
          ) : tab === "cms" ? (
            <div className="min-h-0 flex-1 overflow-hidden rounded-[10px] border border-border bg-background">
              <CmsPanel
                appSlug={published?.slug ?? null}
                wallet={wallet ?? null}
                plannedKeys={cmsKeys}
              />
            </div>
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
          preset={preset}
          cmsSeed={cmsKeys}
          onPublished={(result, manifest) => {
            setPublished(result);
            if (manifest) setPreset(manifest); // enables one-click updates
            if (activeHtml) {
              setAutoImagesJob({ html: activeHtml, slug: result.slug, runId: Date.now() });
            }
          }}
        />
      ) : null}

      {autoImagesJob && wallet ? (
        <AutoStoreImages
          key={autoImagesJob.runId}
          html={autoImagesJob.html}
          slug={autoImagesJob.slug}
          wallet={wallet}
          force={autoImagesJob.force}
        />
      ) : null}
    </div>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  activeIdx,
  restorable,
  onRestore,
  onCmsBuild,
  appSlug,
  wallet,
}: {
  msg: ChatMsg;
  activeIdx: number;
  /** false when the version's HTML was trimmed from local storage. */
  restorable: boolean;
  onRestore: (i: number) => void;
  onCmsBuild: (withCms: boolean, keys: CmsKeyPlan[], userKeys: CmsUserKeyPlan[]) => void;
  /** Published app + wallet enable "In CMS übernehmen" on uploaded images. */
  appSlug?: string | null;
  wallet?: string | null;
}) {
  const [pickerUrl, setPickerUrl] = useState<string | null>(null);
  if (msg.cmsPlan) {
    return (
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <CmsSetupCard
            plan={msg.cmsPlan}
            resolved={msg.cmsResolved ?? null}
            onBuild={onCmsBuild}
          />
        </div>
      </div>
    );
  }
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] space-y-1.5">
          {msg.images && msg.images.length > 0 ? (
            <div className="flex justify-end gap-1.5">
              {msg.images.map((thumb, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={thumb}
                  alt={`Anhang ${i + 1}`}
                  className="h-14 w-14 rounded-[8px] border border-border object-cover"
                />
              ))}
            </div>
          ) : null}
          {msg.imageUrls && msg.imageUrls.length > 0 && appSlug && wallet ? (
            <div className="flex flex-wrap justify-end gap-1">
              {msg.imageUrls.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setPickerUrl((cur) => (cur === url ? null : url))}
                  className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {msg.imageUrls!.length > 1 ? `Bild ${i + 1} ` : "Bild "}→ In CMS übernehmen
                </button>
              ))}
            </div>
          ) : null}
          {pickerUrl && appSlug && wallet ? (
            <CmsImagePicker
              imageUrl={pickerUrl}
              appSlug={appSlug}
              wallet={wallet}
              onClose={() => setPickerUrl(null)}
            />
          ) : null}
          {msg.elementLabel ? (
            <p className="text-right font-mono text-[10px] text-muted-foreground">
              ↳ {msg.elementLabel}
            </p>
          ) : null}
          <p className="whitespace-pre-wrap rounded-[10px] bg-primary px-3 py-2 text-sm text-primary-foreground">
            {msg.content}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <Sparkles
        className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", msg.error ? "text-destructive" : "text-primary")}
      />
      <div className="min-w-0 space-y-1.5">
        {msg.brief ? (
          <details className="rounded-[8px] border border-border bg-card px-2 py-1">
            <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground">
              Bildanalyse der Vorlage
            </summary>
            <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap text-[11px] leading-snug text-muted-foreground">
              {msg.brief}
            </p>
          </details>
        ) : null}
        {msg.reasoning ? (
          <details className="rounded-[8px] border border-border bg-card px-2 py-1">
            <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground">
              Gedankengang der KI
            </summary>
            <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap text-[11px] italic leading-snug text-muted-foreground">
              {msg.reasoning}
            </p>
          </details>
        ) : null}
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
            disabled={msg.versionIndex === activeIdx || !restorable}
            title={restorable ? undefined : "Diese Version ist lokal nicht mehr gespeichert."}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px]",
              msg.versionIndex === activeIdx
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:bg-muted",
              !restorable && "opacity-50",
            )}
          >
            <History className="h-2.5 w-2.5" />
            Version {msg.versionIndex + 1}
            {msg.versionIndex === activeIdx
              ? " · aktiv"
              : restorable
                ? " · wiederherstellen"
                : " · nicht mehr gespeichert"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AttachmentTray({
  attachments,
  onRemove,
}: {
  attachments: PreparedImage[];
  onRemove: (i: number) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {attachments.map((a, i) => (
        <div key={`${a.name}-${i}`} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={a.thumb}
            alt={a.name}
            className="h-14 w-14 rounded-[8px] border border-border object-cover"
          />
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label={`${a.name} entfernen`}
            className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background hover:opacity-80"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function AttachButton({
  disabled,
  onAddFiles,
}: {
  disabled?: boolean;
  onAddFiles: (files: Iterable<File>) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onAddFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={disabled}
        title="Bilder anhängen: Mockup, Screenshot, Skizze oder Logo als Vorlage (max. 4)"
        aria-label="Bilder anhängen"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <ImagePlus className="h-4 w-4" />
      </button>
    </>
  );
}

/** Shared paste/drop plumbing: forward image files to onAddFiles. */
function useImageIntake(onAddFiles: (files: Iterable<File>) => void) {
  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length > 0) {
        e.preventDefault();
        onAddFiles(files);
      }
    },
    [onAddFiles],
  );
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length > 0) {
        e.preventDefault();
        onAddFiles(files);
      }
    },
    [onAddFiles],
  );
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (Array.from(e.dataTransfer?.items ?? []).some((i) => i.type.startsWith("image/"))) {
      e.preventDefault();
    }
  }, []);
  return { onPaste, onDrop, onDragOver };
}

function Composer({
  input,
  setInput,
  streaming,
  onSend,
  onStop,
  placeholder,
  autoFocus,
  attachments,
  onAddFiles,
  onRemoveAttachment,
}: {
  input: string;
  setInput: (v: string) => void;
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  placeholder: string;
  autoFocus?: boolean;
  attachments: PreparedImage[];
  onAddFiles: (files: Iterable<File>) => void;
  onRemoveAttachment: (i: number) => void;
}) {
  const intake = useImageIntake(onAddFiles);
  const canSend = input.trim().length >= 3 || attachments.length > 0;
  return (
    <div className="shrink-0 border-t border-border p-3">
      <div
        className="rounded-[10px] border border-border bg-card p-2 focus-within:border-primary"
        onDrop={intake.onDrop}
        onDragOver={intake.onDragOver}
      >
        <AttachmentTray attachments={attachments} onRemove={onRemoveAttachment} />
        <div className="flex items-end gap-2">
          <AttachButton disabled={streaming || attachments.length >= 4} onAddFiles={onAddFiles} />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!streaming) onSend(input);
              }
            }}
            onPaste={intake.onPaste}
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
            <Button size="sm" onClick={() => onSend(input)} disabled={!canSend} aria-label="Senden">
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
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
  attachments,
  onAddFiles,
  onRemoveAttachment,
  wallet,
  onOpenChat,
}: {
  input: string;
  setInput: (v: string) => void;
  complexity: Complexity;
  setComplexity: (v: Complexity) => void;
  onSend: (text: string) => void;
  attachments: PreparedImage[];
  onAddFiles: (files: Iterable<File>) => void;
  onRemoveAttachment: (i: number) => void;
  wallet: string | null;
  onOpenChat: (id: string) => void;
}) {
  const intake = useImageIntake(onAddFiles);
  const canSend = input.trim().length >= 3 || attachments.length > 0;
  return (
    <div className="relative flex h-dvh flex-col bg-background">
      {/* Bauplan backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 [background-size:24px_24px] [background-image:linear-gradient(to_right,rgba(0,73,139,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,73,139,0.05)_1px,transparent_1px)] dark:[background-image:linear-gradient(to_right,rgba(122,187,242,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(122,187,242,0.05)_1px,transparent_1px)]"
      />
      <header className="relative z-10 flex h-12 shrink-0 items-center justify-between px-3">
        <Link
          href="/dashboard/mini-apps"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Meine Apps
        </Link>
        {/* Chat history is reachable from the start screen too — not only
            inside a running session. */}
        <ChatSwitcher
          wallet={wallet}
          activeChatId={null}
          onOpenChat={onOpenChat}
          onNewChat={() => {}}
        />
      </header>
      <main className="relative z-10 flex min-h-0 flex-1 items-center justify-center p-4">
        <div className="w-full max-w-xl">
          <div className="mb-6 text-center">
            <Image
              src="/logo.png"
              alt="Röbel App"
              width={44}
              height={44}
              className="mx-auto mb-4 h-11 w-11 object-contain"
            />
            <h1 className="font-heading text-3xl font-bold text-foreground">
              Was baust du für Röbel?
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Beschreibe deine Idee — die KI baut eine Mini-App im Röbel-Design mit echtem SDK.
              Live testen, anpassen, zur Prüfung einreichen.
            </p>
          </div>

          <div
            className="rounded-[14px] border border-border bg-card p-3 shadow-sm"
            onDrop={intake.onDrop}
            onDragOver={intake.onDragOver}
          >
            <AttachmentTray attachments={attachments} onRemove={onRemoveAttachment} />
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend(input);
                }
              }}
              onPaste={intake.onPaste}
              placeholder="z. B. Eine Umfrage-App, in der Bürger:innen über die nächste Stadtfest-Location abstimmen… — oder häng ein Mockup/Foto als Vorlage an."
              rows={3}
              autoFocus
              className="w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <AttachButton disabled={attachments.length >= 4} onAddFiles={onAddFiles} />
                <ModelToggle value={complexity} onChange={setComplexity} />
              </div>
              <Button size="sm" onClick={() => onSend(input)} disabled={!canSend}>
                App bauen
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
