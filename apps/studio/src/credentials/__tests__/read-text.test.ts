import { describe, expect, it } from 'vitest';
import { MAX_TEXT_BYTES, readTextFile } from '../read-text';

const file = (bytes: Uint8Array | string, name = 'liste.csv') => new File([bytes], name, { type: 'text/csv' });

describe('readTextFile', () => {
  it('reads UTF-8 with BOM', async () => {
    const utf8 = new TextEncoder().encode('Name;E-Mail\nJörg Müller;joerg@example.org');
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
    expect(await readTextFile(file(withBom))).toBe('Name;E-Mail\nJörg Müller;joerg@example.org');
  });

  it('reads plain UTF-8 untouched', async () => {
    expect(await readTextFile(file('Anna Schröder;anna@example.org'))).toBe('Anna Schröder;anna@example.org');
  });

  it('falls back to windows-1252 for "Müller;mueller@example.org" saved by Excel', async () => {
    // "Müller" in Windows-1252: ü = 0xFC, which is not valid UTF-8 on its own.
    const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
    const bytes = new Uint8Array([0x4d, 0xfc, ...ascii('ller;mueller@example.org'), 0x0d, 0x0a, ...ascii('Stra'), 0xdf, 0x65]);
    expect(await readTextFile(file(bytes))).toBe('Müller;mueller@example.org\r\nStraße');
  });

  it('keeps a genuine U+FFFD in valid UTF-8', async () => {
    expect(await readTextFile(file('a�b'))).toBe('a�b');
  });

  it('refuses files over 1 MB', async () => {
    const big = file(new Uint8Array(MAX_TEXT_BYTES + 1));
    await expect(readTextFile(big)).rejects.toThrow('Die Datei ist zu groß (höchstens 1 MB).');
  });
});
