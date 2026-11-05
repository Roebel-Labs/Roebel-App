import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';

const require = createRequire(import.meta.url);
const { createOverlayServer, OVERLAY_PORT } = require('../overlay-server.cjs');

let dir: string;
let server: ReturnType<typeof createOverlayServer>;
let base: string;
let port: number;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-overlay-'));
  fs.writeFileSync(path.join(dir, 'clip.mp4'), Buffer.from('0123456789abcdef'));
  fs.writeFileSync(path.join(dir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  server = createOverlayServer({ userDataDir: dir, port: 0, log: () => {} });
  port = await server.start();
  base = `http://127.0.0.1:${port}`;
});
afterEach(async () => {
  await server.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

// The token URL carries the real listen port (port 0 in tests).
const rewrite = (url: string) => `${base}${new URL(url).pathname}`;

/** Sends the request target verbatim (fetch would normalise `..`). */
function rawGet(target: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: target, method: 'GET' }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

function rawSocket(request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1', () => sock.write(request));
    let buf = '';
    sock.on('data', (d) => (buf += d.toString()));
    sock.on('end', () => resolve(buf));
    sock.on('close', () => resolve(buf));
    sock.on('error', reject);
    setTimeout(() => sock.destroy(), 1000);
  });
}

describe('overlay-server /media/', () => {
  it('uses port 7311 by default', () => {
    expect(OVERLAY_PORT).toBe(7311);
  });

  it('allow() returns a token URL that serves the file with type + CORS', async () => {
    const url = server.allow(path.join(dir, 'clip.mp4'));
    expect(url).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${port}/media/[a-f0-9]{32}$`));
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
    port = await server.start();
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

  it('traversal and wrong token shapes → 404', async () => {
    const url = server.allow(path.join(dir, 'clip.mp4'));
    const token = new URL(url).pathname.split('/').pop()!;
    expect(await rawGet('/media/../x')).toBe(404);
    expect(await rawGet('/media/%2e%2e/x')).toBe(404);
    expect(await rawGet('/media/%2e%2e%2fmedia-tokens.json')).toBe(404);
    expect(await rawGet(`/media/${token.toUpperCase()}`)).toBe(404);
    expect(await rawGet(`/media/${token}/../${token}x`)).toBe(404);
    expect(await rawGet(`/media/${token}`)).toBe(200);
  });

  it('a malformed request target answers 400 and the server keeps serving', async () => {
    const reply = await rawSocket('GET http://[ HTTP/1.1\r\nHost: x\r\n\r\n');
    expect(reply).toMatch(/^HTTP\/1\.1 400/);
    const garbage = await rawSocket('\x00\x01 nonsense\r\n\r\n');
    expect(garbage).toMatch(/^HTTP\/1\.1 400/);
    const url = server.allow(path.join(dir, 'clip.mp4'));
    expect((await fetch(rewrite(url))).status).toBe(200);
  });

  it('media-tokens.json is owner-only (0600)', () => {
    server.allow(path.join(dir, 'clip.mp4'));
    expect(fs.statSync(path.join(dir, 'media-tokens.json')).mode & 0o777).toBe(0o600);
  });

  it('status() reports the real port; a busy port is reported and allow() refuses', async () => {
    expect(server.status()).toEqual({ ok: true, port, error: null });
    const second = createOverlayServer({ userDataDir: dir, port, log: () => {} });
    await expect(second.start()).rejects.toThrow();
    expect(second.status()).toMatchObject({ ok: false, port: null });
    expect(second.status().error).toContain(`Port ${port} ist belegt`);
    expect(() => second.allow(path.join(dir, 'clip.mp4'))).toThrow(/Medienserver nicht gestartet/);
    await second.stop();
  });
});

// ---- /state relay + static dist ----
const WebSocket = require('ws');

/** Connects and queues every incoming message from the first tick (a replay can arrive with the handshake). */
function wsOpen(url: string, origin?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, origin ? { origin } : undefined);
    ws.inbox = [] as string[];
    ws.waiter = null as null | ((m: string) => void);
    ws.on('message', (d: Buffer) => {
      const m = d.toString();
      if (ws.waiter) {
        const w = ws.waiter;
        ws.waiter = null;
        w(m);
      } else ws.inbox.push(m);
    });
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
    ws.once('unexpected-response', (_r: unknown, res: http.IncomingMessage) => reject(new Error(`http ${res.statusCode}`)));
  });
}
const nextMsg = (ws: any, ms = 1000): Promise<any> =>
  new Promise((resolve, reject) => {
    if (ws.inbox.length) return resolve(JSON.parse(ws.inbox.shift()));
    const t = setTimeout(() => reject(new Error('no message')), ms);
    ws.waiter = (m: string) => {
      clearTimeout(t);
      resolve(JSON.parse(m));
    };
  });
const silent = (ws: any, ms = 150): Promise<boolean> =>
  new Promise((resolve) => {
    if (ws.inbox.length) return resolve(false);
    ws.waiter = () => resolve(false);
    setTimeout(() => {
      ws.waiter = null;
      resolve(true);
    }, ms);
  });

describe('/state relay', () => {
  const url = (role?: string) => `ws://127.0.0.1:${port}/state${role ? `?role=${role}` : ''}`;

  it('replays the latest publisher snapshot to a new subscriber first', async () => {
    const pub = await wsOpen(url('publisher'));
    pub.send(JSON.stringify({ type: 'state', state: { n: 1 }, sentAt: 1 }));
    pub.send(JSON.stringify({ type: 'state', state: { n: 2 }, sentAt: 2 }));
    await new Promise((r) => setTimeout(r, 100));
    const sub = await wsOpen(url());
    expect((await nextMsg(sub)).state).toEqual({ n: 2 });
    pub.close();
    sub.close();
  });

  it('relays live publisher messages to subscribers', async () => {
    const sub = await wsOpen(url());
    const pub = await wsOpen(url('publisher'));
    const p = nextMsg(sub);
    pub.send(JSON.stringify({ type: 'state', state: { n: 7 }, sentAt: 3 }));
    expect((await p).state).toEqual({ n: 7 });
    pub.close();
    sub.close();
  });

  it('ignores subscriber messages and malformed JSON', async () => {
    const a = await wsOpen(url());
    const b = await wsOpen(url());
    const pub = await wsOpen(url('publisher'));
    const quiet = silent(b);
    a.send(JSON.stringify({ type: 'state', state: { evil: true }, sentAt: 1 }));
    pub.send('{not json');
    expect(await quiet).toBe(true);
    const late = await wsOpen(url());
    expect(await silent(late)).toBe(true); // nothing stored, nothing replayed
    [a, b, pub, late].forEach((w) => w.close());
  });

  it('rejects foreign origins and wrong paths', async () => {
    await expect(wsOpen(url(), 'http://evil.example')).rejects.toThrow();
    await expect(wsOpen(`ws://127.0.0.1:${port}/other`)).rejects.toThrow();
    const ok = await wsOpen(url(), 'http://127.0.0.1:7311');
    ok.close();
  });
});

describe('static dist', () => {
  let dist: string;
  let s2: ReturnType<typeof createOverlayServer>;
  let p2: number;
  beforeEach(async () => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-dist-'));
    fs.mkdirSync(path.join(dist, 'assets'));
    fs.writeFileSync(path.join(dist, 'overlay.html'), '<!doctype html><title>o</title>');
    fs.writeFileSync(path.join(dist, 'assets', 'a.js'), 'x');
    fs.writeFileSync(path.join(dist, 'assets', 'f.woff2'), 'x');
    fs.writeFileSync(path.join(dir, 'secret.txt'), 's');
    s2 = createOverlayServer({ userDataDir: dir, port: 0, distDir: dist, log: () => {} });
    p2 = await s2.start();
  });
  afterEach(async () => {
    await s2.stop();
    fs.rmSync(dist, { recursive: true, force: true });
  });
  const get = (t: string) =>
    new Promise<{ status: number; type?: string }>((resolve, reject) => {
      http
        .request({ host: '127.0.0.1', port: p2, path: t }, (res) => {
          res.resume();
          resolve({ status: res.statusCode ?? 0, type: res.headers['content-type'] as string });
        })
        .on('error', reject)
        .end();
    });

  it('serves overlay.html and assets with content types', async () => {
    expect(await get('/overlay.html')).toMatchObject({ status: 200, type: expect.stringContaining('text/html') });
    expect(await get('/assets/a.js')).toMatchObject({ status: 200, type: expect.stringContaining('javascript') });
    expect(await get('/assets/f.woff2')).toMatchObject({ status: 200, type: 'font/woff2' });
  });

  it('blocks traversal and unknown files', async () => {
    expect((await get('/assets/../../package.json')).status).toBe(404);
    expect((await get('/assets/%2e%2e/%2e%2e/package.json')).status).toBe(404);
    expect((await get('/assets/nope.js')).status).toBe(404);
    expect((await get('/index.html')).status).toBe(404);
  });

  it('answers 503 with a hint when dist is missing', async () => {
    const s3 = createOverlayServer({ userDataDir: dir, port: 0, distDir: path.join(dist, 'missing'), log: () => {} });
    const p3 = await s3.start();
    const r = await fetch(`http://127.0.0.1:${p3}/overlay.html`);
    expect(r.status).toBe(503);
    expect(await r.text()).toContain('pnpm build');
    await s3.stop();
  });
});
