/**
 * Spec 6: user-visible copy never names the wallet vendor. Parses every source file under the app
 * directories with the TypeScript compiler API and collects JSX text plus multi-word string
 * literals / template parts (imports, exports and console.* arguments excluded).
 *
 * constants/consent.ts is excluded on purpose: the DSGVO processor list must name its processors,
 * and single words like 'Thirdweb' there are not explanatory copy (ruling R13).
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../..');
const DIRS = ['app', 'components', 'context', 'hooks', 'lib', 'constants'];
const SKIP_DIRS = new Set(['__tests__', '__mocks__', '__testutils__', 'node_modules']);
// R13: legally required processor naming.
const EXCLUDED_FILES = new Set([path.join('constants', 'consent.ts')]);
const VENDOR = /thirdweb/i;

function walk(dir: string, out: string[]): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out);
    } else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
      out.push(path.join(dir, e.name));
    }
  }
}

function isConsoleCall(n: ts.Node): boolean {
  if (!ts.isCallExpression(n)) return false;
  const e = n.expression;
  return ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'console';
}

function collect(file: string): string[] {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits: string[] = [];
  const check = (n: ts.Node, text: string, needsSpace: boolean) => {
    const t = text.trim();
    if (!t || (needsSpace && !/\s/.test(t)) || !VENDOR.test(t)) return;
    const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
    hits.push(`${path.relative(ROOT, file)}:${line}: ${t}`);
  };
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || isConsoleCall(n)) return;
    if (ts.isJsxText(n)) check(n, n.text, false);
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) check(n, n.text, true);
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) check(n, n.text, true);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

describe('copy: no vendor names in user-visible text', () => {
  it('never mentions thirdweb', () => {
    const files: string[] = [];
    for (const d of DIRS) walk(path.join(ROOT, d), files);
    const hits = files
      .filter((f) => !EXCLUDED_FILES.has(path.relative(ROOT, f)))
      .flatMap(collect);
    expect(hits).toEqual([]);
  });
});
