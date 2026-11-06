'use strict';
// Local HTTP server bound to 127.0.0.1. This task: the /media/ route, which
// serves operator-chosen files (video, images) to the renderer under opaque
// tokens so the renderer never gets arbitrary file:// access. Range requests
// are supported (video seeking/looping) and ACAO:* keeps canvases untainted.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');

const OVERLAY_PORT = 7311;
const HOST = '127.0.0.1';

const TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8',
};

const MAX_STATE_BYTES = 5 * 1024 * 1024;
// Origins allowed to open /state. OBS's CEF sends the page origin; Electron file:// pages send
// `null` or nothing; the Vite dev server is localhost:5175.
// Subscribers (OBS pages) must present one of these; `null`/absent Origins (sandboxed iframes, bare
// local processes) are refused. The publisher (studio) is token-authenticated and may omit Origin.
const SUBSCRIBER_ORIGINS = new Set(['http://localhost:5175', 'http://127.0.0.1:7311']);
const PUBLISHER_EXTRA_ORIGINS = new Set(['null', 'file://']);
const SLOW_SUBSCRIBER_BYTES = 2 * 1024 * 1024;
const DEAD_SUBSCRIBER_BYTES = 16 * 1024 * 1024;

function contentType(p) {
  return TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

/** Parses a single "bytes=" range. Returns {start,end}, null (no/ignored header) or 'invalid'. */
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m) return null; // multi-range or garbage: serve the whole file
  let start;
  let end;
  if (m[1] === '' && m[2] === '') return 'invalid';
  if (m[1] === '') {
    const n = Number(m[2]);
    if (n === 0) return 'invalid';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}

function createOverlayServer({
  userDataDir,
  port = OVERLAY_PORT,
  distDir = path.resolve(__dirname, '..', 'dist'),
  log = () => {},
}) {
  const tokenFile = path.join(userDataDir, 'media-tokens.json');
  /** token → absolute path */
  const tokens = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    for (const [t, p] of Object.entries(raw)) if (typeof p === 'string') tokens.set(t, p);
  } catch {
    /* first run or unreadable: start empty */
  }

  function persist() {
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      const tmp = `${tokenFile}.tmp`;
      // Owner-only: the map reveals which local files the operator uses.
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(tokens), null, 2), { mode: 0o600 });
      fs.chmodSync(tmp, 0o600); // a stale tmp from a crash keeps its old mode otherwise
      fs.renameSync(tmp, tokenFile);
    } catch (e) {
      log(`media tokens not persisted: ${e.message}`);
    }
  }

  /** Real listen state; the UI shows it (IPC overlay:status). */
  const state = { ok: false, port: null, error: null };
  /** Per-launch secret the studio presents to publish on /state. */
  const publisherToken = crypto.randomBytes(16).toString('hex');

  function allow(absPath) {
    if (!state.ok) throw new Error(`Medienserver nicht gestartet${state.error ? `: ${state.error}` : ''}`);
    if (typeof absPath !== 'string' || !path.isAbsolute(absPath)) throw new Error('Pfad muss absolut sein');
    const p = path.normalize(absPath);
    const st = fs.statSync(p); // throws for missing files
    if (!st.isFile()) throw new Error('Keine Datei');
    let token = null;
    for (const [t, q] of tokens) if (q === p) token = t;
    if (!token) {
      token = crypto.randomBytes(16).toString('hex');
      tokens.set(token, p);
      persist();
    }
    return `http://${HOST}:${state.port}/media/${token}`;
  }

  function send(res, status, headers = {}, body) {
    res.writeHead(status, { 'Access-Control-Allow-Origin': '*', ...headers });
    res.end(body);
  }

  function handleMedia(req, res, token) {
    const p = tokens.get(token);
    if (!p) return send(res, 404, {}, 'not found');
    fs.stat(p, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, {}, 'not found');
      const size = st.size;
      const base = {
        'Content-Type': contentType(p),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      };
      const range = parseRange(req.headers.range, size);
      if (range === 'invalid') return send(res, 416, { ...base, 'Content-Range': `bytes */${size}` });
      const { start, end } = range || { start: 0, end: size - 1 };
      const headers = { ...base, 'Content-Length': String(size === 0 ? 0 : end - start + 1) };
      if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      res.writeHead(range ? 206 : 200, { 'Access-Control-Allow-Origin': '*', ...headers });
      if (req.method === 'HEAD' || size === 0) return res.end();
      const stream = fs.createReadStream(p, { start, end });
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    });
  }

  /** Serves the built renderer (overlay.html + /assets/*) for the OBS browser source. */
  function handleStatic(req, res, pathname) {
    if (!fs.existsSync(typeof distDir === 'function' ? distDir() : distDir)) {
      return send(res, 503, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Renderer nicht gebaut: pnpm build ausführen');
    }
    let rel;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      return send(res, 400, {}, 'bad request');
    }
    if (rel !== '/overlay.html' && !rel.startsWith('/assets/')) return send(res, 404, {}, 'not found');
    const root = path.resolve(typeof distDir === 'function' ? distDir() : distDir);
    const file = path.resolve(root, `.${rel}`);
    if (!file.startsWith(root + path.sep)) return send(res, 404, {}, 'not found');
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, {}, 'not found');
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': contentType(file),
        'Content-Length': String(st.size),
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') return res.end();
      const stream = fs.createReadStream(file);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    });
  }

  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      return send(res, 204, {
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range',
      });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, {}, 'method not allowed');
    let url;
    try {
      url = new URL(req.url || '/', `http://${HOST}`);
    } catch {
      return send(res, 400, {}, 'bad request'); // never let a malformed target throw in main
    }
    // Strict token shape: traversal (`..`, `%2e%2e`) and other casing simply do not match.
    const m = /^\/media\/([a-f0-9]{32})$/.exec(url.pathname);
    if (m) return handleMedia(req, res, m[1]);
    if (url.pathname === '/overlay.html' || url.pathname.startsWith('/assets/')) {
      return handleStatic(req, res, url.pathname);
    }
    return send(res, 404, {}, 'not found');
  });
  server.keepAliveTimeout = 5000;

  server.on('clientError', (_err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    else socket.destroy();
  });

  // ---- /state: studio (publisher) → OBS browser sources (subscribers) ----
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_STATE_BYTES });
  /** Latest publisher snapshot (raw JSON), replayed to every new subscriber. */
  let snapshot = null;

  function originOk(origin, publisher) {
    if (!origin) return publisher;
    if (SUBSCRIBER_ORIGINS.has(origin)) return true;
    if (state.port != null && origin === `http://${HOST}:${state.port}`) return true;
    return publisher && PUBLISHER_EXTRA_ORIGINS.has(origin);
  }

  function tokenOk(given) {
    const a = Buffer.from(String(given ?? ''));
    const b = Buffer.from(publisherToken);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  server.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url || '/', `http://${HOST}`);
    } catch {
      return socket.destroy();
    }
    const publisher = url.searchParams.get('role') === 'publisher';
    if (url.pathname !== '/state' || !originOk(req.headers.origin, publisher)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('error', () => {});
      if (!publisher) {
        if (snapshot) ws.send(snapshot);
        return; // subscribers never write
      }
      if (!tokenOk(url.searchParams.get('token'))) return ws.close(4401, 'unauthorized');
      ws._publisher = true;
      ws.on('message', (data) => {
        const text = data.toString();
        if (!text.startsWith('{"type":"state"')) return;
        try {
          const msg = JSON.parse(text);
          if (!msg || typeof msg !== 'object' || msg.type !== 'state') return;
          // Defence in depth: the stream key lives in settings and must never be relayed.
          if ('settings' in msg || (msg.state && typeof msg.state === 'object' && 'settings' in msg.state)) {
            log('overlay relay: rejected a message containing settings');
            return;
          }
        } catch {
          return; // malformed: drop
        }
        snapshot = text;
        for (const c of wss.clients) {
          if (c === ws || c.readyState !== 1 || c._publisher) continue;
          if (c.bufferedAmount > DEAD_SUBSCRIBER_BYTES) c.terminate();
          else if (c.bufferedAmount <= SLOW_SUBSCRIBER_BYTES) c.send(text); // else: latest wins, skip
        }
      });
    });
  });

  function start() {
    return new Promise((resolve, reject) => {
      const onError = (e) => {
        state.ok = false;
        state.port = null;
        state.error = e.code === 'EADDRINUSE' ? `Port ${port} ist belegt` : e.message;
        log(`overlay server failed: ${state.error}`);
        reject(e);
      };
      server.once('error', onError);
      server.listen(port, HOST, () => {
        server.off('error', onError);
        const addr = server.address();
        state.ok = true;
        state.port = addr.port;
        state.error = null;
        log(`overlay server on http://${HOST}:${addr.port}`);
        resolve(addr.port);
      });
    });
  }

  function status() {
    return { ...state, publisherToken };
  }

  function stop() {
    state.ok = false;
    return new Promise((resolve) => {
      if (!server.listening) return resolve();
      for (const c of wss.clients) c.terminate();
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
  }

  /** The file behind a media URL this server handed out, or null. */
  function pathOf(url) {
    const m = /\/media\/([0-9a-f]+)$/.exec(String(url));
    return (m && tokens.get(m[1])) || null;
  }

  return { start, stop, allow, status, pathOf };
}

module.exports = { createOverlayServer, OVERLAY_PORT, parseRange, contentType };
