// A prepared action waiting for the phone. Studio cannot sign: nothing here suggests the change is
// done before the Röbel App confirmed it.
import { useState } from 'react';
import { t, tx } from '../i18n';
import { cancelAction } from './api';
import type { TabContext } from './tabs';

export function PendingCard({ ctx, actionId, title, onClose }: { ctx: TabContext; actionId: string; title?: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const discard = async () => {
    setBusy(true);
    try {
      await cancelAction(ctx.token, actionId);
      onClose();
    } catch (e) {
      ctx.onError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cr-card pending" role="status">
      <strong>{t('Bestätige jetzt in der Röbel App auf deinem Handy')}</strong>
      {title && <span>{title}</span>}
      <span className="pz-meta">{t('Wir haben dir eine Mitteilung geschickt. Erst nach deiner Bestätigung wird die Änderung eingetragen.')}</span>
      <div className="cr-actions">
        <button className="w-btn" disabled={busy} onClick={() => void discard()}>
          {tx('cred', 'Verwerfen')}
        </button>
        <button className="w-btn ghost" onClick={onClose}>
          {t('Schließen')}
        </button>
      </div>
    </div>
  );
}
