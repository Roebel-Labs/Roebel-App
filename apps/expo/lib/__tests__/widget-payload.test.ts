/**
 * Home-screen widget payload: which mini apps the widget shows and in what shape.
 */
import type { MiniApp } from '../miniapps';
import { buildPayload, dedupeSlugs, mergeWidgetApps, resolveSelection, WIDGET_MAX_APPS, widgetDeepLink, type WidgetApp } from '../widget-payload';

function app(slug: string, extra: Partial<MiniApp> = {}): MiniApp {
  return {
    slug,
    name: slug.toUpperCase(),
    iconUrl: `https://x/${slug}.png`,
    primaryColor: '#123456',
    featured: false,
    ...extra,
  } as MiniApp;
}

const live = ['a', 'b', 'c', 'd'].map((s) => app(s, { featured: s === 'd' }));

describe('resolveSelection', () => {
  it('keeps the explicit order the user chose', () => {
    expect(resolveSelection(['c', 'a'], [], live).map((a) => a.slug)).toEqual(['c', 'a']);
  });

  it('drops a selected app that is no longer live (Review Focus 2)', () => {
    expect(resolveSelection(['gone', 'b'], [], live).map((a) => a.slug)).toEqual(['b']);
  });

  it('without a choice shows the recently opened apps, most recent first', () => {
    expect(resolveSelection(null, ['c', 'a'], live).map((a) => a.slug)).toEqual(['c', 'a']);
  });

  it('never opened anything: no apps (the widget shows the store tile alone)', () => {
    expect(resolveSelection(null, [], live)).toEqual([]);
  });

  it('a recently opened app that is no longer live is dropped', () => {
    expect(resolveSelection(null, ['gone', 'd'], live).map((a) => a.slug)).toEqual(['d']);
  });

  it('an explicit empty choice stays empty', () => {
    expect(resolveSelection([], ['a'], live)).toEqual([]);
  });

  it('caps at 15 apps (the 16th slot is the store tile)', () => {
    expect(WIDGET_MAX_APPS).toBe(15);
    const many = Array.from({ length: 20 }, (_, i) => app(`m${i}`));
    expect(resolveSelection(many.map((a) => a.slug), [], many)).toHaveLength(15);
  });
});

describe('buildPayload', () => {
  it('maps apps, icons and unread flags', () => {
    const p = buildPayload([app('a'), app('b', { primaryColor: '' })], { a: 'BASE64', b: null }, new Set(['b']), 42);
    expect(p).toEqual({
      v: 1,
      updatedAt: 42,
      apps: [
        { slug: 'a', name: 'A', color: '#123456', icon: 'BASE64', unread: false, url: 'roebel://mini-app/a?open=1' },
        { slug: 'b', name: 'B', color: null, icon: null, unread: true, url: 'roebel://mini-app/b?open=1' },
      ],
    });
  });

  it('a missing icon entry passes through as null (Review Focus 3)', () => {
    expect(buildPayload([app('a')], {}, new Set(), 1).apps[0].icon).toBeNull();
  });
});

it('deep links are URL-safe', () => {
  expect(widgetDeepLink('a b/c')).toBe('roebel://mini-app/a%20b%2Fc?open=1');
});

describe('mergeWidgetApps — opened apps stay in the widget', () => {
  const wa = (slug: string, extra: Partial<WidgetApp> = {}): WidgetApp => ({
    slug,
    name: slug.toUpperCase(),
    color: null,
    icon: `ICON_${slug}`,
    unread: false,
    url: widgetDeepLink(slug),
    ...extra,
  });

  it('existing list + new open + empty server answer → list kept, new app first', () => {
    const previous = [wa('a'), wa('b')];
    // Server answered with no live apps: nothing fresh, the new open "c" is unknown too.
    expect(mergeWidgetApps([], previous, null, ['c', 'a', 'b']).map((a) => a.slug)).toEqual(['a', 'b']);
    // Once "c" is known again it is added in front, nothing is lost.
    expect(mergeWidgetApps([wa('c')], previous, null, ['c', 'a', 'b']).map((a) => a.slug)).toEqual(['c', 'a', 'b']);
  });

  it('a lost recent list (storage wiped) still keeps what the widget showed', () => {
    expect(mergeWidgetApps([], [wa('a'), wa('b')], null, []).map((a) => a.slug)).toEqual(['a', 'b']);
  });

  it('fresh entries win (unread flag); a failed icon download keeps the previous icon', () => {
    const merged = mergeWidgetApps([wa('a', { unread: true, icon: null })], [wa('a')], null, ['a']);
    expect(merged).toEqual([wa('a', { unread: true, icon: 'ICON_a' })]);
  });

  it('reorders by the latest open without duplicates', () => {
    expect(mergeWidgetApps([wa('b'), wa('a')], [wa('a'), wa('b')], null, ['b', 'a', 'b']).map((a) => a.slug)).toEqual(['b', 'a']);
  });

  it('an explicit selection is the only way to remove an app', () => {
    expect(mergeWidgetApps([wa('b')], [wa('a'), wa('b')], ['b'], ['a', 'b']).map((a) => a.slug)).toEqual(['b']);
    // A selected app missing from a failed answer keeps its previous entry.
    expect(mergeWidgetApps([], [wa('a'), wa('b')], ['b'], []).map((a) => a.slug)).toEqual(['b']);
  });

  it(`caps at ${WIDGET_MAX_APPS}`, () => {
    const many = Array.from({ length: 20 }, (_, i) => wa(`m${i}`));
    expect(mergeWidgetApps(many, [], null, [])).toHaveLength(WIDGET_MAX_APPS);
  });

  it('dedupeSlugs keeps the first occurrence', () => {
    expect(dedupeSlugs(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });
});
