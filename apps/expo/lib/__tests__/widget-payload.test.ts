/**
 * Home-screen widget payload: which mini apps the widget shows and in what shape.
 */
import type { MiniApp } from '../miniapps';
import { buildPayload, resolveSelection, WIDGET_MAX_APPS, widgetDeepLink } from '../widget-payload';

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

  it('without a choice shows the installed apps in store order', () => {
    expect(resolveSelection(null, ['c', 'a'], live).map((a) => a.slug)).toEqual(['a', 'c']);
  });

  it('without a choice and nothing installed shows the featured apps', () => {
    expect(resolveSelection(null, [], live).map((a) => a.slug)).toEqual(['d']);
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
