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
 * Debounced push. Resolves the (possibly new) chat id via `onChatId` so the
 * caller can persist it into the local session.
 */
export function schedulePush(
  session: StoredSession,
  wallet: string,
  chatId: string | null,
  onChatId: (id: string) => void,
): void {
  queued = { session, wallet, chatId };
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void flush(onChatId);
  }, PUSH_DEBOUNCE_MS);
}

async function flush(onChatId: (id: string) => void): Promise<void> {
  if (pushing || !queued) return;
  const job = queued;
  queued = null;
  pushing = true;
  try {
    const res = await fetch("/api/mini-apps/chats", {
      method: "POST",
      headers: headers(job.wallet),
      body: JSON.stringify({
        id: job.chatId,
        session: trimForServer(job.session),
        appSlug: job.session.published?.slug ?? null,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { chat?: ChatMeta };
      if (data.chat?.id) onChatId(data.chat.id);
    }
  } catch {
    /* offline/flaky — next save retries */
  } finally {
    pushing = false;
    if (queued) void flush(onChatId);
  }
}

export async function listChats(wallet: string, limit = 30): Promise<ChatMeta[]> {
  const res = await fetch(`/api/mini-apps/chats?limit=${limit}`, {
    headers: { "x-wallet-address": wallet },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { chats?: ChatMeta[] };
  return data.chats ?? [];
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
