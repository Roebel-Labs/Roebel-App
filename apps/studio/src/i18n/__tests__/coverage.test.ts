// Every German string passed to t() / tx() has an English entry, and no German key is translated
// two different ways in two dictionaries (they merge into one object, the last file would win).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');
const modules = import.meta.glob<{ default: Record<string, string> }>('../en/*.ts', { eager: true });

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' || n === 'i18n' ? [] : sources(p);
    return /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

describe('English dictionary', () => {
  const seen = new Map<string, Set<string>>();
  for (const m of Object.values(modules)) {
    for (const [de, en] of Object.entries(m.default)) seen.set(de, (seen.get(de) ?? new Set()).add(en));
  }

  it('translates each German key one way only', () => {
    const clashes = [...seen].filter(([, en]) => en.size > 1).map(([de, en]) => `${de} → ${[...en].join(' / ')}`);
    expect(clashes).toEqual([]);
  });

  it('covers every string the interface passes to t() or tx()', () => {
    const missing: string[] = [];
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\b(t|tx)\(\s*(?:(['"])(\w+)\2\s*,\s*)?(['"])((?:\\.|(?!\4).)*)\4/g)) {
        if (m[1] === 'tx' && !m[3]) continue;
        const de = m[5].replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
        if (!seen.has(de) && !(m[3] && seen.has(`${m[3]}|${de}`))) missing.push(`${file.slice(SRC.length)}: ${de}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
