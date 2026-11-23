// "Daten": what people entered in an app's shared collections (bookings, check-ins, sign-ups),
// including the private details only the app owner may see. Owner path = the Studio session.
import { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n';
import type { MyMiniApp } from '../workspace/api';
import { IconTrash, IconUpload } from '../ui/shell/line-icons';
import { fetchCollections, fetchOwnerRows, removeOwnerRow, rowTable, toCsv, type CollectionInfo, type OwnerRow } from './builder-api';

export function AppData({ token, app, onBack }: { token: string; app: MyMiniApp; onBack: () => void }) {
  const [collections, setCollections] = useState<CollectionInfo[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [rows, setRows] = useState<OwnerRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchCollections(token, app.id)
      .then((c) => {
        if (!alive) return;
        const shared = c.filter((x) => x.scope === 'shared').sort((a, b) => b.rows - a.rows);
        setCollections(shared);
        setActive((cur) => cur ?? shared[0]?.collection ?? null);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [token, app.id, reload]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    setRows(null);
    fetchOwnerRows(token, app.id, active)
      .then((r) => {
        if (!alive) return;
        setRows(r.rows);
        setTotal(r.total);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [token, app.id, active, reload]);

  const table = useMemo(() => rowTable(rows ?? []), [rows]);

  async function remove(id: string) {
    if (!active || !window.confirm(t('Diesen Eintrag löschen? Bei einer Buchung wird der Termin wieder frei.'))) return;
    try {
      await removeOwnerRow(token, app.id, active, id);
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function exportCsv() {
    if (!active) return;
    const blob = new Blob([toCsv(table.columns, table.cells)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${app.slug}-${active}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="apps-detail">
      <div className="apps-detail-head">
        <button className="w-icon" onClick={onBack} aria-label={t('Zurück')}>
          ←
        </button>
        <strong className="w-ellipsis">{app.name}</strong>
        <span className="w-muted">{t('Daten')}</span>
        <span className="ws-tools-spacer" />
        {rows && rows.length > 0 && (
          <button className="w-btn" onClick={exportCsv}>
            <IconUpload size={14} /> {t('Als CSV exportieren')}
          </button>
        )}
      </div>
      {error && <div className="ws-error">{error}</div>}
      {!collections && !error && <div className="w-muted">{t('Wird geladen …')}</div>}
      {collections && collections.length === 0 && (
        <div className="apps-empty">
          <strong>{t('Noch keine Daten')}</strong>
          <span className="w-muted">{t('Sobald jemand in der App bucht, sich anmeldet oder eincheckt, erscheint es hier.')}</span>
        </div>
      )}
      {collections && collections.length > 0 && (
        <>
          <div className="tpl-groups">
            {collections.map((c) => (
              <button key={c.collection} className={`w-pill${c.collection === active ? ' on' : ''}`} onClick={() => setActive(c.collection)}>
                {c.collection} <span className="tpl-count">{c.rows}</span>
              </button>
            ))}
          </div>
          <p className="w-muted data-note">{t('Spalten mit „(privat)“ sehen nur die Person selbst und du.')}</p>
          {!rows ? (
            <div className="w-muted">{t('Wird geladen …')}</div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {table.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                    <th aria-label={t('Aktionen')} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id}>
                      {table.cells[i].map((v, j) => (
                        <td key={j}>{v}</td>
                      ))}
                      <td>
                        <button className="w-round" aria-label={t('Löschen')} onClick={() => void remove(r.id)}>
                          <IconTrash size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {total > rows.length && <p className="w-muted">{t('Die neuesten {n} von {total} Einträgen.', { n: rows.length, total })}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
