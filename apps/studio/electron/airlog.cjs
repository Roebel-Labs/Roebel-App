'use strict';
// Append-only air-time log for sponsor spots: <recordDir>/werbung-airtime.jsonl, one JSON line per spot.
// Never throws: the renderer gets { ok, error } and the show goes on.

const fs = require('node:fs');
const path = require('node:path');
const { expandHome } = require('./output.cjs');

const FILE = 'werbung-airtime.jsonl';
const MAX_NAME = 200;
const MAX_ID = 100;
const MAX_DIR = 1024;

const isoMs = (v) => (typeof v === 'string' && v.length <= 40 ? Date.parse(v) : NaN);

function appendAirLog(p) {
  try {
    if (!p || typeof p !== 'object') return { ok: false, error: 'invalid payload' };
    const { recordDir, sponsorId, name, startedAt, endedAt } = p;
    if (typeof recordDir !== 'string' || recordDir === '' || recordDir.length > MAX_DIR) return { ok: false, error: 'invalid recordDir' };
    if (typeof sponsorId !== 'string' || sponsorId === '' || sponsorId.length > MAX_ID) return { ok: false, error: 'invalid sponsorId' };
    if (typeof name !== 'string' || name.length > MAX_NAME) return { ok: false, error: 'invalid name' };
    const a = isoMs(startedAt);
    const b = isoMs(endedAt);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return { ok: false, error: 'invalid times' };
    const dir = expandHome(recordDir);
    if (!path.isAbsolute(dir)) return { ok: false, error: 'recordDir must be absolute' };
    fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ sponsorId, name, startedAt, endedAt, seconds: Math.round(((b - a) / 1000) * 1000) / 1000 });
    fs.appendFileSync(path.join(dir, FILE), line + '\n');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

module.exports = { appendAirLog };
