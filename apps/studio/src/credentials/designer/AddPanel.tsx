// Left column: start again from a template, the finish, and new elements (logo, text, personal
// fields, stickers). Uploads go through `onUpload` (the server stores the image for the org).
import { useRef, useState, type ReactNode } from 'react';
import { PRESETS, PRESET_IDS, addLayer, type CardDesign, type FieldId, type PresetId } from '@roebel/card-design';
import { t } from '../../i18n';
import type { AssetKind, AssetView } from '../types';
import { fieldLayers, imageLayer, textLayer } from './layers';
import { AI_PROMPT_MAX, promptReady, type AiKind } from './ai';

export function presetLabel(id: PresetId): string {
  switch (id) {
    case 'silver':
      return t('Silber');
    case 'navy':
      return t('Marine');
    case 'gold':
      return t('Gold');
    case 'black':
      return t('Schwarz');
    case 'paper':
      return t('Papier');
    case 'holo':
      return t('Holografisch');
    case 'matte':
      return t('Matt');
    case 'glass':
      return t('Glas');
  }
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="dz-group">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** "Beschreibe das Bild" + "Erzeugen"; the text stays after a failure so it can be sent again. */
export function AiBox({ kind, running, notice, onGenerate }: { kind: AiKind; running: boolean; notice: string | null; onGenerate: (kind: AiKind, prompt: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const go = () => promptReady(prompt) && !running && onGenerate(kind, prompt);
  return (
    <div className="dz-ai">
      <label className="dz-ai-label">
        <span>{t('Beschreibe das Bild')}</span>
        <input
          type="text"
          value={prompt}
          maxLength={AI_PROMPT_MAX}
          placeholder={t('Müritz bei Sonnenuntergang, ruhig, blau')}
          disabled={running}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go()}
        />
      </label>
      <button className="w-btn" disabled={running || !promptReady(prompt)} onClick={go}>
        {t('Erzeugen')}
      </button>
      {running && <p className="dz-note">{t('Wird erzeugt … (bis zu einer Minute)')}</p>}
      {!running && notice && <p className="dz-note">{notice}</p>}
    </div>
  );
}

export type Apply = (fn: (d: CardDesign) => CardDesign, opts?: { key?: string; select?: string | null | ((d: CardDesign) => string | null) }) => void;

const lastId = (d: CardDesign) => d.layers[d.layers.length - 1]?.id ?? null;

export function AddPanel({
  design, apply, assets, uploading, onUpload, onTemplates, generating = null, aiNotice = null, onGenerate,
}: {
  design: CardDesign;
  apply: Apply;
  assets: AssetView[];
  uploading: AssetKind | null;
  onUpload: (kind: AssetKind, file: File) => void;
  onTemplates: () => void;
  /** The AI request running now, if any. */
  generating?: AiKind | null;
  aiNotice?: { kind: AiKind; text: string } | null;
  onGenerate?: (kind: AiKind, prompt: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const kind = useRef<AssetKind>('logo');
  const pick = (k: AssetKind) => {
    kind.current = k;
    input.current?.click();
  };
  const bg = design.background;
  const preset = bg.kind === 'preset' ? bg.preset : null;
  const add = (make: (d: CardDesign) => CardDesign) => apply(make, { select: lastId });
  const addField = (f: FieldId) => add((d) => fieldLayers(d, f).reduce(addLayer, d));
  const logos = assets.filter((a) => a.kind === 'logo');
  const stickers = assets.filter((a) => a.kind === 'sticker');
  const backgrounds = assets.filter((a) => a.kind === 'background');

  const thumbs = (list: AssetView[], role: 'logo' | 'sticker') =>
    list.length > 0 && (
      <div className="dz-assets">
        {list.slice(0, 8).map((a) => (
          <button key={a.sha} className="dz-asset" title={t('Einfügen')} onClick={() => add((d) => addLayer(d, imageLayer(d, a.sha, role, a)))}>
            <img src={a.url} alt="" draggable={false} />
          </button>
        ))}
      </div>
    );

  return (
    <div className="dz-panel">
      <Group title={t('Vorlagen')}>
        <button className="w-btn" onClick={onTemplates}>
          {t('Andere Vorlage …')}
        </button>
      </Group>

      <Group title={t('Oberfläche')}>
        <div className="dz-swatches">
          {PRESET_IDS.map((id) => {
            const p = PRESETS[id];
            return (
              <button
                key={id}
                className="dz-swatch"
                aria-pressed={preset === id}
                title={presetLabel(id)}
                aria-label={presetLabel(id)}
                style={{ background: `linear-gradient(135deg, ${p.stops.map((c) => c.slice(0, 7)).join(', ')})` }}
                onClick={() => apply((d) => ({ ...d, background: { kind: 'preset', preset: id } }))}
              />
            );
          })}
        </div>
        {preset && PRESETS[preset].tintable && (
          <label className="dz-row">
            <span>{t('Farbe')}</span>
            <input
              type="color"
              value={(bg.kind === 'preset' && bg.color?.slice(0, 7)) || PRESETS[preset].stops[1].slice(0, 7)}
              onChange={(e) => apply((d) => (d.background.kind === 'preset' ? { ...d, background: { ...d.background, color: e.target.value } } : d), { key: 'bg-color' })}
            />
          </label>
        )}
        {backgrounds.length > 0 && (
          <div className="dz-assets">
            {backgrounds.slice(0, 6).map((a) => (
              <button key={a.sha} className="dz-asset wide" title={t('Als Hintergrund')} onClick={() => apply((d) => ({ ...d, background: { kind: 'image', assetId: a.sha, fit: 'cover' } }))}>
                <img src={a.url} alt="" draggable={false} />
              </button>
            ))}
          </div>
        )}
        <button className="w-btn" disabled={uploading !== null} onClick={() => pick('background')}>
          {uploading === 'background' ? t('Lädt hoch …') : t('Bild hochladen')}
        </button>
        {onGenerate && <AiBox kind="background" running={generating === 'background'} notice={aiNotice?.kind === 'background' ? aiNotice.text : null} onGenerate={onGenerate} />}
        <label className="dz-row">
          <span>{t('Glanz über die ganze Karte')}</span>
          <input
            type="checkbox"
            checked={design.shine.enabled}
            onChange={(e) => apply((d) => ({ ...d, shine: { enabled: e.target.checked, intensity: d.shine.intensity || 0.6 } }))}
          />
        </label>
        {design.shine.enabled && (
          <label className="dz-row">
            <span>{t('Stärke')}</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={design.shine.intensity}
              onChange={(e) => apply((d) => ({ ...d, shine: { ...d.shine, intensity: Number(e.target.value) } }), { key: 'shine-intensity' })}
            />
          </label>
        )}
      </Group>

      <Group title={t('Logo')}>
        {thumbs(logos, 'logo')}
        <button className="w-btn" disabled={uploading !== null} onClick={() => pick('logo')}>
          {uploading === 'logo' ? t('Lädt hoch …') : t('Logo hochladen')}
        </button>
      </Group>

      <Group title={t('Text')}>
        <div className="dz-buttons">
          <button className="w-btn" onClick={() => add((d) => addLayer(d, textLayer(d, 'heading')))}>
            {t('Überschrift')}
          </button>
          <button className="w-btn" onClick={() => add((d) => addLayer(d, textLayer(d, 'body')))}>
            {t('Text')}
          </button>
        </div>
      </Group>

      <Group title={t('Feld')}>
        <p className="dz-note">{t('Wird auf jedem Handy mit den Angaben der Person gefüllt.')}</p>
        <div className="dz-buttons">
          <button className="w-btn" onClick={() => addField('holderName')}>
            {t('Vor- und Nachname')}
          </button>
          <button className="w-btn" onClick={() => addField('validUntil')}>
            {t('Gültig bis')}
          </button>
          <button className="w-btn" onClick={() => addField('memberSince')}>
            {t('Mitglied seit')}
          </button>
        </div>
      </Group>

      <Group title={t('Sticker')}>
        {thumbs(stickers, 'sticker')}
        <button className="w-btn" disabled={uploading !== null} onClick={() => pick('sticker')}>
          {uploading === 'sticker' ? t('Lädt hoch …') : t('Sticker hochladen')}
        </button>
        {onGenerate && <AiBox kind="sticker" running={generating === 'sticker'} notice={aiNotice?.kind === 'sticker' ? aiNotice.text : null} onGenerate={onGenerate} />}
      </Group>

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onUpload(kind.current, f);
        }}
      />
    </div>
  );
}
