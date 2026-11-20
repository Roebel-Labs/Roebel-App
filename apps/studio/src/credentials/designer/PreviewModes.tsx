// How the card will look for members: flat, in the hand (moving sheen + tilt), stacked with other cards
// (the plan's "Im Wallet"; the product never says Wallet),
// and on a light or dark screen. The name field shows "Vorname Nachname" (spec §7).
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { TEMPLATES, type CardDesign } from '@roebel/card-design';
import { t } from '../../i18n';
import { CardCanvas } from './CardCanvas';
import { loadSkia, snapshotUrl, tiltFromPointer } from './skia';
import './designer.css';

export type PreviewMode = 'card' | 'hand' | 'wallet' | 'theme';

export const PREVIEW_VALUES = { holderName: 'Vorname Nachname' };

const MODES: ReadonlyArray<{ id: PreviewMode; label: () => string }> = [
  { id: 'card', label: () => t('Karte') },
  { id: 'hand', label: () => t('In der Hand') },
  { id: 'wallet', label: () => t('Bei den anderen Ausweisen') },
  { id: 'theme', label: () => t('Hell / Dunkel') },
];

/** Two community cards behind the design in the wallet stack. */
function useStackBacks(): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const backs = ['gast', 'buerger'].map((id) => TEMPLATES.find((x) => x.id === id)!.design);
    loadSkia()
      .then((s) => Promise.all(backs.map((d) => snapshotUrl(s, d, 360))))
      .then((u) => alive && setUrls(u), () => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return urls;
}

export function PreviewModes({ design, urls, width }: { design: CardDesign; urls?: Record<string, string>; width: number }) {
  const [mode, setMode] = useState<PreviewMode>('card');
  const [dark, setDark] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const backs = useStackBacks();
  const w = Math.min(width, 520);

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => setTilt(tiltFromPointer(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY));

  let stage;
  if (mode === 'hand')
    stage = (
      <div className="dz-stage hand" onPointerMove={onMove} onPointerLeave={() => setTilt({ x: 0, y: 0 })}>
        <div className="dz-hand" style={{ transform: `perspective(1200px) rotateX(${(-tilt.y * 9).toFixed(2)}deg) rotateY(${(tilt.x * 12).toFixed(2)}deg)` }}>
          <CardCanvas design={design} width={w * 0.86} values={PREVIEW_VALUES} shine="pointer" tilt={tilt} urls={urls} />
        </div>
        <span className="pz-meta">{t('Bewege den Zeiger über die Karte.')}</span>
      </div>
    );
  else if (mode === 'wallet')
    stage = (
      <div className="dz-stage wallet">
        <div className="dz-wallet" style={{ width: w * 0.8 }}>
          {backs.map((u, i) => (
            <img key={u} src={u} alt="" className="dz-wallet-back" style={{ top: i * 34 }} draggable={false} />
          ))}
          <div className="dz-wallet-front" style={{ top: backs.length * 34 }}>
            <CardCanvas design={design} width={w * 0.8} values={PREVIEW_VALUES} shine="loop" urls={urls} />
          </div>
        </div>
      </div>
    );
  else if (mode === 'theme')
    stage = (
      <div className={`dz-stage theme ${dark ? 'dark' : 'light'}`}>
        <CardCanvas design={design} width={w * 0.8} values={PREVIEW_VALUES} shine="loop" urls={urls} />
        <div className="dz-seg small">
          <button aria-pressed={!dark} onClick={() => setDark(false)}>
            {t('Hell')}
          </button>
          <button aria-pressed={dark} onClick={() => setDark(true)}>
            {t('Dunkel')}
          </button>
        </div>
      </div>
    );
  else
    stage = (
      <div className="dz-stage">
        <CardCanvas design={design} width={w} values={PREVIEW_VALUES} shine="loop" urls={urls} />
      </div>
    );

  return (
    <div className="dz-preview">
      <div className="dz-seg" role="tablist" aria-label={t('Vorschau')}>
        {MODES.map((m) => (
          <button key={m.id} role="tab" aria-selected={mode === m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
            {m.label()}
          </button>
        ))}
      </div>
      {stage}
    </div>
  );
}
