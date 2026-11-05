// Shapes of the live_* tables (migration 20261105_live_room.sql) as the web reads them
// through the anon key. See docs/superpowers/specs/2026-11-05-live-room-design.md.

export type LiveShowStatus = "scheduled" | "live" | "ended";
export type LiveItemStatus = "upcoming" | "on_stage" | "done";
export type LiveMessageKind = "chat" | "support" | "system";

export interface LiveOverlay {
  lower_third: boolean;
  next_up: boolean;
  bug: boolean;
  qr: boolean;
  poll: boolean;
  alerts: boolean;
  reactions: boolean;
  featured_message_id: string | null;
  message: string | null;
  /** Set by set_status → live (running time on the player). */
  live_since?: string | null;
  /** "Auf dem Fernseher ansehen" fallback (set_flags youtube_url). */
  youtube_url?: string | null;
}

export const DEFAULT_OVERLAY: LiveOverlay = {
  lower_third: false,
  next_up: false,
  bug: false,
  qr: false,
  poll: false,
  alerts: false,
  reactions: false,
  featured_message_id: null,
  message: null,
};

/** Fill missing keys so a partially-populated jsonb never crashes a renderer. */
export function normalizeOverlay(raw: unknown): LiveOverlay {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<LiveOverlay>;
  return {
    lower_third: !!o.lower_third,
    next_up: !!o.next_up,
    bug: !!o.bug,
    qr: !!o.qr,
    poll: !!o.poll,
    alerts: !!o.alerts,
    reactions: !!o.reactions,
    featured_message_id: typeof o.featured_message_id === "string" ? o.featured_message_id : null,
    message: typeof o.message === "string" && o.message.trim() ? o.message : null,
    live_since: typeof o.live_since === "string" ? o.live_since : null,
    youtube_url: typeof o.youtube_url === "string" && o.youtube_url ? o.youtube_url : null,
  };
}

export interface LiveShow {
  id: string;
  slug: string;
  event_id: string | null;
  title: string;
  subtitle: string | null;
  status: LiveShowStatus;
  hls_url: string | null;
  replay_url: string | null;
  poster_url: string | null;
  starts_at: string | null;
  cf_live_input_id: string | null;
  beneficiary_account_id: string | null;
  current_item_id: string | null;
  chat_enabled: boolean;
  slow_mode_seconds: number;
  voting_open: boolean;
  overlay: LiveOverlay;
  updated_at: string;
}

export interface LiveRundownItem {
  id: string;
  show_id: string;
  position: number;
  title: string;
  subtitle: string | null;
  detail: string | null;
  org_account_id: string | null;
  image_url: string | null;
  planned_at: string | null;
  status: LiveItemStatus;
  on_stage_at: string | null;
}

export interface LiveChatMessage {
  id: string;
  show_id: string;
  display_name: string | null;
  avatar_url: string | null;
  body: string;
  kind: LiveMessageKind;
  amount_cents: number | null;
  created_at: string;
  hidden_at: string | null;
  featured_at: string | null;
}

/** Anon has no grant on live_chat_messages.wallet — always select these explicit columns. */
export const CHAT_COLUMNS =
  "id, show_id, display_name, avatar_url, body, kind, amount_cents, created_at, hidden_at, featured_at";

export interface LiveResultItem {
  item_id: string;
  title: string;
  subtitle?: string | null;
  votes: number;
}

/** GET /api/live/<slug>/results → { ok, data: { voting_open, total, items } } */
export async function fetchLiveResults(slug: string): Promise<LiveResultItem[] | null> {
  try {
    const res = await fetch(`/api/live/${encodeURIComponent(slug)}/results`, { cache: "no-store" });
    const json = (await res.json()) as { ok?: boolean; data?: { items?: LiveResultItem[] }; items?: LiveResultItem[] };
    if (json.ok === false) return null;
    return json.data?.items ?? json.items ?? null;
  } catch {
    return null;
  }
}

export type LiveReactionEmoji = "❤️" | "🔥" | "👏" | "💃" | "🎉";
export const LIVE_REACTIONS: LiveReactionEmoji[] = ["❤️", "🔥", "👏", "💃", "🎉"];

export function normalizeShow(row: Record<string, unknown>): LiveShow {
  const r = row as unknown as LiveShow;
  return {
    ...r,
    chat_enabled: r.chat_enabled ?? true,
    slow_mode_seconds: r.slow_mode_seconds ?? 0,
    voting_open: r.voting_open ?? false,
    overlay: normalizeOverlay((row as { overlay?: unknown }).overlay),
  };
}

export function sortItems(items: LiveRundownItem[]): LiveRundownItem[] {
  return [...items].sort((a, b) => a.position - b.position);
}

/** On-stage item: the show's pointer first, any row flagged on_stage as fallback. */
export function currentItem(show: LiveShow | null, items: LiveRundownItem[]): LiveRundownItem | null {
  if (!show) return null;
  return (
    (show.current_item_id && items.find((i) => i.id === show.current_item_id)) ||
    items.find((i) => i.status === "on_stage") ||
    null
  );
}

/** Next upcoming item after the on-stage one (by position). */
export function nextItem(show: LiveShow | null, items: LiveRundownItem[]): LiveRundownItem | null {
  const sorted = sortItems(items);
  const cur = currentItem(show, sorted);
  const upcoming = sorted.filter((i) => i.status === "upcoming" && i.id !== cur?.id);
  if (cur) return upcoming.find((i) => i.position > cur.position) ?? upcoming[0] ?? null;
  return upcoming[0] ?? null;
}

export function formatEuro(cents: number | null | undefined): string {
  const v = (cents ?? 0) / 100;
  return v.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export const PUBLIC_LIVE_BASE = "https://www.roebel.app/live";
