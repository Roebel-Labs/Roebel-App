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

export function toAlert(m: ChatMessage): SupportAlert {
  const cents = m.amount_cents ?? 0;
  return {
    id: m.id,
    name: (m.display_name ?? '').trim() || 'Jemand',
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
