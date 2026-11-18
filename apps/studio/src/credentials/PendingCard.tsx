// A prepared action waiting for the phone. Studio cannot sign: nothing here suggests the change is
// done before the Röbel App confirmed it. The status follows the server (watchActions), so a
// confirmation by another admin's phone shows up here too.
import { useEffect, useState } from 'react';
import { t, tx } from '../i18n';
import { cancelAction, fetchActions, isSessionError } from './api';
import { isOpenAction, statusLine, watchActions } from './poll';
import type { TabContext } from './tabs';
import type { ActionView } from './types';

export function PendingCard({
  ctx, actionId, title, action: given, onClose, onFinal,
}: {
  ctx: TabContext;
  actionId: string;
  title?: string;
  /** Already known (history list): no own polling. */
  action?: ActionView;
  onClose?: () => void;
  onFinal?: (a: ActionView) => void;
}) {
  const [own, setOwn] = useState<ActionView | null>(null);
  const [busy, setBusy] = useState(false);
  const { token, org, onError } = ctx;
  const action = given ?? own;
  const external = !!given;

  useEffect(() => {
    if (external) return;
    const ctrl = new AbortController();
    let reported = false;
    watchActions(
      () =>
        fetchActions(token, org.accountId).catch((e: unknown) => {
          // Only a lost session interrupts; a network hiccup is retried by the watch.
          if (isSessionError(e)) onError(e);
          throw e;
        }),
      (list) => {
        const a = list.find((x) => x.id === actionId) ?? null;
        setOwn(a);
        if (a && !isOpenAction(a) && !reported) {
          reported = true;
          onFinal?.(a);
        }
      },
      { signal: ctrl.signal },
    );
    return () => ctrl.abort();
    // onFinal is deliberately not a dependency: following it would restart the watch on every render.
  }, [external, token, org.accountId, actionId, onError]);

  const discard = async () => {
    setBusy(true);
    try {
      await cancelAction(token, actionId);
      setOwn((a) => (a ? { ...a, status: 'cancelled' } : a));
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const waiting = !action || action.status === 'awaiting_confirmation';
  return (
    <div className={`cr-card${action && !isOpenAction(action) ? '' : ' pending'}`} role="status" aria-live="polite">
      {waiting && <strong>{t('Bestätige jetzt in der Röbel App auf deinem Handy')}</strong>}
      <span>{action?.summary.title ?? title}</span>
      {action?.summary.lines.map((l, i) => (
        <span key={i} className="pz-meta">
          {l}
        </span>
      ))}
      <span className="cr-status" data-status={action?.status ?? 'awaiting_confirmation'}>
        {action ? statusLine(action) : t('Wartet auf Bestätigung')}
      </span>
      {waiting && <span className="pz-meta">{t('Wir haben dir eine Mitteilung geschickt. Erst nach deiner Bestätigung wird die Änderung eingetragen.')}</span>}
      <div className="cr-actions">
        {waiting && (
          <button className="w-btn" disabled={busy} onClick={() => void discard()}>
            {tx('cred', 'Verwerfen')}
          </button>
        )}
        {onClose && (
          <button className="w-btn ghost" onClick={onClose}>
            {t('Schließen')}
          </button>
        )}
      </div>
    </div>
  );
}
