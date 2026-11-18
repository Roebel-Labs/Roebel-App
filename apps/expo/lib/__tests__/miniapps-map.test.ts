/**
 * mapMiniAppRow: manifest version + identity section, tolerant of rows read before the
 * identity migration is applied (no columns → version 1, identity null).
 */
import { mapMiniAppRow } from '../miniapps';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const row = {
  id: 'a1',
  slug: 'demo',
  name: 'Demo',
  icon_url: null,
  home_url: 'https://demo.example',
  description: null,
  category: 'utility',
  tags: [],
  screenshots: [],
  permissions: ['wallet'],
  primary_color: null,
  featured: false,
  feature_image_url: null,
  created_at: '2026-11-17T00:00:00Z',
  status: 'live',
};

describe('mapMiniAppRow', () => {
  it('maps a version-2 row', () => {
    const a = mapMiniAppRow({
      ...row,
      manifest_version: '2',
      identity: { profile: true, address: false, credentials: [] },
    });
    expect(a.manifestVersion).toBe(2);
    expect(a.identity?.profile).toBe(true);
  });

  it('treats a row without the new columns as version 1', () => {
    const a = mapMiniAppRow(row);
    expect(a.manifestVersion).toBe(1);
    expect(a.identity).toBeNull();
  });

  it('ignores a malformed identity value', () => {
    const a = mapMiniAppRow({ ...row, manifest_version: '2', identity: 'x' as unknown as null });
    expect(a.manifestVersion).toBe(2);
    expect(a.identity).toBeNull();
  });

  it('keeps only well-formed credential requests', () => {
    const a = mapMiniAppRow({
      ...row,
      manifest_version: '2',
      identity: {
        profile: false,
        address: true,
        credentials: [{ type: 'citizen', reason: 'Nur für Bürger:innen' }, { type: 5 }, 'x'],
      } as unknown as null,
    });
    expect(a.identity).toEqual({
      profile: false,
      address: true,
      credentials: [{ type: 'citizen', reason: 'Nur für Bürger:innen' }],
    });
  });

  it('a version-1 row never carries an identity section', () => {
    const a = mapMiniAppRow({
      ...row,
      manifest_version: '1',
      identity: { profile: true, address: true, credentials: [] },
    });
    expect(a.manifestVersion).toBe(1);
    expect(a.identity).toBeNull();
  });
});
