// Animated vector wireframes while the builder works, one look per step:
//   Planen    — a phone outline draws itself, skeleton blocks fade in one after another
//   Bauen     — blocks fill with the accent as the code arrives, a scan line runs down;
//               every screen the model has written appears as its own small wireframe
//   Abschluss — everything solid, a check mark
// Pure SVG + CSS (apps.css, `wf-*`); respects prefers-reduced-motion.
import { t } from '../i18n';

export type BuildStage = 'plan' | 'build' | 'finish';

/** Typical size of a finished app document; only drives how full the wireframe looks. */
const EXPECTED_CHARS = 22_000;

/** Skeleton of a phone screen: header, hero card, list rows, a button, a tab bar. */
const BLOCKS: { x: number; y: number; w: number; h: number; r?: number }[] = [
  { x: 14, y: 16, w: 60, h: 8, r: 4 },
  { x: 14, y: 30, w: 92, h: 5, r: 2.5 },
  { x: 14, y: 44, w: 132, h: 54, r: 8 },
  { x: 14, y: 108, w: 132, h: 18, r: 6 },
  { x: 14, y: 132, w: 132, h: 18, r: 6 },
  { x: 14, y: 156, w: 132, h: 18, r: 6 },
  { x: 14, y: 186, w: 132, h: 20, r: 10 },
  { x: 0, y: 222, w: 160, h: 30, r: 0 },
];

/** How many blocks are "built": by stage, and during Bauen by the share of code written. */
export function filledBlocks(stage: BuildStage, chars: number, total = BLOCKS.length): number {
  if (stage === 'plan') return 0;
  if (stage === 'finish') return total;
  return Math.max(1, Math.min(total - 1, Math.round((chars / EXPECTED_CHARS) * total)));
}

function Phone({ stage, filled, large, title }: { stage: BuildStage; filled: number; large?: boolean; title?: string }) {
  return (
    <figure className={`wf-phone ${large ? 'large' : 'small'} wf-${stage}`}>
      <svg viewBox="-6 -6 172 264" role="img" aria-label={title ?? t('Vorschau')}>
        <rect className="wf-frame" x="-2" y="-2" width="164" height="256" rx="22" pathLength={1} />
        <g clipPath={large ? 'url(#wf-clip)' : undefined}>
          {BLOCKS.map((b, i) => (
            <rect
              key={i}
              className={`wf-block${i < filled ? ' on' : ''}`}
              style={{ animationDelay: `${i * 0.18}s` }}
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={b.r ?? 4}
            />
          ))}
          {stage === 'build' && <rect className="wf-scan" x="0" y="0" width="160" height="3" />}
        </g>
        {large && stage === 'finish' && (
          <g className="wf-check" transform="translate(80 126)">
            <circle r="22" />
            <path d="M-9 0l6 6 12-13" />
          </g>
        )}
        {large && (
          <defs>
            <clipPath id="wf-clip">
              <rect x="0" y="0" width="160" height="252" rx="20" />
            </clipPath>
          </defs>
        )}
      </svg>
      {title && <figcaption className="w-ellipsis">{title}</figcaption>}
    </figure>
  );
}

export function BuildWireframe({ stage, screens, chars }: { stage: BuildStage; screens: { slug: string; title: string }[]; chars: number }) {
  const filled = filledBlocks(stage, chars);
  const newest = screens.length - 1;
  return (
    <div className="wf">
      <Phone stage={stage} filled={filled} large />
      {screens.length > 0 && (
        <div className="wf-screens">
          {screens.slice(0, 6).map((s, i) => (
            <Phone key={s.slug} stage={i === newest && stage === 'build' ? 'build' : 'finish'} filled={i === newest && stage === 'build' ? filled : BLOCKS.length} title={s.title} />
          ))}
        </div>
      )}
    </div>
  );
}
