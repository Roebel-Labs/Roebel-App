// Builder session persistence (localStorage). A session = the full editor
// state: chat history, generated versions, publish preset. Saved per app slug
// once published/re-opened, plus one "draft" slot for not-yet-published work —
// so reloading the page or re-opening an app restores the whole conversation.
//
// localStorage has a ~5MB budget and every version carries the complete HTML
// document, so saves trim oldest version HTMLs first (their chat bubbles stay,
// the restore pill just deactivates).

import type { ManifestDraft } from "@/lib/miniapp/ai/manifest";

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  versionIndex?: number;
  error?: boolean;
  /** Attachment thumbnails (~160px JPEG data URLs) — display only; the
   * full-size images go to the API once and are not persisted. */
  images?: string[];
  /** Public storage URLs of the uploaded attachments (published apps only) —
   * enables "In CMS übernehmen" and lets the model reference real URLs. */
  imageUrls?: string[];
  /** Label of the preview element this edit targeted ("Bearbeiten" mode). */
  elementLabel?: string;
  /** Model reasoning ("Stark" mode), trimmed — collapsible in the bubble. */
  reasoning?: string;
  /** GLM-4.6V image-analysis brief for this turn's attachments. */
  brief?: string;
  /** Mini-CMS pre-flight plan (setup card rendered in the chat). */
  cmsPlan?: import("./cms").CmsPlan;
  /** Decision on the card: built with CMS, without, or still open (undefined). */
  cmsResolved?: "cms" | "plain";
}

export interface Version {
  /** null when trimmed out of storage to fit the quota — bubble stays, restore deactivates. */
  html: string | null;
  notes: string;
}

export interface PublishedInfo {
  slug: string;
  homeUrl: string;
  version?: string;
  republished?: boolean;
}

export interface StoredSession {
  messages: ChatMsg[];
  versions: Version[];
  activeIdx: number;
  preset: ManifestDraft | null;
  published: PublishedInfo | null;
  /** Server-side generation job still running when the session was saved —
   * the editor resumes it after sleep/reload (generate/status polling). */
  pendingJob?: { id: string; startedAt: number } | null;
  /** Confirmed Mini-CMS keys — seeded as initial content after a fresh publish. */
  cmsKeys?: import("./cms").CmsKeyPlan[] | null;
  /** Server-side chat row (mini_app_editor_chats) this session syncs into. */
  chatId?: string | null;
  savedAt: number;
}

const PREFIX = "netizen-builder";
export const DRAFT_KEY = `${PREFIX}:draft`;

export function appSessionKey(slug: string): string {
  return `${PREFIX}:app:${slug}`;
}

export function loadSession(key: string): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    if (!Array.isArray(s.messages) || !Array.isArray(s.versions)) return null;
    // Never point at a trimmed (html-less) version.
    if (s.activeIdx >= 0 && !s.versions[s.activeIdx]?.html) {
      s.activeIdx = s.versions.reduce((acc, v, i) => (v.html ? i : acc), -1);
    }
    return s;
  } catch {
    return null;
  }
}

/** Null out the oldest version HTMLs until at most `keep` full versions remain. */
function trimmed(session: StoredSession, keep: number): StoredSession {
  const withHtml = session.versions.map((v, i) => (v.html ? i : -1)).filter((i) => i >= 0);
  const drop = new Set(withHtml.slice(0, Math.max(0, withHtml.length - keep)));
  return {
    ...session,
    versions: session.versions.map((v, i) => (drop.has(i) ? { ...v, html: null } : v)),
  };
}

export function saveSession(key: string, session: StoredSession): void {
  try {
    for (const keep of [10, 5, 2]) {
      const candidate = trimmed(session, keep);
      const raw = JSON.stringify(candidate);
      if (raw.length > 3_800_000) continue; // stay clear of the ~5MB quota
      try {
        window.localStorage.setItem(key, raw);
        return;
      } catch {
        // QuotaExceeded — try the next, harder trim level.
      }
    }
  } catch {
    /* storage unavailable (private mode) — session simply isn't persisted */
  }
}

export function clearSession(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
