// Veranstaltungen: one badge per event for its attendees, repeatable for latecomers, optionally
// issued at once by the Röbel server while the event runs.
import { useCallback, useEffect, useState } from 'react';
import { t } from '../i18n';
import { Toggle } from '../persona/common';
import { SkCards } from '../ui/Skeleton';
import { fetchEventBadges, prepareEventBadge, setEventBadgeAuto } from './api';
import { eventRows } from './events-view';
import { PendingCard } from './PendingCard';
import type { TabContext } from './tabs';
import type { EventBadgeListItem } from './types';

export function EventsTab({ ctx }: { ctx: TabContext }) {
  const { token, org, onError } = ctx;
  const [items, setItems] = useState<EventBadgeListItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchEventBadges(token, org.accountId).then(setItems, onError);
  }, [token, org.accountId, onError]);
  useEffect(load, [load]);

  const run = async (eventId: string, fn: () => Promise<{ actionId: string }>) => {
    setBusy(eventId);
    try {
      setPending((await fn()).actionId);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(null);
    }
  };

  if (!items) return <SkCards cards={3} height={72} />;
  const byId = new Map(items.map((e) => [e.eventId, e]));
  const rows = eventRows(items, Date.now());

  return (
    <div>
      {pending && <PendingCard ctx={ctx} actionId={pending} onClose={() => (setPending(null), load())} onFinal={load} />}
      {rows.length === 0 && <div className="pz-state w-muted">{t('Noch keine Veranstaltung deiner Organisation.')}</div>}
      {rows.map((r) => {
        const e = byId.get(r.eventId)!;
        return (
          <div key={r.eventId} className="cr-row">
            <div className="cr-row-main">
              <strong className="w-ellipsis">{r.title}</strong>
              <span className="pz-meta">
                {r.when} · {r.line}
              </span>
              {e.badge && (
                <div className="cr-actions">
                  <Toggle
                    checked={e.badge.auto}
                    disabled={busy === r.eventId || e.badge.chain !== 'onchain'}
                    label={t('Sofort vergeben, während die Veranstaltung läuft')}
                    onChange={(next) => void run(r.eventId, () => setEventBadgeAuto(token, r.eventId, next))}
                  />
                  <span className="pz-meta">{t('Sofort vergeben, während die Veranstaltung läuft')}</span>
                </div>
              )}
            </div>
            <button className="w-btn" disabled={r.primary.disabled || busy === r.eventId} onClick={() => void run(r.eventId, () => prepareEventBadge(token, r.eventId))}>
              {r.primary.label}
            </button>
          </div>
        );
      })}
      {items.some((e) => e.badge) && (
        <p className="pz-meta" style={{ marginTop: 16 }}>
          {t('Dafür darf der Röbel-Server dieses Abzeichen in eurem Namen ausstellen, sonst nichts. Ihr könnt das jederzeit beenden.')}
        </p>
      )}
    </div>
  );
}
