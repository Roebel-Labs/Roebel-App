// Typen: the org's credential types and card design drafts. With the designer on, new types start in
// the card designer from a template; the old form stays for types without a design (and retiring).
import { useCallback, useEffect, useState } from 'react';
import { t } from '../i18n';
import { Confirm, MoreMenu } from '../persona/common';
import { SkCards } from '../ui/Skeleton';
import { deleteDraft, fetchDrafts, fetchTypes } from './api';
import { Designer } from './designer/Designer';
import { PendingCard } from './PendingCard';
import { TypeEditor } from './TypeEditor';
import { KIND_LABELS, STUDIO_TEMPLATES, type TemplateId } from './templates';
import type { TabContext } from './tabs';
import type { DraftView, TypeRow } from './types';

type View =
  | { kind: 'list' }
  | { kind: 'pick' }
  | { kind: 'edit'; template?: TemplateId | 'eigener'; type?: TypeRow }
  | { kind: 'design'; draftId?: string };

/** State badges of a draft: never claims "published" before the phone confirmed it. */
export function draftTags(d: DraftView): string[] {
  const tags: string[] = [];
  if (d.liveVersion === null) tags.push(t('Entwurf'));
  else if (d.hasUnpublishedChanges) tags.push(t('Änderungen nicht veröffentlicht'));
  if (d.pendingVersion !== null) tags.push(t('Wartet auf Bestätigung'));
  return tags;
}

export function TypesTab({ ctx }: { ctx: TabContext }) {
  const [types, setTypes] = useState<TypeRow[] | null>(null);
  const [drafts, setDrafts] = useState<DraftView[] | null>(null);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [pending, setPending] = useState<{ id: string; title: string } | null>(null);
  const [removing, setRemoving] = useState<DraftView | null>(null);
  const [busy, setBusy] = useState(false);
  const { token, org, onError, register, designer } = ctx;

  const load = useCallback(() => {
    if (register) fetchTypes(token, org.accountId).then(setTypes, onError);
    else setTypes([]);
    if (designer) fetchDrafts(token, org.accountId).then(setDrafts, onError);
    else setDrafts([]);
  }, [token, org.accountId, onError, register, designer]);
  useEffect(load, [load]);

  if (view.kind === 'design') return <Designer key={view.draftId ?? 'new'} ctx={ctx} draftId={view.draftId} onClose={() => (setView({ kind: 'list' }), load())} />;

  if (view.kind === 'pick')
    return (
      <div>
        <h2 className="pz-h3">{t('Vorlage wählen')}</h2>
        <div className="cr-templates">
          {STUDIO_TEMPLATES.map((x) => (
            <button key={x.id} className="cr-template" onClick={() => setView({ kind: 'edit', template: x.id })}>
              <strong>{t(x.label)}</strong>
              <span className="pz-meta">{t(KIND_LABELS[x.kind])}</span>
              <span className="pz-meta">{t(x.description)}</span>
            </button>
          ))}
          <button className="cr-template" onClick={() => setView({ kind: 'edit', template: 'eigener' })}>
            <strong>{t('Eigener')}</strong>
            <span className="pz-meta">{t('Ohne Vorlage beginnen.')}</span>
          </button>
        </div>
        <div className="cr-actions" style={{ marginTop: 16 }}>
          <button className="w-btn ghost" onClick={() => setView({ kind: 'list' })}>
            {t('Abbrechen')}
          </button>
        </div>
      </div>
    );

  if (view.kind === 'edit')
    return (
      <TypeEditor
        ctx={ctx}
        type={view.type}
        template={view.template}
        onCancel={() => setView({ kind: 'list' })}
        onPrepared={(id, title) => {
          setPending({ id, title });
          setView({ kind: 'list' });
          load();
        }}
      />
    );

  const remove = async (d: DraftView) => {
    setBusy(true);
    try {
      await deleteDraft(token, d.id);
      setRemoving(null);
      load();
    } catch (e) {
      setRemoving(null);
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const designedTypes = new Set((drafts ?? []).map((d) => d.typeId).filter(Boolean));
  const plainTypes = (types ?? []).filter((x) => !designedTypes.has(x.typeId));
  const typeOf = (d: DraftView) => (types ?? []).find((x) => x.typeId === d.typeId);
  const loading = !types || !drafts;
  const empty = !loading && plainTypes.length === 0 && drafts!.length === 0;

  return (
    <div>
      <div className="pz-toolbar">
        <p className="pz-lead" style={{ margin: 0, flex: 1 }}>
          {t('Ausweise für Mitglieder, Ämter und Abzeichen deiner Organisation.')}
        </p>
        <button className="w-btn green" onClick={() => setView(designer ? { kind: 'design' } : { kind: 'pick' })}>
          {designer ? t('Neuer Ausweis') : t('Neuer Ausweis-Typ')}
        </button>
      </div>
      {pending && <PendingCard ctx={ctx} actionId={pending.id} title={pending.title} onClose={() => (setPending(null), load())} />}
      {loading && <SkCards cards={3} height={64} />}
      {empty && <div className="pz-state w-muted">{t('Noch kein Ausweis-Typ. Beginne mit einer Vorlage.')}</div>}
      {!loading && !empty && (
        <div>
          {drafts!.map((d) => {
            const type = typeOf(d);
            return (
              <div key={d.id} className="cr-row">
                <span className="cr-thumb" />
                <div className="cr-row-main">
                  <strong className="w-ellipsis">{d.name || t('Ohne Namen')}</strong>
                  <span className="pz-meta">
                    {t(KIND_LABELS[d.kind])}
                    {type?.counts ? ` · ${t('{a} angenommen · {o} offen', { a: type.counts.accepted, o: type.counts.open })}` : ''}
                  </span>
                </div>
                {draftTags(d).map((x) => (
                  <span key={x} className="cr-tag">
                    {x}
                  </span>
                ))}
                {type?.recognised && <span className="cr-tag accent">{t('Anerkannt')}</span>}
                <button className="w-btn" onClick={() => setView({ kind: 'design', draftId: d.id })}>
                  {t('Gestalten')}
                </button>
                {d.liveVersion === null && d.pendingVersion === null && <MoreMenu items={[{ label: t('Entwurf löschen'), danger: true, onSelect: () => setRemoving(d) }]} />}
              </div>
            );
          })}
          {plainTypes.map((x) => (
            <div key={x.typeId} className="cr-row">
              {x.imageUrl ? <img className="cr-thumb" src={x.imageUrl} alt="" /> : <span className="cr-thumb" />}
              <div className="cr-row-main">
                <strong className="w-ellipsis">{x.name}</strong>
                <span className="pz-meta">
                  {x.kind ? t(KIND_LABELS[x.kind]) : ''}
                  {x.counts ? ` · ${t('{a} angenommen · {o} offen', { a: x.counts.accepted, o: x.counts.open })}` : ''}
                </span>
              </div>
              {x.recognised && <span className="cr-tag accent">{t('Anerkannt')}</span>}
              {x.chainStatus === 'draft' && <span className="cr-tag">{t('Noch nicht bestätigt')}</span>}
              {x.retired && <span className="cr-tag">{t('Stillgelegt')}</span>}
              {!x.retired && (
                <button className="w-btn" onClick={() => setView({ kind: 'edit', type: x })}>
                  {t('Bearbeiten')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {removing && (
        <Confirm
          title={t('Entwurf löschen?')}
          body={t('„{name}“ wird gelöscht. Das kann nicht rückgängig gemacht werden.', { name: removing.name || t('Ohne Namen') })}
          confirmLabel={t('Löschen')}
          busy={busy}
          onConfirm={() => void remove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
