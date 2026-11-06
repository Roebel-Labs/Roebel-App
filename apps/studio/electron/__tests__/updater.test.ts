import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { compareVersions, pickUpdate } = require('../updater.cjs');

const REL = 'https://github.com/Roebel-Labs/Roebel-App/releases/download/ortis-studio-v0.1.2';
const latest = {
  version: '0.1.2',
  downloads: [
    { os: 'win', url: `${REL}/Ortis-Studio-0.1.2-win-x64.exe`, sha256: 'AB' },
    { os: 'mac', url: `${REL}/Ortis-Studio-0.1.2-mac-arm64.dmg`, sha256: 'cd' },
  ],
};

describe('updater', () => {
  it('compares dotted versions numerically', () => {
    expect(compareVersions('0.1.10', '0.1.9')).toBe(1);
    expect(compareVersions('0.1.1', '0.1.1')).toBe(0);
    expect(compareVersions('0.1', '0.1.1')).toBe(-1);
  });

  it('offers only a newer version for this platform, from the project releases', () => {
    expect(pickUpdate(latest, '0.1.1', 'win32')).toMatchObject({ version: '0.1.2', os: 'win', sha256: 'ab' });
    expect(pickUpdate(latest, '0.1.1', 'darwin')).toMatchObject({ os: 'mac' });
    expect(pickUpdate(latest, '0.1.2', 'win32')).toBeNull();
    expect(pickUpdate(latest, '0.1.1', 'linux')).toBeNull();
    const evil = { ...latest, downloads: [{ os: 'win', url: 'https://evil.test/x.exe', sha256: 'ab' }] };
    expect(pickUpdate(evil, '0.1.1', 'win32')).toBeNull();
  });
});
