import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatBot } from './types';
import { BotAvatar } from './BotAvatar';
import { activeEntry, type OutlineEntry } from './chat-activity';

/**
 * Agent at work: a tab tucked behind the top edge of the composer with the assistant's artwork peeking out
 * and a shimmering line saying what it is doing.
 */
export function ActivityBar({ bot, label }: { bot?: Pick<ChatBot, 'id' | 'name'> | null; label: string }) {
  return (
    <div className="ws-activity" role="status" aria-live="polite">
      <span className="ws-activity-avatar">
        <BotAvatar bot={bot} size={36} radius={8} />
      </span>
      <span className="ws-activity-label" key={label}>
        {label}
      </span>
    </div>
  );
}

/**
 * Chat outline: one short line per turn the person wrote, stacked on the left edge of the conversation.
 * The turn being read draws long; hovering a line previews that message, clicking scrolls to it.
 */
export function ChatOutline({ entries, scroller }: { entries: OutlineEntry[]; scroller: React.RefObject<HTMLDivElement | null> }) {
  const [active, setActive] = useState(-1);
  const [hover, setHover] = useState<number | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [cardTop, setCardTop] = useState(0);

  const track = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const base = el.getBoundingClientRect().top - el.scrollTop;
    const tops = entries.map((e) => {
      const node = el.querySelector<HTMLElement>(`[data-mid="${CSS.escape(e.id)}"]`);
      return node ? node.getBoundingClientRect().top - base : Number.POSITIVE_INFINITY;
    });
    // At the very bottom the last turn is the one being read, even when it is short.
    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    setActive(atEnd ? entries.length - 1 : activeEntry(tops, el.scrollTop, el.clientHeight));
  }, [entries, scroller]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    track();
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(track);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [scroller, track]);

  if (entries.length < 2) return null;

  const jump = (i: number) => {
    const el = scroller.current;
    const node = el?.querySelector<HTMLElement>(`[data-mid="${CSS.escape(entries[i].id)}"]`);
    if (!el || !node) return;
    const top = node.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 24;
    el.scrollTo({ top, behavior: 'smooth' });
  };

  const show = (i: number, target: HTMLElement) => {
    const box = rail.current?.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    if (box) setCardTop(r.top + r.height / 2 - box.top);
    setHover(i);
  };

  const shown = hover !== null ? entries[hover] : null;

  return (
    <nav className="ws-outline" aria-label="Abschnitte der Unterhaltung" ref={rail} onMouseLeave={() => setHover(null)}>
      {entries.map((e, i) => (
        <button
          key={e.id}
          type="button"
          className={`ws-outline-line${i === active ? ' active' : ''}${i === hover ? ' hover' : ''}`}
          style={{ ['--w' as string]: `${8 + Math.round(e.weight * 6)}px` }}
          aria-label={`${e.author}: ${e.preview.slice(0, 80)}`}
          aria-current={i === active ? 'location' : undefined}
          onMouseEnter={(ev) => show(i, ev.currentTarget)}
          onFocus={(ev) => show(i, ev.currentTarget)}
          onBlur={() => setHover(null)}
          onClick={() => jump(i)}
        >
          <span />
        </button>
      ))}
      {shown && (
        <div className="ws-outline-card" style={{ top: cardTop }} aria-hidden="true">
          <strong>{shown.author}</strong>
          <p>{shown.preview}</p>
        </div>
      )}
    </nav>
  );
}
