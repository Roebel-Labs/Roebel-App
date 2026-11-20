/**
 * Android Mittagstisch + Diese Woche widgets, rendered through the library's real
 * tree builder (what the launcher receives).
 */
import { buildWidgetTree } from 'react-native-android-widget/src/api/build-widget-tree';
import { renderEvents, renderLunch, LUNCH_NEXT, LUNCH_PREV } from '../content-widgets';
import type { EventsPayload, LunchPayload } from '@/lib/widget-content';

const json = (tree: unknown) => JSON.stringify(tree);
const dish = (id: string) => ({ id, name: `Gericht ${id}`, price: '9,50 €', day: 'Heute', image: null, url: `roebel://restaurant/dish/${id}` });
const lunch: LunchPayload = {
  v: 1,
  updatedAt: 0,
  restaurants: [
    { name: 'Zur Waage', dishes: [dish('a'), dish('b'), dish('c')] },
    { name: 'Seeblick', dishes: [dish('d')] },
  ],
};

describe('Mittagstisch widget', () => {
  it('shows the current restaurant with ‹ › and the page counter', () => {
    const t = json(buildWidgetTree(renderLunch(lunch, 1, 320, 160).light));
    expect(t).toContain('Seeblick');
    expect(t).not.toContain('Zur Waage');
    expect(t).toContain('2/2');
    expect(t).toContain(LUNCH_PREV);
    expect(t).toContain(LUNCH_NEXT);
    expect(t).toContain('roebel://restaurant/dish/d');
  });

  it('medium = 2 dishes, large = 4 (capped by the restaurant)', () => {
    expect(json(buildWidgetTree(renderLunch(lunch, 0, 320, 160).light)).match(/restaurant\/dish\//g)).toHaveLength(2);
    expect(json(buildWidgetTree(renderLunch(lunch, 0, 320, 360).light)).match(/restaurant\/dish\//g)).toHaveLength(3);
  });

  it('a single restaurant has no arrows; a stale page falls back to the first', () => {
    const one: LunchPayload = { ...lunch, restaurants: [lunch.restaurants[0]] };
    const t = json(buildWidgetTree(renderLunch(one, 5, 320, 160).dark));
    expect(t).toContain('Zur Waage');
    expect(t).not.toContain(LUNCH_NEXT);
  });

  it('4×1 = one dish row with ‹ ›; 2×2 = one photo', () => {
    const row = json(buildWidgetTree(renderLunch(lunch, 0, 320, 70).light));
    expect(row.match(/restaurant\/dish\//g)).toHaveLength(1);
    expect(row).toContain('Zur Waage · 9,50 €');
    expect(row).toContain(LUNCH_NEXT);
    expect(json(buildWidgetTree(renderLunch(lunch, 0, 150, 150).light)).match(/restaurant\/dish\//g)).toHaveLength(1);
  });

  it('arrows are black in light mode and white in dark mode', () => {
    const light = json(buildWidgetTree(renderLunch(lunch, 0, 320, 160).light));
    const dark = json(buildWidgetTree(renderLunch(lunch, 0, 320, 160).dark));
    expect(light).toContain('stroke=\\"#000000\\"');
    expect(dark).toContain('stroke=\\"#FFFFFF\\"');
  });

  it('empty state opens Erkunden', () => {
    const t = json(buildWidgetTree(renderLunch(null, 0, 320, 160).light));
    expect(t).toContain('Heute kein Mittagstisch');
    expect(t).toContain('roebel://explore');
  });
});

describe('Events widget', () => {
  const ev = (id: string) => ({
    id,
    title: `Event ${id}`,
    weekday: 'Fr',
    day: '20',
    month: '11',
    time: '19:00',
    location: 'Marktplatz',
    url: `roebel://event/${id}`,
  });
  const events: EventsPayload = { v: 1, updatedAt: 0, place: 'Röbel', events: ['a', 'b', 'c', 'd', 'e', 'f'].map(ev) };
  const tree = (p: EventsPayload | null, w: number, h: number) => buildWidgetTree(renderEvents(p, w, h).light) as any;
  const find = (t: any, type: string): any[] => [...(t.type === type ? [t] : []), ...(t.children ?? []).flatMap((c: any) => find(c, type))];
  const eventLinks = (t: unknown) => json(t).match(/roebel:\/\/event\//g) ?? [];

  it('4×1: one row with the red date line, title and venue, opening the event', () => {
    const t = json(tree(events, 320, 70));
    expect(t).toContain('Fr. 20.11 · 19:00');
    expect(t).toContain('Event a');
    expect(t).not.toContain('Event b');
    expect(eventLinks(t)).toHaveLength(1);
  });

  it('2×2: photo of the next event (placeholder tile without one) + two-line title', () => {
    const withImage: EventsPayload = { ...events, events: [{ ...ev('a'), image: 'SU1H' }, ev('b')] };
    const t = json(tree(withImage, 150, 150));
    expect(t).toContain('data:image/jpeg;base64,SU1H');
    expect(t).toContain('Fr. 20.11 · 19:00');
    expect(t).not.toContain('Event b');
    expect(json(tree(events, 150, 150))).not.toContain('data:image/jpeg');
  });

  it('4×2: header and every event in one scrolling list, each row linking to its event', () => {
    const t = tree(events, 320, 170);
    expect(json(t)).toContain('Events in Röbel');
    expect(json(t)).toContain('19:00 · Marktplatz');
    const lists = find(t, 'ListWidget');
    expect(lists).toHaveLength(1);
    expect(lists[0].children).toHaveLength(6);
    expect(eventLinks(lists[0])).toHaveLength(6);
  });

  it('4×4: hero card for the next event first, then the rest as rows', () => {
    const t = tree(events, 320, 340);
    const list = find(t, 'ListWidget')[0];
    expect(list.children).toHaveLength(6);
    expect(json(list.children[0])).toContain('Marktplatz · 19:00');
    expect(json(list.children[0])).toContain('roebel://event/a');
    expect(json(list.children[1])).toContain('roebel://event/b');
  });

  it('a payload of an older app (no month, no place, no image) still renders', () => {
    const old = { v: 1, updatedAt: 0, events: [{ id: 'a', title: 'Alt', weekday: 'Sa', day: '21', time: null, location: 'X', url: 'roebel://event/a' }] } as EventsPayload;
    expect(json(tree(old, 320, 70))).toContain('Sa. 21.');
    expect(json(tree(old, 320, 340))).toContain('Events in Röbel');
  });

  it('empty state opens the events page', () => {
    const t = json(tree(null, 320, 160));
    expect(t).toContain('Keine anstehenden Events');
    expect(t).toContain('roebel://events');
  });
});
