// One tooltip primitive for icon-only controls (rail, toolbar, Start sidebar) and for hover cards.
// Shown after a short delay on hover and immediately on keyboard focus; positioned with fixed
// coordinates in a portal, so scrolling lists and the rail never clip it. No native `title`.
import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './tooltip.css';

export type TipSide = 'right' | 'bottom' | 'top';
const DELAY_MS = 300;
const GAP = 8;

/** Where the tooltip's anchor point sits for a trigger rectangle (pure; tested). */
export function tipAnchor(rect: { left: number; right: number; top: number; bottom: number }, side: TipSide): { x: number; y: number } {
  if (side === 'right') return { x: Math.round(rect.right + GAP), y: Math.round((rect.top + rect.bottom) / 2) };
  const x = Math.round((rect.left + rect.right) / 2);
  return side === 'bottom' ? { x, y: Math.round(rect.bottom + GAP) } : { x, y: Math.round(rect.top - GAP) };
}

type TriggerProps = {
  onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
  onBlur?: (e: FocusEvent<HTMLElement>) => void;
  onMouseDown?: (e: MouseEvent<HTMLElement>) => void;
  'aria-describedby'?: string;
};

/**
 * Wraps exactly one element. `label` is the tooltip content: a short string renders as the inverted pill,
 * `card` renders a bordered hover card (e.g. full thread title + date). The trigger keeps its own
 * accessible name (aria-label); the tooltip is linked with aria-describedby while it is open.
 */
/** Shift (px) that brings a box back inside the window with a margin (pure; tested). */
export function tipNudge(box: { left: number; right: number; top: number; bottom: number }, win: { width: number; height: number }, margin = 8): { dx: number; dy: number } {
  const dx = box.right > win.width - margin ? win.width - margin - box.right : box.left < margin ? margin - box.left : 0;
  const dy = box.bottom > win.height - margin ? win.height - margin - box.bottom : box.top < margin ? margin - box.top : 0;
  return { dx: Math.round(dx), dy: Math.round(dy) };
}

export function Tip({ label, keys, side = 'right', card, align = 'center', disabled, children }: {
  label: ReactNode;
  /** Shortcut hint shown as a keycap after the label, e.g. "⌘ K". */
  keys?: string;
  side?: TipSide;
  card?: boolean;
  /** For `side="right"`: align the tooltip's top with the trigger's top instead of centring it. */
  align?: 'center' | 'start';
  disabled?: boolean;
  children: ReactElement<TriggerProps>;
}) {
  const id = useId();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const el = useRef<HTMLSpanElement>(null);
  // Keep the tooltip inside the window: controls at the far right get a tooltip aligned to the edge.
  useLayoutEffect(() => {
    const node = el.current;
    if (!at || !node) return;
    node.style.margin = '0';
    const { dx, dy } = tipNudge(node.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
    node.style.margin = `${dy}px 0 0 ${dx}px`;
  }, [at]);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const hide = () => {
    clear();
    setAt(null);
  };
  useEffect(() => clear, []);
  // A tooltip must not outlive a scroll or a window blur.
  useEffect(() => {
    if (!at) return;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);

  const show = (el: HTMLElement, delay: number) => {
    clear();
    if (disabled) return;
    const open = () => {
      const r = el.getBoundingClientRect();
      const p = tipAnchor(r, side);
      setAt(side === 'right' && align === 'start' ? { x: p.x, y: Math.round(r.top) } : p);
    };
    if (delay > 0) timer.current = setTimeout(open, delay);
    else open();
  };

  const child = children.props;
  const trigger = cloneElement(children, {
    onMouseEnter: (e: MouseEvent<HTMLElement>) => {
      child.onMouseEnter?.(e);
      show(e.currentTarget, DELAY_MS);
    },
    onMouseLeave: (e: MouseEvent<HTMLElement>) => {
      child.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      child.onFocus?.(e);
      // Only for keyboard focus: a mouse click also focuses, and the tooltip would stick.
      if (e.currentTarget.matches(':focus-visible')) show(e.currentTarget, 0);
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      child.onBlur?.(e);
      hide();
    },
    onMouseDown: (e: MouseEvent<HTMLElement>) => {
      child.onMouseDown?.(e);
      hide();
    },
    'aria-describedby': at ? id : child['aria-describedby'],
  });

  return (
    <>
      {trigger}
      {at &&
        createPortal(
          <span ref={el} id={id} role="tooltip" className={`tip ${card ? 'card' : 'pill'} ${side}${align === 'start' ? ' start' : ''}`} style={{ left: at.x, top: at.y }}>
            {label}
            {keys && <kbd className="tip-keys">{keys}</kbd>}
          </span>,
          document.body,
        )}
    </>
  );
}
