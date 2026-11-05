import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { appendAirLog } = require('../airlog.cjs');

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'airlog-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const entry = (over = {}) => ({
  recordDir: dir,
  sponsorId: 's1',
  name: 'Bäckerei Schulz',
  startedAt: '2026-11-07T18:00:00.000Z',
  endedAt: '2026-11-07T18:00:08.500Z',
  ...over,
});

describe('appendAirLog', () => {
  it('appends one JSON line per entry with computed seconds', () => {
    expect(appendAirLog(entry()).ok).toBe(true);
    expect(appendAirLog(entry({ sponsorId: 's2' })).ok).toBe(true);
    const lines = fs.readFileSync(path.join(dir, 'werbung-airtime.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({
      sponsorId: 's1',
      name: 'Bäckerei Schulz',
      startedAt: '2026-11-07T18:00:00.000Z',
      endedAt: '2026-11-07T18:00:08.500Z',
      seconds: 8.5,
    });
  });
  it('creates the directory and expands ~', () => {
    const r = appendAirLog(entry({ recordDir: path.join(dir, 'nested', 'x') }));
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(dir, 'nested', 'x', 'werbung-airtime.jsonl'))).toBe(true);
  });
  it('rejects malformed payloads without throwing', () => {
    for (const bad of [
      null,
      'x',
      entry({ name: 5 }),
      entry({ name: 'x'.repeat(500) }),
      entry({ startedAt: 'yesterday' }),
      entry({ endedAt: '2026-11-07T17:00:00.000Z' }),
      entry({ recordDir: 'relative/dir' }),
      entry({ sponsorId: '' }),
    ]) {
      const r = appendAirLog(bad);
      expect(r.ok).toBe(false);
    }
    expect(fs.existsSync(path.join(dir, 'werbung-airtime.jsonl'))).toBe(false);
  });
  it('reports write errors instead of throwing', () => {
    const file = path.join(dir, 'file');
    fs.writeFileSync(file, 'x');
    expect(appendAirLog(entry({ recordDir: path.join(file, 'sub') })).ok).toBe(false);
  });
});
