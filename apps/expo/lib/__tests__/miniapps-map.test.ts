/**
 * mapMiniAppRow: manifest version + identity section, tolerant of rows read before the
 * identity migration is applied (no columns → version 1, identity null).
 */
import { mapMiniAppRow, selectWithColumnFallback } from '../miniapps';

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

describe('mapMiniAppRow contracts', () => {
  const decl = { address: '0xAbC0000000000000000000000000000000000001', label: 'Trainingsbuch', functions: ['checkIn(uint256)'] };

  it('maps the contracts of a version-2 row, lowercasing addresses', () => {
    const a = mapMiniAppRow({ ...row, manifest_version: '2', contracts: [decl] });
    expect(a.contracts).toEqual([
      { address: '0xabc0000000000000000000000000000000000001', label: 'Trainingsbuch', functions: ['checkIn(uint256)'] },
    ]);
  });

  it('a row before the contracts migration has none', () => {
    expect(mapMiniAppRow({ ...row, manifest_version: '2' }).contracts).toEqual([]);
    expect(mapMiniAppRow(row).contracts).toEqual([]);
  });

  it('a version-1 row never carries contracts', () => {
    expect(mapMiniAppRow({ ...row, contracts: [decl] }).contracts).toEqual([]);
  });

  it('drops malformed entries', () => {
    const a = mapMiniAppRow({
      ...row,
      manifest_version: '2',
      contracts: [decl, { address: 'x', label: 'y', functions: [] }, 'z', { address: decl.address, functions: [] }],
    });
    expect(a.contracts).toHaveLength(1);
  });
});

describe('selectWithColumnFallback', () => {
  const missing = { data: null, error: { code: '42703', message: 'column does not exist' } };

  it('falls back from contracts to identity to the legacy columns', async () => {
    const seen: string[] = [];
    const res = await selectWithColumnFallback(async (cols) => {
      seen.push(cols);
      return seen.length < 3 ? missing : { data: [], error: null };
    });
    expect(res.error).toBeNull();
    expect(seen).toHaveLength(3);
    expect(seen[0]).toContain('contracts');
    expect(seen[1]).not.toContain('contracts');
    expect(seen[1]).toContain('identity');
    expect(seen[2]).not.toContain('identity');
  });

  it('keeps the identity columns when only contracts is missing', async () => {
    const seen: string[] = [];
    await selectWithColumnFallback(async (cols) => {
      seen.push(cols);
      return seen.length < 2 ? missing : { data: [], error: null };
    });
    expect(seen).toHaveLength(2);
    expect(seen[1]).toContain('manifest_version');
  });

  it('does not retry on other errors', async () => {
    let n = 0;
    const res = await selectWithColumnFallback(async () => {
      n++;
      return { data: null, error: { code: '500', message: 'x' } };
    });
    expect(n).toBe(1);
    expect(res.error?.code).toBe('500');
  });
});
