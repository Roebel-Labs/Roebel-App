import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createOverlayServer, OVERLAY_PORT } = require('../overlay-server.cjs');

let dir: string;
let server: ReturnType<typeof createOverlayServer>;
let base: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-overlay-'));
  fs.writeFileSync(path.join(dir, 'clip.mp4'), Buffer.from('0123456789abcdef'));
  fs.writeFileSync(path.join(dir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  server = createOverlayServer({ userDataDir: dir, port: 0, log: () => {} });
  const port = await server.start();
  base = `http://127.0.0.1:${port}`;
});
afterEach(async () => {
  await server.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

const rewrite = (url: string) => url.replace(`http://127.0.0.1:${OVERLAY_PORT}`, base);

describe('overlay-server /media/', () => {
  it('uses port 7311 by default', () => {
    expect(OVERLAY_PORT).toBe(7311);
  });

  it('allow() returns a token URL that serves the file with type + CORS', async () => {
    const url = server.allow(path.join(dir, 'clip.mp4'));
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:7311\/media\/[a-f0-9]{32}$/);
    const res = await fetch(rewrite(url));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(await res.text()).toBe('0123456789abcdef');
  });

  it('serves byte ranges', async () => {
    const url = rewrite(server.allow(path.join(dir, 'clip.mp4')));
    let res = await fetch(url, { headers: { Range: 'bytes=2-5' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 2-5/16');
    expect(await res.text()).toBe('2345');
    res = await fetch(url, { headers: { Range: 'bytes=10-' } });
    expect(await res.text()).toBe('abcdef');
    res = await fetch(url, { headers: { Range: 'bytes=-3' } });
    expect(await res.text()).toBe('def');
    res = await fetch(url, { headers: { Range: 'bytes=40-50' } });
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */16');
  });

  it('unknown token → 404, same path → same token, svg content type', async () => {
    expect((await fetch(`${base}/media/deadbeef`)).status).toBe(404);
    expect((await fetch(`${base}/other`)).status).toBe(404);
    const a = server.allow(path.join(dir, 'logo.svg'));
    expect(server.allow(path.join(dir, 'logo.svg'))).toBe(a);
    const res = await fetch(rewrite(a));
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
  });

  it('rejects relative or missing paths', () => {
    expect(() => server.allow('clip.mp4')).toThrow();
    expect(() => server.allow(path.join(dir, 'nope.mp4'))).toThrow();
  });

  it('tokens survive a restart (persisted in userData)', async () => {
    const url = server.allow(path.join(dir, 'clip.mp4'));
    await server.stop();
    server = createOverlayServer({ userDataDir: dir, port: 0, log: () => {} });
    const port = await server.start();
    base = `http://127.0.0.1:${port}`;
    const res = await fetch(rewrite(url));
    expect(res.status).toBe(200);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'media-tokens.json'), 'utf8'))).toBeTypeOf('object');
  });

  it('a file deleted after allow() → 404, not a crash', async () => {
    const p = path.join(dir, 'clip.mp4');
    const url = rewrite(server.allow(p));
    fs.unlinkSync(p);
    expect((await fetch(url)).status).toBe(404);
  });
});
