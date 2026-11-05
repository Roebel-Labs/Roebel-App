'use strict';
// Local HTTP server bound to 127.0.0.1. This task: the /media/ route, which
// serves operator-chosen files (video, images) to the renderer under opaque
// tokens so the renderer never gets arbitrary file:// access. Range requests
// are supported (video seeking/looping) and ACAO:* keeps canvases untainted.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

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
};

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

function createOverlayServer({ userDataDir, port = OVERLAY_PORT, log = () => {} }) {
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
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(tokens), null, 2));
      fs.renameSync(tmp, tokenFile);
    } catch (e) {
      log(`media tokens not persisted: ${e.message}`);
    }
  }

  function allow(absPath) {
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
    return `http://${HOST}:${OVERLAY_PORT}/media/${token}`;
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

  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      return send(res, 204, {
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range',
      });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, {}, 'method not allowed');
    const url = new URL(req.url || '/', `http://${HOST}`);
    const m = /^\/media\/([a-f0-9]{32})$/.exec(url.pathname);
    if (m) return handleMedia(req, res, m[1]);
    return send(res, 404, {}, 'not found');
  });
  server.keepAliveTimeout = 5000;

  function start() {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, HOST, () => {
        server.off('error', reject);
        const addr = server.address();
        log(`overlay server on http://${HOST}:${addr.port}`);
        resolve(addr.port);
      });
    });
  }

  function stop() {
    return new Promise((resolve) => {
      if (!server.listening) return resolve();
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
  }

  return { start, stop, allow };
}

module.exports = { createOverlayServer, OVERLAY_PORT, parseRange, contentType };
