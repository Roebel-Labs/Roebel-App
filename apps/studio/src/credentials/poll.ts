// Follows prepared actions while the phone confirms them: every 5 s while something waits for the
// phone or for the chain, every 60 s when everything is final. Reports a list only when a status
// changed, so a confirmation by another admin's phone shows up once.
import { t, tx } from '../i18n';
import type { ActionStatus, ActionView } from './types';

const OPEN: readonly ActionStatus[] = ['awaiting_confirmation', 'submitted'];
const SLOW_MS = 60_000;

export const isOpenAction = (a: Pick<ActionView, 'status'>) => OPEN.includes(a.status);

export function watchActions(
  fetchOnce: () => Promise<ActionView[]>,
  onChange: (a: ActionView[]) => void,
  opts: { intervalMs?: number; signal?: AbortSignal } = {},
): void {
  const fast = opts.intervalMs ?? 5_000;
  let last: string | null = null;
  let anyOpen = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async () => {
    if (opts.signal?.aborted) return;
    try {
      const list = await fetchOnce();
      if (opts.signal?.aborted) return;
      const key = JSON.stringify(list.map((a) => [a.id, a.status]));
      anyOpen = list.some(isOpenAction);
      if (key !== last) {
        last = key;
        onChange(list);
      }
    } catch {
      /* offline or a server hiccup: try again at the same pace */
    }
    if (!opts.signal?.aborted) timer = setTimeout(() => void tick(), anyOpen ? fast : SLOW_MS);
  };

  opts.signal?.addEventListener('abort', () => {
    if (timer) clearTimeout(timer);
  });
  timer = setTimeout(() => void tick(), 0);
}

/** Live status of an action for the pending card and the history (German source text). */
export function statusLine(a: Pick<ActionView, 'status' | 'error'>): string {
  switch (a.status) {
    case 'awaiting_confirmation':
      return t('Wartet auf Bestätigung');
    case 'submitted':
      return t('Wird eingetragen');
    case 'done':
      return t('Erledigt');
    case 'failed':
      return a.error ? t('Fehlgeschlagen: {reason}', { reason: a.error }) : t('Fehlgeschlagen');
    case 'expired':
      return t('Abgelaufen');
    case 'cancelled':
      return tx('cred', 'Verworfen');
  }
}
