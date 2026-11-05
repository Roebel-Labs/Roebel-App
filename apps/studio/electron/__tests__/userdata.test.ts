import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const { resolveUserDataDir } = createRequire(import.meta.url)('../userdata.cjs');

const A = '/Users/x/Library/Application Support';
const NEW = `${A}/Ortis Studio`;
const OLD = `${A}/@roebel/studio`;

describe('resolveUserDataDir', () => {
  it('fresh install uses the new folder', () => {
    expect(resolveUserDataDir({ appData: A, exists: () => false })).toBe(NEW);
  });
  it('keeps the legacy folder when only it exists', () => {
    expect(resolveUserDataDir({ appData: A, exists: (p: string) => p === OLD })).toBe(OLD);
  });
  it('prefers the new folder when it exists', () => {
    expect(resolveUserDataDir({ appData: A, exists: () => true })).toBe(NEW);
  });
});
