"use client";

// Server sync for editor chats: mirrors the localStorage session (trimmed) to
// /api/mini-apps/chats so chats survive devices/reloads, power the dashboard
// "Letzter KI-Chat" card and can be shared via invite link. localStorage stays
// the fast, full-fidelity cache; the server copy keeps only the last 2 version
// HTMLs. Fire-and-forget: sync failures never disturb the builder.
import type { StoredSession } from "./sessionStore";

export interface ChatMeta {
  id: string;
  created_at?: string;
  updated_at: string;
  title: string | null;
  app_slug: string | null;
  preview: string | null;
  shared: boolean;
  share_token: string | null;
}

export interface RemoteChat {
  id: string;
  title: string | null;
  app_slug: string | null;
  updated_at: string;
  session: StoredSession;
  shared: boolean;
  share_token: string | null;
}

const KEEP_VERSION_HTMLS = 2;
const PUSH_DEBOUNCE_MS = 2_500;

function headers(wallet: string): HeadersInit {
  return { "content-type": "application/json", "x-wallet-address": wallet };
}

/** Server copy keeps all messages but only the newest version HTMLs. */
export function trimForServer(session: StoredSession): StoredSession {
  const cut = session.versions.length - KEEP_VERSION_HTMLS;
  return {
    ...session,
    versions: session.versions.map((v, i) => (i < cut ? { ...v, html: null } : v)),
    pendingJob: null,
  };
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
let queued: { session: StoredSession; wallet: string; chatId: string | null } | null = null;

/**
 * Debounced push. Resolves the server-confirmed chat id via `onChatId` so the
 * caller can persist it into the local session. `replaced` is true when the
 * previous chat row no longer existed (deleted elsewhere) and a fresh one was
 * created — the caller must adopt the new id unconditionally.
 */
export function schedulePush(
  session: StoredSession,
  wallet: string,
  chatId: string | null,
  onChatId: (id: string, replaced: boolean) => void,
): void {
  queued = { session, wallet, chatId };
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void flush(onChatId);
  }, PUSH_DEBOUNCE_MS);
}

async function flush(onChatId: (id: string, replaced: boolean) => void): Promise<void> {
  if (pushing || !queued) return;
  const job = queued;
  queued = null;
  pushing = true;
  try {
    const post = (id: string | null) =>
      fetch("/api/mini-apps/chats", {
        method: "POST",
        headers: headers(job.wallet),
        body: JSON.stringify({
          id,
          session: trimForServer(job.session),
          appSlug: job.session.published?.slug ?? null,
        }),
      });
    let replaced = false;
    let res = await post(job.chatId);
    if (!res.ok && job.chatId) {
      // Chat row deleted elsewhere (switcher on another tab)? Re-create it —
      // otherwise this session's sync would fail silently forever.
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      if (body?.code === "not_found") {
        replaced = true;
        res = await post(null);
      }
    }
    if (res.ok) {
      const data = (await res.json()) as { chat?: ChatMeta };
      if (data.chat?.id) onChatId(data.chat.id, replaced);
    }
  } catch {
    /* offline/flaky — next save retries */
  } finally {
    pushing = false;
    if (queued) void flush(onChatId);
  }
}

/** null = request failed (distinguish from a genuinely empty history). */
export async function listChats(wallet: string, limit = 30): Promise<ChatMeta[] | null> {
  try {
    const res = await fetch(`/api/mini-apps/chats?limit=${limit}`, {
      headers: { "x-wallet-address": wallet },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { chats?: ChatMeta[] };
    return data.chats ?? [];
  } catch {
    return null;
  }
}

export async function fetchChat(
  id: string,
  wallet: string,
  invite?: string | null,
): Promise<RemoteChat | null> {
  const qs = invite ? `?invite=${encodeURIComponent(invite)}` : "";
  const res = await fetch(`/api/mini-apps/chats/${id}${qs}`, {
    headers: { "x-wallet-address": wallet },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { chat?: RemoteChat };
  return data.chat ?? null;
}

export async function requestInvite(id: string, wallet: string): Promise<string | null> {
  const res = await fetch(`/api/mini-apps/chats/${id}`, {
    method: "POST",
    headers: headers(wallet),
    body: JSON.stringify({ action: "invite" }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { shareToken?: string };
  return data.shareToken ?? null;
}

export async function deleteChat(id: string, wallet: string): Promise<boolean> {
  const res = await fetch(`/api/mini-apps/chats?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "x-wallet-address": wallet },
  });
  return res.ok;
}
