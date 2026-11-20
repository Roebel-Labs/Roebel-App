import {
  eventDateLine,
  eventMetaLine,
  eventsHeroHeight,
  eventsLayoutKind,
  eventsRowsVisible,
  lunchLayout,
  miniAppsGrid,
  rowsThatFit,
  shortVenue,
  storeTileLabel,
} from '../widget-layout';

// Typical Android launcher sizes in dp (Pixel, 5-column grid ≈ 4-column on most phones).
const SIZES = {
  row: [320, 70], // 4×1
  small: [150, 150], // 2×2
  medium3: [250, 170], // 3×2
  wide: [320, 170], // 4×2
  large3: [250, 260], // 3×3
  large: [320, 340], // 4×4
} as const;

describe('rowsThatFit', () => {
  it('counts only complete rows', () => {
    expect(rowsThatFit(100, 44, 8)).toBe(2);
  });
  it('handles exact fits, gaps and degenerate input', () => {
    expect(rowsThatFit(96, 44, 8)).toBe(2);
    expect(rowsThatFit(95, 44, 8)).toBe(1);
    expect(rowsThatFit(43, 44, 8)).toBe(0);
    expect(rowsThatFit(0, 44)).toBe(0);
    expect(rowsThatFit(100, 0)).toBe(0);
  });
});

describe('events layout', () => {
  it('picks the layout per size', () => {
    expect(eventsLayoutKind(...SIZES.row)).toBe('row');
    expect(eventsLayoutKind(...SIZES.small)).toBe('compact');
    expect(eventsLayoutKind(...SIZES.medium3)).toBe('list');
    expect(eventsLayoutKind(...SIZES.wide)).toBe('list');
    expect(eventsLayoutKind(...SIZES.large3)).toBe('hero');
    expect(eventsLayoutKind(...SIZES.large)).toBe('hero');
  });

  it('visible rows without scrolling never include a half row', () => {
    expect(eventsRowsVisible(...SIZES.row)).toBe(1);
    expect(eventsRowsVisible(...SIZES.small)).toBe(0);
    expect(eventsRowsVisible(...SIZES.wide)).toBe(2);
    expect(eventsRowsVisible(...SIZES.large3)).toBe(1);
    expect(eventsRowsVisible(...SIZES.large)).toBe(2);
    // iOS large (≈ 338 × 354 pt) and iPad extra large
    expect(eventsRowsVisible(338, 354)).toBe(2);
    expect(eventsRowsVisible(715, 354)).toBe(2);
  });

  it('hero height follows the width within bounds', () => {
    expect(eventsHeroHeight(100)).toBe(110);
    expect(eventsHeroHeight(292)).toBe(164);
    expect(eventsHeroHeight(600)).toBe(180);
  });

  it('formats the red date line, also for payloads without a month', () => {
    expect(eventDateLine({ weekday: 'Mo', day: '12', month: '10', time: '19:00' })).toBe('Mo. 12.10 · 19:00');
    expect(eventDateLine({ weekday: 'Fr', day: '5', month: '12', time: null })).toBe('Fr. 5.12');
    expect(eventDateLine({ weekday: 'Sa', day: '21', time: '09:00' })).toBe('Sa. 21. · 09:00');
  });

  it('meta line and venue', () => {
    expect(eventMetaLine({ time: '19:00', location: 'Marienkirche' })).toBe('19:00 · Marienkirche');
    expect(eventMetaLine({ time: null, location: '' })).toBe('');
    expect(shortVenue('Stadtbibliothek Röbel/Müritz, Kirchplatz 18, 17207 Röbel')).toBe('Stadtbibliothek Röbel/Müritz');
    expect(shortVenue('Marktplatz 1  17207 Röbel/Müritz')).toBe('Marktplatz 1  17207 Röbel/Müritz');
    expect(shortVenue(null)).toBe('');
  });
});

describe('mini apps grid (apps + the store tile)', () => {
  const g = (apps: number, size: readonly [number, number]) => {
    const r = miniAppsGrid(apps, size[0], size[1]);
    return { items: r.items, cols: r.cols, rows: r.rows, icon: r.icon, labels: r.labels };
  };

  // n = items = apps shown + 1 store tile
  it.each([
    // n, small, wide, large
    [1, { cols: 1, rows: 1 }, { cols: 1, rows: 1 }, { cols: 1, rows: 1 }],
    [2, { cols: 2, rows: 1 }, { cols: 2, rows: 1 }, { cols: 2, rows: 1 }],
    [3, { cols: 2, rows: 2 }, { cols: 3, rows: 1 }, { cols: 2, rows: 2 }],
    [4, { cols: 2, rows: 2 }, { cols: 4, rows: 1 }, { cols: 2, rows: 2 }],
    [5, { cols: 2, rows: 2 }, { cols: 3, rows: 2 }, { cols: 3, rows: 2 }],
    [9, { cols: 2, rows: 2 }, { cols: 4, rows: 2 }, { cols: 3, rows: 3 }],
  ])('n = %i', (n, small, wide, large) => {
    expect(g(n - 1, SIZES.small)).toMatchObject(small);
    expect(g(n - 1, SIZES.wide)).toMatchObject(wide);
    expect(g(n - 1, SIZES.large)).toMatchObject(large);
  });

  it('caps the items by size: small 4, wide 8, large 16', () => {
    expect(g(20, SIZES.small).items).toBe(4);
    expect(g(20, SIZES.wide).items).toBe(8);
    expect(g(20, SIZES.large)).toMatchObject({ items: 16, cols: 4, rows: 4 });
  });

  it('few items grow: two items on a wide widget are big tiles side by side', () => {
    const two = g(1, SIZES.wide);
    const eight = g(7, SIZES.wide);
    expect(two.icon).toBeGreaterThanOrEqual(80);
    expect(two.icon).toBeGreaterThan(eight.icon);
    expect(g(0, SIZES.large).icon).toBe(84); // store alone: capped, not giant
  });

  it('icons always fit their cell (incl. the name)', () => {
    for (const [w, h] of Object.values(SIZES)) {
      for (const apps of [0, 1, 2, 3, 4, 8, 15]) {
        const r = miniAppsGrid(apps, w, h);
        expect(r.icon).toBeLessThanOrEqual(r.tileW);
        expect(r.icon + (r.labels ? 18 : 0)).toBeLessThanOrEqual(r.rowH);
        expect(r.cols * r.rows).toBeGreaterThanOrEqual(r.items);
      }
    }
  });

  it('4×1: one row of icons without names', () => {
    const r = miniAppsGrid(8, ...SIZES.row);
    expect(r).toMatchObject({ rows: 1, labels: false });
    expect(r.items).toBe(5);
  });

  it('store tile label', () => {
    expect(storeTileLabel(0, 60)).toBe('Mini-Apps entdecken');
    expect(storeTileLabel(3, 70)).toBe('Entdecken');
    expect(storeTileLabel(1, 148)).toBe('Mini-Apps entdecken');
  });
});

describe('lunch layout', () => {
  it('per size', () => {
    expect(lunchLayout(...SIZES.row)).toEqual({ kind: 'row', cols: 1, rows: 1 });
    expect(lunchLayout(...SIZES.small)).toEqual({ kind: 'single', cols: 1, rows: 1 });
    expect(lunchLayout(...SIZES.medium3)).toEqual({ kind: 'grid', cols: 2, rows: 1 });
    expect(lunchLayout(...SIZES.wide)).toEqual({ kind: 'grid', cols: 2, rows: 1 });
    expect(lunchLayout(...SIZES.large)).toEqual({ kind: 'grid', cols: 2, rows: 2 });
    expect(lunchLayout(500, 340)).toEqual({ kind: 'grid', cols: 3, rows: 2 });
  });
});
