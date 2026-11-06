import { describe, expect, it } from 'vitest';
import { overlayProgress } from '../anim';
import { STARTER_TEMPLATES } from '../templates';
import { renderFrame } from '../draw';
import { initialState } from '../../state/reducer';

// The MDC lower third leaves in reverse: text first, then the stripes behind the disc, the disc last.
describe('MDC lower third exit', () => {
  const t = STARTER_TEMPLATES.find((x) => x.id === 'mdc-lower-third')!;
  const hidden = { id: 'o', templateId: t.id, visible: false, changedAt: 0, fromProgress: 1 };
  const at = (id: string, ms: number) => {
    const n = t.nodes.find((x) => x.id === id)!;
    return overlayProgress(hidden, n.animOut ?? t.animOut, ms, n.outDelayMs ?? 0);
  };

  it('text gone before the stripes move; stripes gone before the disc shrinks', () => {
    expect(at('name', 200)).toBe(0);
    expect(at('bar', 150)).toBe(1); // stripes still full while the text fades
    expect(at('name-bg', 600)).toBe(0);
    expect(at('bar', 520)).toBe(0);
    expect(at('disc', 550)).toBe(1); // disc untouched until the stripes are in
    expect(at('disc', 940)).toBe(0);
  });
});

describe('MDC lower third exit (rendered)', () => {
  it('still draws everything at the moment of the hide, then text first', () => {
    const fills: string[] = [];
    const props: Record<string, unknown> = { font: '10px sans-serif', globalAlpha: 1 };
    const ctx = new Proxy(props, {
      get(target, key: string) {
        if (key === 'measureText') return (t: string) => ({ width: String(t).length * 20, actualBoundingBoxAscent: 30 });
        if (key === 'fillText') return (t: string) => fills.push(t);
        if (key in target) return target[key];
        return () => {};
      },
      set(target, key: string, v) {
        target[key] = v;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    const s = initialState();
    const ov = s.overlays.find((o) => o.templateId === 'mdc-lower-third')!;
    const rc = { row: { Nr: '6', Name: 'Zoomania', Kategorie: 'DTB Dance', Altersklasse: 'Kinder I' }, next: null, now: new Date(), sponsor: null, chatHighlight: null };
    const frame = (ms: number) => {
      fills.length = 0;
      renderFrame(ctx, { ...s, overlays: [{ ...ov, visible: false, changedAt: 1000, fromProgress: 1 }] }, () => ({ el: null, status: 'ok' }), rc, 1000 + ms, { overlaysOnly: true });
      return [...fills];
    };
    expect(frame(0)).toEqual(['DTB DANCE', 'KINDER I', 'ZOOMANIA', '6']);
    expect(frame(300)).toEqual(['6']);
    expect(frame(1000)).toEqual([]);
  });
});
