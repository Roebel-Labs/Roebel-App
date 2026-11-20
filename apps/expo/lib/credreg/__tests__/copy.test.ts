/**
 * Copy guard (spec 5.6b): no user-facing string in the credential screens says NFT, Token,
 * Wallet, Blockchain or Chain. Reads the source files and checks every string a person can see:
 * JSX text and string literals that look like prose (contain a space or start with a capital).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertCleanCopy, FORBIDDEN_UI_WORDS } from '../copy';

const ROOT = path.resolve(__dirname, '../../..');
const DIRS = ['components/credentials', 'app/credentials', 'app/org/credentials'];
/** Single credential files outside those folders. */
const FILES = ['components/org/OrgCredentialsPublic.tsx', 'components/profile/BadgeGrid.tsx', 'components/profile/CredentialDetailSheet.tsx'];

function files(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : files(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** Prose-looking strings of a source file (imports, comments and identifiers left out). */
export function userStrings(src: string): string[] {
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];?/gm, '')
    .replace(/require\(\s*['"][^'"]+['"]\s*\)/g, '');
  const out: string[] = [];
  for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const s = m[1] ?? m[2] ?? m[3] ?? '';
    if (/\s/.test(s.trim()) || /^[A-ZÄÖÜ]/.test(s)) out.push(s);
  }
  for (const m of code.matchAll(/>\s*([^<>{}\n;=()]+?)\s*</g)) if (/[A-Za-zÄÖÜäöü]/.test(m[1])) out.push(m[1]);
  return out;
}

describe('copy guard', () => {
  it('catches the forbidden words and lets clean copy through', () => {
    expect(FORBIDDEN_UI_WORDS).toHaveLength(5);
    expect(assertCleanCopy(userStrings("import x from '@/lib/credreg/chain';\n<Text>Dein Wallet</Text>; const a = 'Auf der Chain';"))).toEqual(['Auf der Chain', 'Dein Wallet']);
    expect(assertCleanCopy(['Dein NFT', 'Wallet verbinden', 'Abzeichen erhalten', 'Auf der Chain'])).toEqual(['Dein NFT', 'Wallet verbinden', 'Auf der Chain']);
  });

  it('every user-facing string in components/credentials and app/credentials passes assertCleanCopy', () => {
    const all = [...DIRS.flatMap(files), ...FILES.filter((f) => fs.existsSync(path.join(ROOT, f)))];
    expect(all.length).toBeGreaterThan(5);
    expect(all.some((f) => f.endsWith('StampMoment.tsx'))).toBe(true);
    const bad = all.flatMap((f) => assertCleanCopy(userStrings(fs.readFileSync(path.join(ROOT, f), 'utf8'))).map((s) => `${f}: ${s}`));
    expect(bad).toEqual([]);
  });
});
