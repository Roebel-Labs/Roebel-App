// Right column: settings of the selected element, and the list of all elements (top first).
import { forwardRef, type ReactNode } from 'react';
import { FONT_IDS, FONT_LABELS, LOGO_SLOT_ASSET, moveLayer, removeLayer, updateLayer, type CardDesign, type FieldId, type Layer, type LayerPatch } from '@roebel/card-design';
import { t } from '../../i18n';
import type { Apply } from './AddPanel';
import { normaliseAngle } from './geometry';
import type { HintKind } from './hints';

export function fieldLabel(f: FieldId): string {
  return f === 'holderName' ? t('Vor- und Nachname') : f === 'validUntil' ? t('Gültig bis') : t('Mitglied seit');
}

export function layerLabel(l: Layer): string {
  if (l.type === 'text') return l.text.trim() || t('Text');
  if (l.type === 'field') return fieldLabel(l.field);
  if (l.assetId === LOGO_SLOT_ASSET) return t('Platz für das Logo');
  return l.role === 'logo' ? t('Logo') : l.role === 'sticker' ? t('Sticker') : t('Bild');
}

export function hintText(k: HintKind): string {
  return k === 'contrast' ? t('Text schwer lesbar') : k === 'blurry' ? t('Logo unscharf') : t('Teil liegt außerhalb der Karte');
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="dz-row">
      <span>{label}</span>
      {children}
    </label>
  );
}

const num = (v: string, min: number, max: number, fallback: number) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

export const PropsPanel = forwardRef<HTMLTextAreaElement, {
  design: CardDesign;
  selected: string | null;
  hints: Map<string, HintKind[]>;
  apply: Apply;
  onSelect: (id: string | null) => void;
  onReplaceImage: (layerId: string) => void;
}>(function PropsPanel({ design, selected, hints, apply, onSelect, onReplaceImage }, textRef) {
  const l = design.layers.find((x) => x.id === selected) ?? null;
  const set = (patch: LayerPatch, key?: string) => l && apply((d) => updateLayer(d, l.id, patch), { key: key ? `${l.id}-${key}` : undefined });

  return (
    <div className="dz-panel">
      {!l && <p className="dz-note">{t('Wähle ein Element auf der Karte aus, um es zu ändern.')}</p>}
      {l && (
        <section className="dz-group">
          <h3>{layerLabel(l)}</h3>
          {(hints.get(l.id) ?? []).map((k) => (
            <p key={k} className="dz-hint">
              {hintText(k)}
            </p>
          ))}
          {l.type === 'text' && (
            <textarea ref={textRef} className="dz-text" rows={2} maxLength={120} value={l.text} aria-label={t('Text')} onChange={(e) => set({ text: e.target.value }, 'text')} />
          )}
          {l.type === 'field' && (
            <>
              <p className="dz-note">{t('Auf dem Ausweis steht hier der Wert der Person. Der Beispieltext ist nur für die Vorschau.')}</p>
              <Row label={t('Beispieltext')}>
                <input maxLength={120} value={l.sampleText} onChange={(e) => set({ sampleText: e.target.value }, 'sample')} />
              </Row>
            </>
          )}
          {l.type !== 'image' && (
            <>
              <Row label={t('Schrift')}>
                <select value={l.font} onChange={(e) => set({ font: e.target.value as typeof l.font })}>
                  {FONT_IDS.map((f) => (
                    <option key={f} value={f}>
                      {FONT_LABELS[f]}
                    </option>
                  ))}
                </select>
              </Row>
              <Row label={t('Größe')}>
                <input type="number" min={6} max={200} value={l.size} onChange={(e) => set({ size: num(e.target.value, 6, 200, l.size) }, 'size')} />
              </Row>
              <Row label={t('Farbe')}>
                <input type="color" value={l.color.slice(0, 7)} onChange={(e) => set({ color: e.target.value }, 'color')} />
              </Row>
              <div className="dz-row">
                <span>{t('Ausrichtung')}</span>
                <div className="dz-seg small">
                  {(['left', 'center', 'right'] as const).map((a) => (
                    <button key={a} aria-pressed={l.align === a} onClick={() => set({ align: a })}>
                      {a === 'left' ? t('Links') : a === 'center' ? t('Mitte') : t('Rechts')}
                    </button>
                  ))}
                </div>
              </div>
              <Row label={t('Großbuchstaben')}>
                <input type="checkbox" checked={l.uppercase} onChange={(e) => set({ uppercase: e.target.checked })} />
              </Row>
              <Row label={t('Zeichenabstand')}>
                <input type="range" min={-0.1} max={0.5} step={0.01} value={l.letterSpacing} onChange={(e) => set({ letterSpacing: Number(e.target.value) }, 'spacing')} />
              </Row>
            </>
          )}
          {l.type === 'image' && (
            <button className="w-btn" onClick={() => onReplaceImage(l.id)}>
              {l.assetId === LOGO_SLOT_ASSET ? t('Logo hochladen') : t('Bild ersetzen')}
            </button>
          )}
          <Row label={t('Deckkraft')}>
            <input type="range" min={0} max={1} step={0.05} value={l.opacity} onChange={(e) => set({ opacity: Number(e.target.value) }, 'opacity')} />
          </Row>
          <Row label={t('Drehung')}>
            <input type="number" min={-180} max={180} value={l.rotation} onChange={(e) => set({ rotation: normaliseAngle(num(e.target.value, -360, 360, l.rotation)) }, 'rotation')} />
          </Row>
          <Row label={t('Glanz')}>
            <input type="checkbox" checked={l.shine} onChange={(e) => set({ shine: e.target.checked })} />
          </Row>
          <div className="dz-buttons">
            <button className="w-btn" title={t('Nach vorne')} onClick={() => apply((d) => moveLayer(d, l.id, 'up'))}>
              {t('Nach vorne')}
            </button>
            <button className="w-btn" title={t('Nach hinten')} onClick={() => apply((d) => moveLayer(d, l.id, 'down'))}>
              {t('Nach hinten')}
            </button>
            <button className="w-btn" onClick={() => apply((d) => moveLayer(d, l.id, 'top'))}>
              {t('Ganz nach vorne')}
            </button>
            <button className="w-btn" onClick={() => apply((d) => moveLayer(d, l.id, 'bottom'))}>
              {t('Ganz nach hinten')}
            </button>
          </div>
          <button className="w-btn dz-delete" onClick={() => apply((d) => removeLayer(d, l.id))}>
            {t('Element löschen')}
          </button>
        </section>
      )}
      <section className="dz-group">
        <h3>{t('Elemente')}</h3>
        <ul className="dz-layers">
          {[...design.layers].reverse().map((x) => (
            <li key={x.id}>
              <button aria-current={x.id === selected ? 'true' : undefined} onClick={() => onSelect(x.id)}>
                <span className="w-ellipsis">{layerLabel(x)}</span>
                {x.ai && <span className="dz-ai-tag" title={t('Mit KI erzeugt')}>{t('KI')}</span>}
                {(hints.get(x.id) ?? []).length > 0 && <span className="dz-dot" aria-label={t('Hinweis')} />}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
});
