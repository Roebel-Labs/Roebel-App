// Menus that open from a tile in a scrolling row (sources, overlays) were clipped by that row: the row
// scrolls, so anything sticking out of it is cut off. This places such a menu with `position: fixed`
// next to its anchor (the menu's parent element) instead, above it when there is room, otherwise below,
// and never past the edges of the card it lives in.

import { useLayoutEffect, type RefObject } from 'react';

const GAP = 6;
const EDGE = 8;

/** The box fixed children are placed in: the shell card (`contain: paint` makes it their containing block). */
function container(el: HTMLElement): DOMRect {
  const card = el.closest('.shell-card');
  if (card) return card.getBoundingClientRect();
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

export function placeFloating(menu: HTMLElement) {
  const anchor = menu.parentElement;
  if (!anchor) return;
  const a = anchor.getBoundingClientRect();
  const box = container(menu);
  const s = menu.style;
  s.position = 'fixed';
  s.bottom = 'auto';
  s.right = 'auto';
  s.zIndex = '60';
  s.overflowY = 'auto';
  s.maxHeight = '';
  const h = menu.offsetHeight;
  const w = menu.offsetWidth;
  const above = a.top - box.top - GAP - EDGE;
  const below = box.bottom - a.bottom - GAP - EDGE;
  const up = h <= above || above >= below;
  const room = Math.max(80, up ? above : below);
  s.maxHeight = `${room}px`;
  const height = Math.min(h, room);
  const top = up ? a.top - GAP - height : a.bottom + GAP;
  const left = Math.min(Math.max(a.left, box.left + EDGE), box.right - w - EDGE);
  // Coordinates relative to the containing block, not the window.
  s.top = `${Math.round(top - box.top)}px`;
  s.left = `${Math.round(left - box.left)}px`;
}

/** Keeps the menu in `ref` next to its parent while it is open (resize, scroll, content changes). */
export function useFloating(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const place = () => placeFloating(menu);
    place();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    ro?.observe(menu);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [ref]);
}
