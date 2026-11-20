// Starting points for a new card: the package's templates drawn live, plus an empty card.
import { useEffect, useState } from 'react';
import { TEMPLATES, type CardDesign, type CardTemplate } from '@roebel/card-design';
import { t } from '../../i18n';
import { loadSkia, snapshotUrl } from './skia';
import './designer.css';

export const EMPTY_TEMPLATE: CardTemplate = {
  id: 'leer',
  label: 'Leere Karte',
  format: 'card',
  design: { schema: 1, format: 'card', background: { kind: 'preset', preset: 'paper' }, shine: { enabled: false, intensity: 0.6 }, layers: [] } satisfies CardDesign,
};

/** Template names are package data; their English names live here. */
export function templateLabel(id: string, fallback: string): string {
  switch (id) {
    case 'gast':
      return t('Gast');
    case 'buerger':
      return t('Bürger');
    case 'bescheiniger':
      return t('Bescheiniger');
    case 'schwarz':
      return t('Schwarz');
    case 'papier':
      return t('Papier');
    case 'matt':
      return t('Matt');
    case 'glas':
      return t('Glas');
    case 'holo-stempel':
      return t('Holografischer Stempel');
    case 'leer':
      return t('Leere Karte');
    default:
      return fallback;
  }
}

/** Still images of the templates, rendered once per session. */
const thumbs = new Map<string, Promise<string>>();
function thumb(tpl: CardTemplate): Promise<string> {
  let p = thumbs.get(tpl.id);
  if (!p) {
    p = loadSkia().then((s) => snapshotUrl(s, tpl.design, 400));
    thumbs.set(tpl.id, p);
    p.catch(() => thumbs.delete(tpl.id));
  }
  return p;
}

function Tile({ tpl, onPick }: { tpl: CardTemplate; onPick: (tpl: CardTemplate) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    thumb(tpl).then(
      (u) => alive && setSrc(u),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [tpl]);
  return (
    <button className="dz-tile" onClick={() => onPick(tpl)}>
      <span className={`dz-tile-art${tpl.format === 'stamp' ? ' stamp' : ''}`}>{src ? <img src={src} alt="" draggable={false} /> : tpl.id === 'leer' ? null : <span className="dz-tile-wait" />}</span>
      <span className="dz-tile-label">{templateLabel(tpl.id, tpl.label)}</span>
    </button>
  );
}

export function TemplatePicker({ onPick, onCancel }: { onPick: (tpl: CardTemplate) => void; onCancel?: () => void }) {
  return (
    <div className="dz-picker">
      <div className="pz-toolbar">
        <h2 style={{ flex: 1 }}>{t('Vorlage wählen')}</h2>
        {onCancel && (
          <button className="w-btn ghost" onClick={onCancel}>
            {t('Abbrechen')}
          </button>
        )}
      </div>
      <p className="pz-lead">{t('Jede Vorlage lässt sich danach frei verändern: Text, Farben, Bilder und Glanz.')}</p>
      <div className="dz-tiles">
        {[...TEMPLATES, EMPTY_TEMPLATE].map((tpl) => (
          <Tile key={tpl.id} tpl={tpl} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}
