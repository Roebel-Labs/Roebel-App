jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../supabase-app-settings', () => ({ fetchExploreLayoutSetting: jest.fn(async () => null) }));

import {
  CODE_DEFAULT_LAYOUT,
  CODE_PRESETS,
  EXPLORE_BLOCK_IDS,
  applyPresetLayout,
  completeLayout,
  getStoredExploreLayout,
  miniAppSlugOf,
  parseExploreServerConfig,
  resetExploreLayout,
  sanitizeLayout,
  saveExploreLayout,
  visibleBlockIds,
} from '../explore-layout';

describe('explore layout', () => {
  it('drops unknown ids, duplicates and bad mini-app slugs', () => {
    expect(sanitizeLayout({ order: ['news', 'nope', 'news', 'miniapp:abc', 'miniapp:../x'], hidden: ['news', 'x'] }))
      .toEqual({ order: ['news', 'miniapp:abc'], hidden: ['news'] });
    expect(sanitizeLayout({ hidden: [] })).toBeNull();
    expect(sanitizeLayout('garbage')).toBeNull();
  });

  it('parses mini-app slugs', () => {
    expect(miniAppSlugOf('miniapp:roebel-fitness')).toBe('roebel-fitness');
    expect(miniAppSlugOf('news')).toBeNull();
    expect(miniAppSlugOf('miniapp:Bad Slug')).toBeNull();
  });

  it('inserts a block a saved layout does not know after its predecessor', () => {
    // Saved before 'audio' existed, with news moved to the top.
    const saved = { order: ['news', ...EXPLORE_BLOCK_IDS.filter((id) => id !== 'audio' && id !== 'news')], hidden: [] };
    const done = completeLayout(saved, CODE_DEFAULT_LAYOUT, 'insert');
    expect(done.order).toHaveLength(EXPLORE_BLOCK_IDS.length);
    // audio follows movies in the default, so it lands right after it
    expect(done.order.indexOf('audio')).toBe(done.order.indexOf('movies') + 1);
    expect(done.order[0]).toBe('news');
  });

  it('keeps a partial order on top and appends the rest', () => {
    const done = completeLayout({ order: ['news', 'hero'], hidden: [] });
    expect(done.order.slice(0, 3)).toEqual(['news', 'hero', 'this_week']);
    expect(done.order).toHaveLength(EXPLORE_BLOCK_IDS.length);
  });

  it('keeps pinned mini apps on top when a preset is applied', () => {
    const current = { order: ['miniapp:fitness', ...EXPLORE_BLOCK_IDS], hidden: [] };
    const preset = CODE_PRESETS.find((p) => p.id === 'uebersichtlich')!;
    const next = applyPresetLayout(preset, current, CODE_DEFAULT_LAYOUT);
    expect(next.order[0]).toBe('miniapp:fitness');
    expect(visibleBlockIds(next)).toEqual(['miniapp:fitness', 'hero', 'this_week', 'news', 'restaurants']);
  });

  it('falls back to code defaults for a malformed server value', () => {
    expect(parseExploreServerConfig('{not json').base).toBe(CODE_DEFAULT_LAYOUT);
    expect(parseExploreServerConfig(null).presets.map((p) => p.id)).toEqual(CODE_PRESETS.map((p) => p.id));
  });

  it('uses the server default and lets server presets override by id', () => {
    const cfg = parseExploreServerConfig(JSON.stringify({
      default: { order: ['news', 'hero'], hidden: ['movies'] },
      presets: [
        { id: 'neu', label: 'Neu hier', order: ['businesses'], hidden: [] },
        { id: 'markt', label: 'Markttag', order: ['marketplace'], hidden: [] },
        { id: 'broken', order: ['news'] },
      ],
    }));
    expect(cfg.base.order.slice(0, 2)).toEqual(['news', 'hero']);
    expect(cfg.base.hidden).toEqual(['movies']);
    expect(cfg.presets.find((p) => p.id === 'neu')!.label).toBe('Neu hier');
    expect(cfg.presets.map((p) => p.id)).toContain('markt');
    expect(cfg.presets.map((p) => p.id)).not.toContain('broken');
    expect(cfg.presets.find((p) => p.id === 'standard')!.layout).toBe(cfg.base);
  });

  it('persists, reloads and resets the device override', async () => {
    await saveExploreLayout({ order: ['news', 'bogus'], hidden: ['hero'] }, 'neu');
    expect(await getStoredExploreLayout()).toEqual({ order: ['news'], hidden: ['hero'], presetId: 'neu' });
    await resetExploreLayout();
    expect(await getStoredExploreLayout()).toBeNull();
  });
});
