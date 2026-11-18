// Ausstellungen: actions waiting for the phone (they live on the server, so they are still listed
// after pairing again) and the history of issuances with letters and revocation.
import { useEffect, useRef, useState } from 'react';
import { t, tx, locale } from '../i18n';
import { Confirm } from '../persona/common';
import { SkCards } from '../ui/Skeleton';
import { downloadLetters, fetchActions, isSessionError, prepareRevocation } from './api';
import { PendingCard } from './PendingCard';
import { isOpenAction, standalonePending, statusLine, watchActions } from './poll';
import { saveBlob } from './save-file';
import type { TabContext } from './tabs';
import type { ActionView, BatchView } from './types';

const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function BatchesTab({ ctx }: { ctx: TabContext }) {
  const { token, org, onError } = ctx;
  const [actions, setActions] = useState<ActionView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [revoke, setRevoke] = useState<BatchView | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    const ctrl = new AbortController();
    watchActions(
      () =>
        fetchActions(token, org.accountId).catch((e: unknown) => {
          // The first load reports any error; later background polls only a lost session.
          if (isSessionError(e) || !loaded.current) onError(e);
          throw e;
        }),
      (list) => {
        loaded.current = true;
        setActions([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      },
      { signal: ctrl.signal },
    );
    return () => ctrl.abort();
  }, [token, org.accountId, onError]);

  const letters = async (b: BatchView) => {
    setBusy(true);
    try {
      saveBlob(await downloadLetters(token, org.accountId, b.id), `ausweise-${isoDay()}.pdf`);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const doRevoke = async () => {
    if (!revoke) return;
    setBusy(true);
    try {
      const r = await prepareRevocation(token, { accountId: org.accountId, batchId: revoke.id });
      setPending(r.actionId);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
      setRevoke(null);
    }
  };

  if (!actions) return <SkCards cards={3} height={72} />;
  const open = actions.filter(isOpenAction);
  const history = actions.filter((a) => !isOpenAction(a));

  return (
    <div>
      {standalonePending(pending, actions) && pending && <PendingCard ctx={ctx} actionId={pending} onClose={() => setPending(null)} />}
      {open.length > 0 && (
        <>
          <h2 className="pz-h3">{t('Wartet auf Bestätigung')}</h2>
          <div className="cr-stack">
            {open.map((a) => (
              <PendingCard key={a.id} ctx={ctx} actionId={a.id} action={a} />
            ))}
          </div>
        </>
      )}
      <h2 className="pz-h3">{tx('cred', 'Verlauf')}</h2>
      {history.length === 0 && <div className="pz-state w-muted">{t('Noch keine Ausstellung.')}</div>}
      {history.map((a) => (
        <div key={a.id} className="cr-row">
          <div className="cr-row-main">
            <strong className="w-ellipsis">{a.summary.title}</strong>
            <span className="pz-meta">
              {new Date(a.createdAt).toLocaleDateString(locale())} · {statusLine(a)}
            </span>
            {(a.batches ?? []).map((b) => (
              <span key={b.id} className="pz-meta">
                {b.status === 'revoked'
                  ? t('Widerrufen: {n} Ausweise', { n: b.count })
                  : t('{i} eingeladen · {c} angenommen · {r} widerrufen', { i: b.invited, c: b.accepted, r: b.revoked })}
              </span>
            ))}
          </div>
          {(a.batches ?? []).map((b) => (
            <div key={b.id} className="cr-actions">
              {b.hasOpenLinks && (
                <button className="w-btn" disabled={busy} onClick={() => void letters(b)}>
                  {t('Briefe herunterladen (PDF)')}
                </button>
              )}
              {b.status === 'onchain' && (
                <button className="w-btn ghost" disabled={busy} onClick={() => setRevoke(b)}>
                  {t('Ganze Ausstellung widerrufen')}
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
      {revoke && (
        <Confirm
          title={t('Ganze Ausstellung widerrufen')}
          body={t('Alle {n} Ausweise dieser Ausstellung verlieren nach deiner Bestätigung auf dem Handy ihre Gültigkeit.', { n: revoke.count })}
          confirmLabel={t('Widerrufen')}
          busy={busy}
          onConfirm={() => void doRevoke()}
          onCancel={() => setRevoke(null)}
        />
      )}
    </div>
  );
}
