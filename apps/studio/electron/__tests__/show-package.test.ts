import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { exportShow, importShow } = require('../show-package.cjs');

const tmp: string[] = [];
const dir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ortis-pkg-'));
  tmp.push(d);
  return d;
};
afterEach(() => tmp.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe('show package', () => {
  it('round-trips media to another machine and never carries settings', () => {
    const src = dir();
    const video = path.join(src, 'Intro Film.mp4');
    const logo = path.join(src, 'logo.png');
    fs.writeFileSync(video, 'VIDEO');
    fs.writeFileSync(logo, 'PNG');
    const urls: Record<string, string> = {
      'http://127.0.0.1:7311/media/aa': video,
      'http://127.0.0.1:7311/media/bb': logo,
    };
    const state = {
      sources: [{ id: 's1', kind: 'video', url: 'http://127.0.0.1:7311/media/aa' }],
      sponsors: { items: [{ id: 'p', logoUrl: 'http://127.0.0.1:7311/media/bb' }, { id: 'q', logoUrl: 'https://x.test/l.png' }] },
      templates: [{ id: 't', nodes: [{ id: 'n', src: 'http://127.0.0.1:7311/media/bb' }] }],
      settings: { destinations: [{ target: { key: 'SECRET' } }] },
    };
    const out = exportShow({ stateJson: JSON.stringify(state), destDir: dir(), pathOf: (u: string) => urls[u] ?? null });
    expect(out.files).toBe(2);
    expect(out.missing).toEqual([]);
    const raw = fs.readFileSync(path.join(out.dir, 'show.json'), 'utf8');
    expect(raw).not.toContain('SECRET');
    expect(raw).not.toContain('127.0.0.1');

    const allowed: string[] = [];
    const r = importShow({
      file: path.join(out.dir, 'show.json'),
      mediaRoot: dir(),
      allow: (p: string) => {
        allowed.push(p);
        return `http://127.0.0.1:9999/media/${allowed.length}`;
      },
    });
    const s = JSON.parse(r.stateJson);
    expect(s.sources[0].url).toBe('http://127.0.0.1:9999/media/1');
    expect(s.sponsors.items[0].logoUrl).toBe('http://127.0.0.1:9999/media/2');
    expect(s.templates[0].nodes[0].src).toBe('http://127.0.0.1:9999/media/2'); // same file, copied once
    expect(s.sponsors.items[1].logoUrl).toBe('https://x.test/l.png');
    expect(s.settings).toBeUndefined();
    expect(allowed.map((p) => fs.readFileSync(p, 'utf8'))).toEqual(['VIDEO', 'PNG']);
  });

  it('reports media whose file is gone and refuses foreign JSON', () => {
    const out = exportShow({
      stateJson: JSON.stringify({ sources: [{ url: 'http://127.0.0.1:7311/media/cc' }] }),
      destDir: dir(),
      pathOf: () => '/nope/gone.mp4',
    });
    expect(out.missing).toEqual(['/nope/gone.mp4']);
    const foreign = path.join(dir(), 'show.json');
    fs.writeFileSync(foreign, JSON.stringify({ hello: 1 }));
    expect(() => importShow({ file: foreign, mediaRoot: dir(), allow: () => '' })).toThrow(/Ortis-Show/);
  });
});
