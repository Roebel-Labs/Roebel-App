/**
 * Mittagstisch + "Diese Woche" home-screen widgets: which dishes / events they show
 * and the payload both platforms read.
 */
import {
  buildEventsPayload,
  buildLunchPayload,
  lunchPageIndex,
  selectLunchRestaurants,
  WIDGET_EVENTS_MAX,
  WIDGET_LUNCH_MAX,
} from '../widget-content';

function menu(start: string, restaurant: string, items: { id: string; name: string; cat: string | null; price?: number; img?: string }[]) {
  return {
    start_date: start,
    restaurant: { name: restaurant },
    special_menu_items: items.map((i, n) => ({
      id: i.id,
      name: i.name,
      price: i.price ?? 0,
      image_url: i.img ?? null,
      image_thumb_url: null,
      sort_order: n,
      category: i.cat ? { name: i.cat } : null,
    })),
  } as any;
}

// Week of Mon 2026-11-16 .. Sun 2026-11-22; "today" = Fri 2026-11-20.
const TODAY = '2026-11-20';

describe('selectLunchRestaurants', () => {
  it('one page per restaurant, past days dropped, soonest dish first, restaurants by their soonest dish', () => {
    const menus = [
      menu('2026-11-16', 'Zur Waage', [
        { id: 'mon', name: 'Suppe', cat: 'Montag' },
        { id: 'sat1', name: 'Braten', cat: 'Samstag' },
        { id: 'any', name: 'Salat', cat: null },
      ]),
      menu('2026-11-16', 'Seeblick', [{ id: 'fri', name: 'Fisch', cat: 'Freitag' }]),
    ];
    const pages = selectLunchRestaurants(menus, TODAY);
    expect(pages.map((p) => [p.restaurant, p.dishes.map((d) => d.item.id)])).toEqual([
      ['Seeblick', ['fri']],
      ['Zur Waage', ['sat1', 'any']],
    ]);
  });

  it('merges several menus of the same restaurant and drops restaurants without upcoming dishes', () => {
    const menus = [
      menu('2026-11-16', 'Zur Waage', [{ id: 'a', name: 'A', cat: 'Freitag' }]),
      menu('2026-11-16', 'Zur Waage', [{ id: 'b', name: 'B', cat: 'Samstag' }]),
      menu('2026-11-16', 'Alt', [{ id: 'old', name: 'Old', cat: 'Montag' }]),
    ];
    expect(selectLunchRestaurants(menus, TODAY).map((p) => [p.restaurant, p.dishes.length])).toEqual([['Zur Waage', 2]]);
  });

  it(`caps each restaurant at ${WIDGET_LUNCH_MAX} dishes`, () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ id: `d${i}`, name: `D${i}`, cat: 'Freitag' }));
    expect(selectLunchRestaurants([menu('2026-11-16', 'X', items)], TODAY)[0].dishes).toHaveLength(WIDGET_LUNCH_MAX);
  });

  it('tolerates menus without embedded dishes (old caches)', () => {
    expect(selectLunchRestaurants([{ start_date: null, restaurant: null } as any], TODAY)).toEqual([]);
  });
});

describe('buildLunchPayload', () => {
  it('labels the day, formats the price, hides price 0, links to the dish page', () => {
    const menus = [
      menu('2026-11-16', 'Zur Waage', [
        { id: 'fri', name: 'Fisch', cat: 'Freitag', price: 11 },
        { id: 'sat', name: 'Braten', cat: 'Samstag', price: 0 },
      ]),
    ];
    const p = buildLunchPayload(selectLunchRestaurants(menus, TODAY), { fri: 'B64' }, TODAY, 1);
    expect(p).toEqual({
      v: 1,
      updatedAt: 1,
      restaurants: [
        {
          name: 'Zur Waage',
          dishes: [
            { id: 'fri', name: 'Fisch', price: '11,00 €', day: 'Heute', image: 'B64', url: 'roebel://restaurant/dish/fri' },
            { id: 'sat', name: 'Braten', price: null, day: 'Morgen', image: null, url: 'roebel://restaurant/dish/sat' },
          ],
        },
      ],
    });
  });
});

describe('lunchPageIndex', () => {
  it('wraps around in both directions and clamps a stale index', () => {
    expect(lunchPageIndex(0, 3, 1)).toBe(1);
    expect(lunchPageIndex(2, 3, 1)).toBe(0);
    expect(lunchPageIndex(0, 3, -1)).toBe(2);
    expect(lunchPageIndex(7, 3, 0)).toBe(0);
    expect(lunchPageIndex(0, 0, 1)).toBe(0);
  });
});

describe('buildEventsPayload', () => {
  const ev = (id: string, date: string, time: string | null, extra: Record<string, unknown> = {}) =>
    ({ id, title: `T${id}`, date, time, location: 'Marktplatz', is_cancelled: false, ...extra }) as any;

  it('maps weekday, day of month and HH:MM, links to the event, skips cancelled', () => {
    const p = buildEventsPayload(
      [ev('a', '2026-11-20', '19:00:00'), ev('b', '2026-11-21', null), ev('c', '2026-11-22', '10:00:00', { is_cancelled: true })],
      2,
      'SU1H',
    );
    expect(p).toEqual({
      v: 1,
      updatedAt: 2,
      place: 'Röbel',
      events: [
        { id: 'a', title: 'Ta', weekday: 'Fr', day: '20', month: '11', time: '19:00', location: 'Marktplatz', image: 'SU1H', url: 'roebel://event/a' },
        { id: 'b', title: 'Tb', weekday: 'Sa', day: '21', month: '11', time: null, location: 'Marktplatz', url: 'roebel://event/b' },
      ],
    });
  });

  it('shortens the venue to the part before the first comma', () => {
    const p = buildEventsPayload([ev('a', '2026-12-05', null, { location: 'Schule am Gotthunskamp, Gotthunskamp 13, 17207 Röbel' })], 0);
    expect(p.events[0]).toMatchObject({ location: 'Schule am Gotthunskamp', month: '12', image: null });
  });

  it(`caps at ${WIDGET_EVENTS_MAX} events`, () => {
    const many = Array.from({ length: 20 }, (_, i) => ev(`e${i}`, '2026-11-21', null));
    expect(buildEventsPayload(many, 0).events).toHaveLength(WIDGET_EVENTS_MAX);
  });
});
