'use strict';
// Show package: moves a whole show (sources, scenes, templates, table, sponsors, mixer) to another
// computer. Export writes <folder>/show.json + <folder>/media/<files>; every local media URL
// (http://127.0.0.1:<port>/media/<token>) becomes `ortis-media:<file>`. Import copies the files into
// the app's own folder, registers them with the media server and rewrites the references back.
// Settings (stream destinations and their keys, ffmpeg path, record folder) never leave the machine.

const fs = require('node:fs');
const path = require('node:path');

const FORMAT = 'ortis-show';
const VERSION = 1;
const LOCAL_MEDIA = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/media\/[0-9a-f]+$/;
const PACKED = /^ortis-media:(.+)$/;

/** Deep-maps every string in a JSON value. */
function mapStrings(v, fn) {
  if (typeof v === 'string') return fn(v);
  if (Array.isArray(v)) return v.map((x) => mapStrings(x, fn));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = mapStrings(x, fn);
    return out;
  }
  return v;
}

/** File name safe on Windows and macOS. */
function safeName(name) {
  const s = String(name)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/, '')
    .slice(0, 120);
  return s || 'datei';
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

/**
 * Builds the package in `destDir` (created). `pathOf(url)` maps a local media URL to its file (or null).
 * Returns { dir, files, missing } — `missing` lists media whose file no longer exists (left out).
 */
function exportShow({ stateJson, destDir, pathOf, now = new Date() }) {
  const state = JSON.parse(stateJson);
  delete state.settings; // destinations + keys, ffmpeg path, record folder: per machine
  const dir = path.join(destDir, `Ortis-Show-${stamp(now)}`);
  const mediaDir = path.join(dir, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  const byUrl = new Map();
  const used = new Set();
  const missing = [];
  const packed = mapStrings(state, (s) => {
    if (!LOCAL_MEDIA.test(s)) return s;
    if (byUrl.has(s)) return byUrl.get(s);
    const file = pathOf(s);
    if (!file || !fs.existsSync(file)) {
      missing.push(file || s);
      byUrl.set(s, s);
      return s;
    }
    let name = safeName(path.basename(file));
    for (let i = 2; used.has(name.toLowerCase()); i++) name = safeName(`${i}-${path.basename(file)}`);
    used.add(name.toLowerCase());
    fs.copyFileSync(file, path.join(mediaDir, name));
    const ref = `ortis-media:${name}`;
    byUrl.set(s, ref);
    return ref;
  });
  const doc = { format: FORMAT, version: VERSION, exportedAt: now.toISOString(), state: packed };
  fs.writeFileSync(path.join(dir, 'show.json'), JSON.stringify(doc, null, 1));
  return { dir, files: used.size, missing };
}

/**
 * Reads a package's show.json, copies its media into `mediaRoot/<stamp>/` and maps every
 * `ortis-media:` reference through `allow(absPath)` (the media server URL).
 * Returns { stateJson, files, missing }.
 */
function importShow({ file, mediaRoot, allow, now = new Date() }) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!doc || doc.format !== FORMAT || typeof doc.state !== 'object' || doc.state === null) {
    throw new Error('Keine Ortis-Show-Datei (show.json aus „Show exportieren“ wählen)');
  }
  const srcDir = path.join(path.dirname(file), 'media');
  const target = path.join(mediaRoot, stamp(now));
  const done = new Map();
  const missing = [];
  const state = mapStrings(doc.state, (s) => {
    const m = PACKED.exec(s);
    if (!m) return s;
    if (done.has(s)) return done.get(s);
    const name = safeName(m[1]);
    const from = path.join(srcDir, name);
    if (!fs.existsSync(from)) {
      missing.push(name);
      done.set(s, '');
      return '';
    }
    fs.mkdirSync(target, { recursive: true });
    const to = path.join(target, name);
    fs.copyFileSync(from, to);
    const url = allow(to);
    done.set(s, url);
    return url;
  });
  return { stateJson: JSON.stringify(state), files: done.size - missing.length, missing };
}

module.exports = { exportShow, importShow, mapStrings, safeName, FORMAT };
