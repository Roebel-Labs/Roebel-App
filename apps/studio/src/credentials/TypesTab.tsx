// Typen: the org's credential types; new types start from a template.
import { useCallback, useEffect, useState } from 'react';
import { t } from '../i18n';
import { SkCards } from '../ui/Skeleton';
import { fetchTypes } from './api';
import { PendingCard } from './PendingCard';
import { TypeEditor } from './TypeEditor';
import { KIND_LABELS, STUDIO_TEMPLATES, type TemplateId } from './templates';
import type { TabContext } from './tabs';
import type { TypeRow } from './types';

type View = { kind: 'list' } | { kind: 'pick' } | { kind: 'edit'; template?: TemplateId | 'eigener'; type?: TypeRow };

export function TypesTab({ ctx }: { ctx: TabContext }) {
  const [types, setTypes] = useState<TypeRow[] | null>(null);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [pending, setPending] = useState<{ id: string; title: string } | null>(null);
  const { token, org, onError } = ctx;

  const load = useCallback(() => {
    fetchTypes(token, org.accountId).then(setTypes, onError);
  }, [token, org.accountId, onError]);
  useEffect(load, [load]);

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

  return (
    <div>
      <div className="pz-toolbar">
        <p className="pz-lead" style={{ margin: 0, flex: 1 }}>
          {t('Ausweise für Mitglieder, Ämter und Abzeichen deiner Organisation.')}
        </p>
        <button className="w-btn green" onClick={() => setView({ kind: 'pick' })}>
          {t('Neuer Ausweis-Typ')}
        </button>
      </div>
      {pending && <PendingCard ctx={ctx} actionId={pending.id} title={pending.title} onClose={() => (setPending(null), load())} />}
      {!types && <SkCards cards={3} height={64} />}
      {types && types.length === 0 && <div className="pz-state w-muted">{t('Noch kein Ausweis-Typ. Beginne mit einer Vorlage.')}</div>}
      {types && types.length > 0 && (
        <div>
          {types.map((x) => (
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
    </div>
  );
}
