// Auto store images after publish: screenshot every app screen in a hidden
// iframe (netizen:capture bridge), then let the KIE image model (Seedream
// 4.5) fill whatever the store entry is missing — raster icon, 16:9 hero
// artwork and one 1:1 preview per screen (screenshot as image reference).
// Only missing images are generated (unless force); existing raster icons /
// previews are never overwritten in the normal run.
import type { MiniAppRow } from "@/lib/miniapp/types";
import { buildScreenDoc, parseScreens } from "./screens";

export interface AutoImageItem {
  key: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  detail?: string;
}

export type AutoImagesProgress = (items: AutoImageItem[]) => void;

const MAX_PREVIEWS = 5; // mirrors lib/miniapp/images/storage (server-only module)
const CAPTURE_SETTLE_MS = 1200;
const CAPTURE_TIMEOUT_MS = 12_000;
const POLL_MS = 2500;
const POLL_BUDGET_MS = 150_000;

class Cancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

async function apiJson(
  url: string,
  wallet: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "x-wallet-address": wallet,
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
  }
  return json;
}

/**
 * Render one document in a hidden sandboxed iframe and capture it via the
 * netizen:capture bridge every generated app ships. Resolves a PNG data URL.
 */
function captureDoc(container: HTMLElement, doc: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox",
    );
    iframe.style.cssText = "width:390px;height:780px;border:0;display:block;";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      iframe.remove();
      fn();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error("Screenshot-Zeitüberschreitung."))),
      CAPTURE_TIMEOUT_MS,
    );
    function onMsg(e: MessageEvent) {
      if (e.source !== iframe.contentWindow || !e.data) return;
      if (e.data.type === "netizen:capture:result" && typeof e.data.dataUrl === "string") {
        const dataUrl = e.data.dataUrl as string;
        finish(() => resolve(dataUrl));
      } else if (e.data.type === "netizen:capture:error") {
        finish(() =>
          reject(new Error(String(e.data.error ?? "Screenshot fehlgeschlagen."))),
        );
      }
    }
    window.addEventListener("message", onMsg);
    iframe.addEventListener("load", () => {
      // Kurze Beruhigungszeit: Fonts/Init-Skript der App laufen nach load an.
      setTimeout(() => {
        iframe.contentWindow?.postMessage({ type: "netizen:capture" }, "*");
      }, CAPTURE_SETTLE_MS);
    });
    iframe.srcdoc = doc;
    container.appendChild(iframe);
  });
}

async function uploadShot(
  slug: string,
  wallet: string,
  dataUrl: string,
  name: string,
): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const form = new FormData();
  form.set("appId", slug);
  form.set("kind", "shot");
  form.set("file", new File([blob], `${name}.png`, { type: "image/png" }));
  const res = await fetch("/api/mini-apps/images/upload", {
    method: "POST",
    headers: { "x-wallet-address": wallet },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.url !== "string") {
    throw new Error(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
  }
  return json.url;
}

/** Start one NB2 task and poll /status until the image is persisted. */
async function generateAndPersist(opts: {
  slug: string;
  wallet: string;
  kind: "icon" | "feature" | "preview";
  slot?: number;
  referenceUrl?: string;
  isCancelled: () => boolean;
}): Promise<void> {
  const started = await apiJson(`/api/mini-apps/images`, opts.wallet, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      appId: opts.slug,
      kind: opts.kind,
      slot: opts.slot,
      referenceUrl: opts.referenceUrl,
    }),
  });
  const taskId = started.taskId;
  if (typeof taskId !== "string") throw new Error("Generierung konnte nicht gestartet werden.");

  const deadline = Date.now() + POLL_BUDGET_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (opts.isCancelled()) throw new Cancelled();
    const params = new URLSearchParams({ taskId, appId: opts.slug, kind: opts.kind });
    if (opts.slot !== undefined) params.set("slot", String(opts.slot));
    const st = await apiJson(`/api/mini-apps/images/status?${params}`, opts.wallet);
    if (st.status === "done") return;
    if (st.status === "error") {
      throw new Error(
        typeof st.error === "string" ? st.error : "Generierung fehlgeschlagen.",
      );
    }
  }
  throw new Error("Zeitüberschreitung bei der Generierung.");
}

export interface AutoRunInput {
  html: string;
  slug: string;
  wallet: string;
  /** Offscreen (but rendered) element the capture iframes mount into. */
  container: HTMLElement;
  onProgress: AutoImagesProgress;
  isCancelled?: () => boolean;
  /** Regenerate everything: fresh captures, existing images are replaced. */
  force?: boolean;
}

/**
 * Fill the published app's missing store images. Icon + hero start
 * immediately; previews are captured screen by screen and their polls run
 * strictly sequentially (screenshots[] persistence is read-modify-write on
 * the server — parallel persists would race).
 */
export async function runAutoStoreImages(input: AutoRunInput): Promise<AutoImageItem[]> {
  const cancelled = input.isCancelled ?? (() => false);

  const detail = await apiJson(`/api/mini-apps/${input.slug}`, input.wallet);
  const app = detail.app as MiniAppRow | undefined;
  if (!app) throw new Error("App nicht gefunden.");

  const force = input.force ?? false;
  const needIcon = force || !app.icon_url || app.icon_url.startsWith("data:");
  const needFeature = force || !app.feature_image_url;
  // force: previews are rebuilt from slot 0 (overwriting); normally only the
  // empty slots after the existing ones get filled.
  const usedSlots = force ? 0 : (app.screenshots ?? []).length;
  const freeSlots = Math.max(0, MAX_PREVIEWS - usedSlots);

  const parsed = parseScreens(input.html);
  const screens = (
    parsed.length > 0
      ? parsed.map((s) => ({ name: s.name, title: s.title, doc: buildScreenDoc(input.html, s.name) }))
      : [{ name: "app", title: "App", doc: input.html }]
  ).slice(0, freeSlots);

  const items: AutoImageItem[] = [
    {
      key: "icon",
      label: "App-Icon",
      status: needIcon ? "pending" : "skipped",
      detail: needIcon ? undefined : "bereits vorhanden",
    },
    {
      key: "feature",
      label: "Store-Artwork",
      status: needFeature ? "pending" : "skipped",
      detail: needFeature ? undefined : "bereits vorhanden",
    },
    ...screens.map((s, i) => ({
      key: `preview-${i}`,
      label: `Vorschau: ${s.title}`,
      status: "pending" as const,
    })),
  ];
  if (freeSlots === 0) {
    for (const it of items) {
      if (it.key.startsWith("preview")) it.status = "skipped";
    }
  }

  const emit = () => input.onProgress(items.map((it) => ({ ...it })));
  const set = (key: string, status: AutoImageItem["status"], det?: string) => {
    const it = items.find((x) => x.key === key);
    if (!it) return;
    it.status = status;
    it.detail = det;
    emit();
  };
  emit();

  const runSlot = async (key: string, task: () => Promise<void>) => {
    set(key, "running");
    try {
      await task();
      set(key, "done");
    } catch (e) {
      if (e instanceof Cancelled) throw e;
      set(key, "error", e instanceof Error ? e.message : String(e));
    }
  };

  // Icon + Hero brauchen keine Referenz — sofort und parallel starten.
  const columnTasks: Promise<void>[] = [];
  if (needIcon) {
    columnTasks.push(
      runSlot("icon", () =>
        generateAndPersist({
          slug: input.slug,
          wallet: input.wallet,
          kind: "icon",
          isCancelled: cancelled,
        }),
      ),
    );
  }
  if (needFeature) {
    columnTasks.push(
      runSlot("feature", () =>
        generateAndPersist({
          slug: input.slug,
          wallet: input.wallet,
          kind: "feature",
          isCancelled: cancelled,
        }),
      ),
    );
  }

  // Previews: Screen für Screen aufnehmen, dann Slot für Slot generieren.
  const previews = (async () => {
    for (let i = 0; i < screens.length; i++) {
      if (cancelled()) throw new Cancelled();
      const key = `preview-${i}`;
      await runSlot(key, async () => {
        const dataUrl = await captureDoc(input.container, screens[i].doc);
        if (cancelled()) throw new Cancelled();
        const shotUrl = await uploadShot(
          input.slug,
          input.wallet,
          dataUrl,
          `auto-${screens[i].name}`,
        );
        await generateAndPersist({
          slug: input.slug,
          wallet: input.wallet,
          kind: "preview",
          slot: Math.min(usedSlots + i, MAX_PREVIEWS - 1),
          referenceUrl: shotUrl,
          isCancelled: cancelled,
        });
      });
    }
  })();

  try {
    await Promise.all([...columnTasks, previews]);
  } catch (e) {
    if (!(e instanceof Cancelled)) throw e;
  }
  return items.map((it) => ({ ...it }));
}
