// Einstellungen: the org switch "Mitglieder dürfen öffentlich sichtbar sein" and the accounts that may
// issue a type (for example a door scanner). People are shown by display name, never by address.
import { useCallback, useEffect, useState } from 'react';
import { t } from '../i18n';
import { Toggle } from '../persona/common';
import { SkCards } from '../ui/Skeleton';
import { fetchTypes, prepareDelegate, prepareMembersPublic, searchPeople } from './api';
import { PendingCard } from './PendingCard';
import type { TabContext } from './tabs';
import type { PersonHit, TypeRow } from './types';

export function SettingsTab({ ctx }: { ctx: TabContext }) {
  const { token, org, onError } = ctx;
  const [types, setTypes] = useState<TypeRow[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [typeId, setTypeId] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PersonHit[]>([]);

  const load = useCallback(() => {
    fetchTypes(token, org.accountId).then((all) => {
      const usable = all.filter((x) => !x.retired && x.chainStatus === 'onchain');
      setTypes(usable);
      setTypeId((cur) => cur || usable[0]?.typeId || '');
    }, onError);
  }, [token, org.accountId, onError]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!adding || query.trim().length < 2) return setHits([]);
    const timer = setTimeout(() => {
      searchPeople(token, org.accountId, query.trim()).then(setHits, onError);
    }, 250);
    return () => clearTimeout(timer);
  }, [adding, query, token, org.accountId, onError]);

  const run = async (fn: () => Promise<{ actionId: string }>) => {
    setBusy(true);
    try {
      setPending((await fn()).actionId);
      setAdding(false);
      setQuery('');
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const delegates = (types ?? []).flatMap((x) =>
    (x.delegates ?? []).map((d) => ({ typeId: x.typeId, typeName: x.name, delegate: d.delegate, who: d.displayName || d.label || t('Unbekanntes Konto') })),
  );

  return (
    <div>
      {pending && (
        <PendingCard
          ctx={ctx}
          actionId={pending}
          onClose={() => (setPending(null), load())}
          onFinal={() => {
            ctx.reloadOrgs();
            load();
          }}
        />
      )}
      <section className="cr-card">
        <div className="cr-actions">
          <Toggle
            checked={org.membersMayBePublic}
            disabled={busy}
            label={t('Mitglieder dürfen öffentlich sichtbar sein')}
            onChange={(next) => void run(() => prepareMembersPublic(token, org.accountId, next))}
          />
          <strong>{t('Mitglieder dürfen öffentlich sichtbar sein')}</strong>
        </div>
        <span className="pz-meta">{t('Aus: Mitgliedschaften können nur privat gehalten werden. Ämter bleiben immer öffentlich.')}</span>
      </section>

      <h2 className="pz-h3 pz-sec">{t('Berechtigte Konten')}</h2>
      <p className="pz-lead">{t('Diese Konten dürfen einen Ausweis-Typ in eurem Namen ausstellen, zum Beispiel ein Türscanner bei einer Veranstaltung.')}</p>
      {!types && <SkCards cards={2} height={48} />}
      {types && delegates.length === 0 && <div className="pz-state w-muted">{t('Noch kein Konto berechtigt.')}</div>}
      {delegates.map((d) => (
        <div key={`${d.typeId}:${d.delegate}`} className="cr-row">
          <div className="cr-row-main">
            <strong className="w-ellipsis">{d.who}</strong>
            <span className="pz-meta">{d.typeName}</span>
          </div>
          <button className="w-btn" disabled={busy} onClick={() => void run(() => prepareDelegate(token, { accountId: org.accountId, typeId: d.typeId, delegate: d.delegate, allowed: false }))}>
            {t('Entziehen')}
          </button>
        </div>
      ))}

      {types && types.length > 0 && !adding && (
        <div className="cr-actions" style={{ marginTop: 16 }}>
          <button className="w-btn" onClick={() => setAdding(true)}>
            {t('Türscanner-Konto berechtigen')}
          </button>
        </div>
      )}
      {adding && types && (
        <div className="cr-form" style={{ marginTop: 16 }}>
          <label>
            {t('Ausweis-Typ')}
            <select className="pz-select" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {types.map((x) => (
                <option key={x.typeId} value={x.typeId}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Mitglied suchen')}
            <input value={query} placeholder={t('Name')} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {hits.map((h) => (
            <div key={h.wallet} className="cr-row">
              {h.avatarUrl ? <img className="cr-thumb" src={h.avatarUrl} alt="" /> : <span className="cr-thumb" />}
              <div className="cr-row-main">
                <strong className="w-ellipsis">{h.displayName}</strong>
              </div>
              <button
                className="w-btn green"
                disabled={busy || !typeId}
                onClick={() => void run(() => prepareDelegate(token, { accountId: org.accountId, typeId, delegate: h.wallet, allowed: true, label: h.displayName }))}
              >
                {t('Berechtigen')}
              </button>
            </div>
          ))}
          <div className="cr-actions">
            <button className="w-btn ghost" onClick={() => (setAdding(false), setQuery(''))}>
              {t('Abbrechen')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
