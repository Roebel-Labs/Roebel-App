// Einstellungen: the org switch "Mitglieder dürfen öffentlich sichtbar sein" and the accounts that may
// issue a type (for example a door scanner). People are shown by display name, never by address.
import { useCallback, useEffect, useState } from 'react';
import { t } from '../i18n';
import { Toggle } from '../persona/common';
import { SkCards } from '../ui/Skeleton';
import { fetchDelegates, fetchTypes, prepareDelegate, prepareMembersPublic } from './api';
import { PendingCard } from './PendingCard';
import type { TabContext } from './tabs';
import type { DelegatesData, TypeRow } from './types';

export function SettingsTab({ ctx }: { ctx: TabContext }) {
  const { token, org, onError } = ctx;
  const [types, setTypes] = useState<TypeRow[] | null>(null);
  const [data, setData] = useState<DelegatesData | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [typeId, setTypeId] = useState('');
  const [member, setMember] = useState('');

  const load = useCallback(() => {
    fetchTypes(token, org.accountId).then((all) => {
      const usable = all.filter((x) => !x.retired && x.chainStatus === 'onchain');
      setTypes(usable);
      setTypeId((cur) => cur || usable[0]?.typeId || '');
    }, onError);
    fetchDelegates(token, org.accountId).then(setData, onError);
  }, [token, org.accountId, onError]);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<{ actionId: string }>) => {
    setBusy(true);
    try {
      setPending((await fn()).actionId);
      setAdding(false);
      setMember('');
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const delegates = (data?.delegates ?? []).map((d) => ({ ...d, who: d.displayName || d.label || t('Unbekanntes Konto') }));
  const memberName = data?.members.find((m) => m.wallet === member)?.displayName;

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
      {!data && <SkCards cards={2} height={48} />}
      {data && delegates.length === 0 && <div className="pz-state w-muted">{t('Noch kein Konto berechtigt.')}</div>}
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
            {t('Mitglied')}
            <select className="pz-select" value={member} onChange={(e) => setMember(e.target.value)}>
              <option value="">{t('Mitglied wählen')}</option>
              {(data?.members ?? []).map((m) => (
                <option key={m.wallet} value={m.wallet}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </label>
          <div className="cr-actions">
            <button
              className="w-btn green"
              disabled={busy || !typeId || !member}
              onClick={() => void run(() => prepareDelegate(token, { accountId: org.accountId, typeId, delegate: member, allowed: true, label: memberName }))}
            >
              {t('Berechtigen')}
            </button>
            <button className="w-btn ghost" onClick={() => (setAdding(false), setMember(''))}>
              {t('Abbrechen')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
