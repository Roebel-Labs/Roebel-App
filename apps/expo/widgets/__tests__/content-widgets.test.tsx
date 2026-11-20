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

  it('empty state opens Erkunden', () => {
    const t = json(buildWidgetTree(renderLunch(null, 0, 320, 160).light));
    expect(t).toContain('Heute kein Mittagstisch');
    expect(t).toContain('roebel://explore');
  });
});

describe('Diese Woche widget', () => {
  const ev = (id: string) => ({ id, title: `Event ${id}`, weekday: 'Fr', day: '20', time: '19:00', location: 'Marktplatz', url: `roebel://event/${id}` });
  const events: EventsPayload = { v: 1, updatedAt: 0, events: ['a', 'b', 'c', 'd', 'e', 'f'].map(ev) };

  it('fits as many rows as the height allows, each linking to its event', () => {
    const medium = json(buildWidgetTree(renderEvents(events, 320, 160).light));
    expect(medium).toContain('Diese Woche in Röbel');
    expect(medium).toContain('19:00 · Marktplatz');
    expect(medium.match(/roebel:\/\/event\//g)).toHaveLength(2);
    expect(json(buildWidgetTree(renderEvents(events, 320, 360).light)).match(/roebel:\/\/event\//g)).toHaveLength(6);
  });

  it('empty state opens the events page', () => {
    const t = json(buildWidgetTree(renderEvents(null, 320, 160).light));
    expect(t).toContain('Diese Woche keine Events');
    expect(t).toContain('roebel://events');
  });
});
