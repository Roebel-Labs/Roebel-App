// Shimmer skeleton loaders: one primitive plus a few layouts that mirror the real screens, so nothing
// jumps when the data arrives. The shimmer is a moving gradient on a grey base (tokens from shell.css);
// with `prefers-reduced-motion` it is a static tint. Skeletons are decorative: the wrapper carries
// `aria-busy` and a visually hidden "Wird geladen" for screen readers.
import type { CSSProperties, ReactNode } from 'react';
import './skeleton.css';

type Size = number | string;
const px = (v: Size | undefined) => (typeof v === 'number' ? `${v}px` : v);

/** One shimmering block. `circle` is for avatars; everything else has the 4px radius. */
export function Skeleton({ w, h = 14, circle, className, style }: { w?: Size; h?: Size; circle?: boolean; className?: string; style?: CSSProperties }) {
  return <span className={`sk${circle ? ' circle' : ''}${className ? ` ${className}` : ''}`} style={{ width: px(w ?? (circle ? h : '100%')), height: px(h), ...style }} aria-hidden="true" />;
}

/** Marks a loading region. Renders a div by default; pass `as` for list or inline contexts. */
export function Busy({ children, className, as: Tag = 'div', label = 'Wird geladen' }: { children: ReactNode; className?: string; as?: 'div' | 'span' | 'ul' | 'section'; label?: string }) {
  if (Tag === 'ul')
    return (
      <ul className={`sk-busy${className ? ` ${className}` : ''}`} aria-busy="true" aria-label={label}>
        {children}
      </ul>
    );
  return (
    <Tag className={`sk-busy${className ? ` ${className}` : ''}`} aria-busy="true">
      <span className="sk-sr" role="status">
        {label}
      </span>
      {children}
    </Tag>
  );
}

const LINE_WIDTHS = ['96%', '88%', '93%', '72%', '90%', '64%'];

/** Paragraph lines; the last line is shorter, like real text. */
export function SkLines({ lines = 3, h = 12, gap = 10, widths = LINE_WIDTHS }: { lines?: number; h?: number; gap?: number; widths?: string[] }) {
  return (
    <span className="sk-lines" style={{ gap }} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} h={h} w={i === lines - 1 && lines > 1 ? '58%' : widths[i % widths.length]} />
      ))}
    </span>
  );
}

/** Bordered rows with an optional tile, two text lines and a trailing pill (routines, skills, integrations, imports). */
export function SkRows({ rows = 3, tile, trailing = 64, joined }: { rows?: number; tile?: number; trailing?: number; joined?: boolean }) {
  return (
    <Busy className={joined ? 'sk-list' : 'sk-rows'}>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="sk-row" aria-hidden="true">
          {tile ? <Skeleton w={tile} h={tile} /> : null}
          <span className="sk-row-text">
            <Skeleton h={13} w={`${38 - (i % 3) * 6}%`} />
            <Skeleton h={11} w={`${62 - (i % 2) * 14}%`} />
          </span>
          {trailing > 0 && <Skeleton h={20} w={trailing} />}
        </span>
      ))}
    </Busy>
  );
}

/** Cards in a grid or a horizontal row (suggestions, catalog, mini-apps). */
export function SkCards({ cards = 3, row, height = 268, className }: { cards?: number; row?: boolean; height?: number; className?: string }) {
  return (
    <Busy className={className ?? (row ? 'sk-hrow' : 'sk-cards')}>
      {Array.from({ length: cards }, (_, i) => (
        <span key={i} className="sk-card" style={{ minHeight: height }} aria-hidden="true">
          <Skeleton w={44} h={44} />
          <Skeleton h={14} w="78%" style={{ marginTop: 14 }} />
          <Skeleton h={11} w="42%" style={{ marginTop: 8 }} />
          <span style={{ marginTop: 12 }}>
            <SkLines lines={2} h={11} gap={8} />
          </span>
          <Skeleton h={34} style={{ marginTop: 'auto' }} />
        </span>
      ))}
    </Busy>
  );
}

/** Für dich: headed groups of icon + title + reason rows. */
export function SkSuggestions({ groups = 3 }: { groups?: number }) {
  return (
    <Busy className="sk-sugs">
      {Array.from({ length: groups }, (_, g) => (
        <span key={g} className="sk-sug-group" aria-hidden="true">
          <Skeleton h={18} w={`${22 + g * 7}%`} />
          {Array.from({ length: g === 1 ? 1 : 2 }, (_, i) => (
            <span key={i} className="sk-sug">
              <Skeleton w={17} h={17} />
              <span className="sk-row-text">
                <Skeleton h={14} w={`${66 - i * 12}%`} />
                <Skeleton h={12} w={`${48 + i * 9}%`} />
              </span>
            </span>
          ))}
        </span>
      ))}
    </Busy>
  );
}

/** Sub-navigation entries while the list is unknown (wiki pages, library collections). */
export function SkNav({ items = 7 }: { items?: number }) {
  return (
    <Busy className="sk-nav">
      {Array.from({ length: items }, (_, i) => (
        <span key={i} className={`sk-nav-item${i % 4 === 1 ? ' indent' : ''}`} aria-hidden="true">
          <Skeleton h={13} w={`${52 + ((i * 17) % 34)}%`} />
        </span>
      ))}
    </Busy>
  );
}

/** A wiki page: title, summary, optional updates box, prose next to the info card, sources. */
export function SkPage({ updates, box = true }: { updates?: boolean; box?: boolean }) {
  return (
    <Busy className="sk-page">
      <span className="sk-page-head" aria-hidden="true">
        <Skeleton h={26} w="34%" />
        <Skeleton h={14} w="56%" />
      </span>
      {updates && (
        <span className="sk-box" aria-hidden="true">
          <Skeleton h={16} w={190} />
          <SkLines lines={3} h={12} gap={14} widths={['92%', '86%', '89%']} />
        </span>
      )}
      <span className={`sk-page-body${box ? ' with-box' : ''}`} aria-hidden="true">
        <span className="sk-page-text">
          <Skeleton h={18} w="28%" />
          <SkLines lines={4} />
          <Skeleton h={18} w="36%" style={{ marginTop: 14 }} />
          <SkLines lines={5} />
        </span>
        {box && (
          <span className="sk-infobox">
            <Skeleton h={15} w="50%" style={{ alignSelf: 'center' }} />
            <Skeleton h={120} w={120} style={{ alignSelf: 'center', margin: '8px 0' }} />
            {[0, 1, 2].map((i) => (
              <span key={i} className="sk-fact">
                <Skeleton h={12} w="30%" />
                <Skeleton h={12} w={`${70 - i * 12}%`} />
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="sk-page-foot" aria-hidden="true">
        <Skeleton h={12} w={170} />
        <Skeleton h={14} w={70} style={{ marginTop: 10 }} />
        <SkLines lines={4} h={11} gap={9} widths={['52%', '47%', '55%', '44%']} />
      </span>
    </Busy>
  );
}

/** Document text (library viewer, chat side panel, prompts). */
export function SkDoc({ lines = 8 }: { lines?: number }) {
  return (
    <Busy className="sk-doc">
      <SkLines lines={lines} />
    </Busy>
  );
}

/** Files of the library: thumb, name, date. */
export function SkFiles({ rows = 6 }: { rows?: number }) {
  return (
    <Busy className="sk-files">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="sk-file" aria-hidden="true">
          <Skeleton w={36} h={36} />
          <span className="sk-row-text">
            <Skeleton h={14} w={`${44 - (i % 3) * 8}%`} />
            <Skeleton h={11} w={`${28 + (i % 2) * 8}%`} />
          </span>
          <Skeleton h={12} w={72} />
        </span>
      ))}
    </Busy>
  );
}

/** Thread titles in the Start sidebar. */
export function SkThreads({ rows = 8 }: { rows?: number }) {
  return (
    <Busy className="sk-threads">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="sk-thread" aria-hidden="true">
          <Skeleton h={12} w={`${48 + ((i * 23) % 40)}%`} />
        </span>
      ))}
    </Busy>
  );
}

/** A conversation: alternating assistant and user messages. */
export function SkChat() {
  return (
    <Busy className="sk-chat">
      {[0, 1, 2].map((i) => (
        <span key={i} className="sk-chat-pair" aria-hidden="true">
          <span className="sk-chat-user">
            <Skeleton h={34} w={`${32 + i * 9}%`} />
          </span>
          <span className="sk-chat-bot">
            <Skeleton w={32} h={32} />
            <span className="sk-row-text">
              <Skeleton h={12} w={110} />
              <SkLines lines={i === 1 ? 2 : 3} />
            </span>
          </span>
        </span>
      ))}
    </Busy>
  );
}

/** KPI tiles and a chart (mini-app analytics). */
export function SkKpis({ tiles = 4 }: { tiles?: number }) {
  return (
    <Busy className="sk-kpis-wrap">
      <span className="kpis" aria-hidden="true">
        {Array.from({ length: tiles }, (_, i) => (
          <span key={i} className="kpi">
            <Skeleton h={11} w="54%" />
            <Skeleton h={26} w="40%" />
            <Skeleton h={11} w="66%" />
          </span>
        ))}
      </span>
      <Skeleton h={220} />
    </Busy>
  );
}
