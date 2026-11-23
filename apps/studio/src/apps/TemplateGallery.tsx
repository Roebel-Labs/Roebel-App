// "Vorlagen": finished mini apps to start from and adapt in the builder.
import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { SkCards } from '../ui/Skeleton';
import { fetchTemplates, type TemplateCard, type TemplateGroup } from './builder-api';

export function TemplateGallery({ onPick }: { onPick: (id: string) => void }) {
  const [templates, setTemplates] = useState<TemplateCard[] | null>(null);
  const [groups, setGroups] = useState<TemplateGroup[]>([]);
  const [group, setGroup] = useState('alle');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchTemplates()
      .then((r) => {
        if (!alive) return;
        setTemplates(r.templates);
        setGroups(r.groups);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <div className="ws-error">{error}</div>;
  if (!templates) return <SkCards cards={3} height={240} className="apps-grid" />;

  const used = groups.filter((g) => templates.some((x) => x.group === g.id));
  const q = query.trim().toLowerCase();
  const visible = templates.filter(
    (x) => (group === 'alle' || x.group === group) && (!q || `${x.title} ${x.summary}`.toLowerCase().includes(q)),
  );

  return (
    <div className="tpl">
      <input className="tpl-search" type="search" value={query} placeholder={t('Vorlagen suchen')} onChange={(e) => setQuery(e.target.value)} />
      <div className="tpl-groups">
        {[{ id: 'alle', label: t('Alle') }, ...used].map((g) => (
          <button key={g.id} className={`w-pill${g.id === group ? ' on' : ''}`} onClick={() => setGroup(g.id)}>
            {g.label}
            {g.id !== 'alle' && <span className="tpl-count">{templates.filter((x) => x.group === g.id).length}</span>}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <div className="w-muted">{t('Keine Vorlage passt zu deiner Suche.')}</div>
      ) : (
        <div className="apps-grid">
          {visible.map((x) => (
            <button key={x.id} className="tpl-card" onClick={() => onPick(x.id)}>
              {/* As an <img>, a server-provided SVG can never run script in the renderer. */}
              <img className="tpl-thumb" alt="" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(x.thumbnailSvg)}`} />
              {x.recommended && <span className="tpl-badge">{t('Empfohlen')}</span>}
              <div className="tpl-text">
                <strong>{x.title}</strong>
                <span>{x.summary}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
