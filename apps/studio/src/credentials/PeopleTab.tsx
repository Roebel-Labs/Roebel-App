// Personen: import a list (or take all current members), preview it on the server, issue one batch,
// and below the people of the chosen type with revocation.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { t, tx, locale } from '../i18n';
import { Confirm } from '../persona/common';
import { SkCards } from '../ui/Skeleton';
import { fetchPeople, fetchTypes, prepareBatch, prepareRevocation, previewPeople } from './api';
import { ImportDrop } from './ImportDrop';
import { PendingCard } from './PendingCard';
import type { TabContext } from './tabs';
import type { PeopleInput, PersonRow, PersonState, PreviewResult, TypeRow } from './types';

const STATES: PersonState[] = ['eingeladen', 'angenommen', 'abgelehnt', 'widerrufen', 'abgelaufen'];
/** German state labels, translated where shown. */
const STATE_LABELS: Record<PersonState, string> = {
  eingeladen: 'Eingeladen',
  angenommen: 'Angenommen',
  abgelehnt: 'Abgelehnt',
  widerrufen: 'Widerrufen',
  abgelaufen: 'Abgelaufen',
};

export function PeopleTab({ ctx }: { ctx: TabContext }) {
  const { token, org, onError } = ctx;
  const [types, setTypes] = useState<TypeRow[] | null>(null);
  const [typeId, setTypeId] = useState<string>('');
  const [csv, setCsv] = useState('');
  const [fromMembers, setFromMembers] = useState(false);
  const [validUntil, setValidUntil] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; title: string } | null>(null);
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [filter, setFilter] = useState<PersonState | ''>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  useEffect(() => {
    fetchTypes(token, org.accountId).then((all) => {
      const usable = all.filter((x) => !x.retired);
      setTypes(usable);
      setTypeId((cur) => cur || usable[0]?.typeId || '');
    }, onError);
  }, [token, org.accountId, onError]);

  const loadPeople = useCallback(() => {
    if (!typeId) return;
    setPeople(null);
    setSelected(new Set());
    fetchPeople(token, org.accountId, typeId).then(setPeople, onError);
  }, [token, org.accountId, typeId, onError]);
  useEffect(loadPeople, [loadPeople]);

  // Any change to the input makes an earlier preview stale.
  useEffect(() => setPreview(null), [typeId, csv, fromMembers, validUntil]);

  const input = (): PeopleInput => {
    const p: PeopleInput = { accountId: org.accountId, typeId };
    if (fromMembers) p.fromMemberList = true;
    else p.csv = csv;
    if (validUntil) p.validUntil = validUntil;
    return p;
  };
  const hasInput = !!typeId && (fromMembers || csv.trim().length > 0);
  const count = preview ? preview.app + preview.link : 0;

  const runPreview = async () => {
    setBusy(true);
    setNotice(null);
    try {
      setPreview(await previewPeople(token, input()));
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const issue = async () => {
    setBusy(true);
    try {
      const r = await prepareBatch(token, input());
      const name = types?.find((x) => x.typeId === typeId)?.name ?? '';
      const n = r.counts.app + r.counts.link;
      setPending({ id: r.actionId, title: n === 1 ? t('1 Ausweis ausstellen: {name}', { name }) : t('{n} Ausweise ausstellen: {name}', { n, name }) });
      setPreview(null);
      setCsv('');
      setFromMembers(false);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      const r = await prepareRevocation(token, { accountId: org.accountId, invitationIds: [...selected] });
      setPending({ id: r.actionId, title: t('{n} Ausweise widerrufen', { n: selected.size }) });
      setSelected(new Set());
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
      setConfirmRevoke(false);
    }
  };

  const shown = useMemo(() => (people ?? []).filter((p) => !filter || p.state === filter), [people, filter]);
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (types && types.length === 0) return <div className="pz-state w-muted">{t('Lege zuerst unter Typen einen Ausweis-Typ an.')}</div>;
  if (!types) return <SkCards cards={2} height={120} />;

  return (
    <div>
      {pending && <PendingCard ctx={ctx} actionId={pending.id} title={pending.title} onClose={() => (setPending(null), loadPeople())} />}
      <div className="cr-form">
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
        <label className="cr-check">
          <input type="checkbox" checked={fromMembers} onChange={(e) => setFromMembers(e.target.checked)} />
          {t('Alle aktuellen Mitglieder')}
        </label>
        {!fromMembers && (
          <>
            <ImportDrop onText={(text) => setCsv(text)} onError={setNotice} />
            <label>
              {t('Oder Liste einfügen')}
              <textarea value={csv} placeholder={t('Name;E-Mail – eine Person je Zeile')} onChange={(e) => setCsv(e.target.value)} />
            </label>
          </>
        )}
        <label>
          {t('Gültig bis (optional)')}
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </label>
        {notice && <div className="ws-error">{notice}</div>}
        {preview && (
          <div className="cr-card">
            <strong>
              {t('{n} Personen: {app} bekommen eine Nachricht in der App, {link} einen persönlichen Link oder Brief.', { n: count, app: preview.app, link: preview.link })}
            </strong>
            {preview.skipped > 0 && <span className="pz-meta">{t('{n} haben schon einen gültigen Ausweis.', { n: preview.skipped })}</span>}
            {preview.rejected.length > 0 && (
              <>
                <span>{t('{n} Zeilen übersprungen:', { n: preview.rejected.length })}</span>
                <ul className="cr-rejected">
                  {preview.rejected.map((r) => (
                    <li key={r.row}>{t('Zeile {row}: {reason}', { row: r.row, reason: r.reason })}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <div className="cr-actions">
          <button className={`w-btn${preview ? '' : ' green'}`} disabled={busy || !hasInput} onClick={() => void runPreview()}>
            {t('Vorschau')}
          </button>
          {preview && (
            <button className="w-btn green" disabled={busy || count === 0} onClick={() => void issue()}>
              {count === 1 ? t('1 Ausweis ausstellen') : t('{n} Ausweise ausstellen', { n: count })}
            </button>
          )}
        </div>
      </div>

      <h2 className="pz-h3 pz-sec">{t('Personen mit diesem Ausweis')}</h2>
      <div className="pz-toolbar">
        <select className="pz-select" aria-label={t('Status')} value={filter} onChange={(e) => setFilter(e.target.value as PersonState | '')}>
          <option value="">{t('Alle')}</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {tx('credstate', STATE_LABELS[s])}
            </option>
          ))}
        </select>
        <span className="ws-tools-spacer" />
        <button className="w-btn" disabled={busy || selected.size === 0} onClick={() => setConfirmRevoke(true)}>
          {t('Widerrufen')}
        </button>
      </div>
      {!people && <SkCards cards={2} height={48} />}
      {people && shown.length === 0 && <div className="pz-state w-muted">{t('Niemand in dieser Ansicht.')}</div>}
      {shown.map((p) => (
        <label key={p.id} className="cr-row">
          <input type="checkbox" disabled={p.state === 'widerrufen'} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
          <div className="cr-row-main">
            <strong className="w-ellipsis">{p.displayName}</strong>
            <span className="pz-meta">
              {tx('credstate', STATE_LABELS[p.state])}
              {p.public ? ` · ${t('öffentlich')}` : ''}
              {p.validUntil ? ` · ${t('gültig bis {date}', { date: new Date(p.validUntil).toLocaleDateString(locale()) })}` : ''}
              {p.hasLink ? ` · ${t('Link oder Brief')}` : ''}
            </span>
          </div>
        </label>
      ))}
      {confirmRevoke && (
        <Confirm
          title={t('Widerrufen')}
          body={t('{n} Ausweise verlieren nach deiner Bestätigung auf dem Handy ihre Gültigkeit.', { n: selected.size })}
          confirmLabel={t('Widerrufen')}
          busy={busy}
          onConfirm={() => void revoke()}
          onCancel={() => setConfirmRevoke(false)}
        />
      )}
    </div>
  );
}
