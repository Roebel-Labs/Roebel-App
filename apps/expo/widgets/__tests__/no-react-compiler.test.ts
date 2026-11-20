/**
 * react-native-android-widget calls widget components as plain functions, outside
 * React. The React Compiler (app.config.ts experiments.reactCompiler) would add a
 * memo-cache hook to them, and every render then fails with "Invalid Hook Call" —
 * the widget stays blank (seen on device 2026-11-20). Every widget file must opt out.
 */
import fs from 'fs';
import path from 'path';

const DIR = path.resolve(__dirname, '..');

test.each(fs.readdirSync(DIR).filter((f) => /\.tsx?$/.test(f)))('%s opts out of the React Compiler', (file) => {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  // The directive must come before the first import / statement.
  const firstCode = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').trim();
  expect(firstCode.startsWith("'use no memo';")).toBe(true);
});
