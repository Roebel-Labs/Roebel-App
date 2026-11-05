// Unterstützen alerts: a de-duplicating queue of kind='support' chat rows plus the running total.

import type { ChatMessage } from './types';

export type SupportAlert = { id: string; name: string; amount: string; amountCents: number; message: string; createdAt: string };

export function formatEuro(cents: number): string {
  const c = Math.max(0, Math.round(cents));
  const euros = Math.floor(c / 100);
  const rest = c % 100;
  const whole = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return rest === 0 ? `${whole} €` : `${whole},${String(rest).padStart(2, '0')} €`;
}

/** Display name for screen and overlay: never a raw wallet address, never empty. */
export function displayName(raw: string | null | undefined, fallback = 'Jemand'): string {
  const n = (raw ?? '').trim();
  if (!n || /^0x[0-9a-f]{6,}/i.test(n) || /0x[0-9a-f]{40}/i.test(n)) return fallback;
  return n;
}

/** Hosts avatar images may come from: the app's Supabase storage and roebel.app itself. */
const AVATAR_HOSTS = [/^wwbeqhkslxdxhktqzqti\.supabase\.co$/i, /^(?:[a-z0-9-]+\.)*roebel\.app$/i];

/** Avatar URLs come from app users: only https images from the app's own hosts are loaded into the program. */
export function safeAvatarUrl(raw: string | null | undefined): string {
  const u = (raw ?? '').trim();
  if (!/^https:\/\/\S+$/i.test(u)) return '';
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
    return AVATAR_HOSTS.some((h) => h.test(url.hostname)) ? u : '';
  } catch {
    return '';
  }
}

export function toAlert(m: ChatMessage): SupportAlert {
  const cents = m.amount_cents ?? 0;
  return {
    id: m.id,
    name: displayName(m.display_name),
    amount: formatEuro(cents),
    amountCents: cents,
    message: (m.body ?? '').trim(),
    createdAt: m.created_at,
  };
}

export class AlertQueue {
  private seen = new Set<string>();
  private queue: SupportAlert[] = [];
  private totalCents = 0;
  private count = 0;

  /** Counts existing supports (e.g. the initial load) without alerting them. */
  seed(messages: ChatMessage[]): void {
    for (const m of messages) this.track(m);
  }

  /** Queues a new support; false for non-support rows and for ids already seen. */
  push(m: ChatMessage): boolean {
    if (!this.track(m)) return false;
    this.queue.push(toAlert(m));
    return true;
  }

  private track(m: ChatMessage): boolean {
    if (m.kind !== 'support' || this.seen.has(m.id)) return false;
    this.seen.add(m.id);
    this.totalCents += m.amount_cents ?? 0;
    this.count += 1;
    return true;
  }

  shift(): SupportAlert | undefined {
    return this.queue.shift();
  }

  remove(id: string): void {
    this.queue = this.queue.filter((a) => a.id !== id);
  }

  pending(): SupportAlert[] {
    return [...this.queue];
  }

  get total(): { cents: number; count: number } {
    return { cents: this.totalCents, count: this.count };
  }

  reset(): void {
    this.seen.clear();
    this.queue = [];
    this.totalCents = 0;
    this.count = 0;
  }
}
