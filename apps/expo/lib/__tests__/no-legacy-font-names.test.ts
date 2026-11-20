/**
 * Fonts are embedded at build time (expo-font plugin, app.config.ts), and
 * embedded fonts cannot be aliased. A leftover `fontFamily: 'Inter-Regular'`
 * (e.g. from an older branch merged in) would silently render the system
 * font, so the legacy names must not come back.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SKIP = new Set(['node_modules', 'ios', 'android', '.expo', 'dist', 'supabase', '__tests__']);
const LEGACY = /['"`](Inter|GeistMono)-(Regular|Medium|SemiBold|Bold)['"`]/;

function walk(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
}

test('no legacy Inter-* / GeistMono-* font family names', () => {
  const files: string[] = [];
  walk(ROOT, files);
  const offenders = files
    .filter((f) => LEGACY.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROOT, f));
  expect(offenders).toEqual([]);
});
