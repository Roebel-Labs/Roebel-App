'use strict';
// Over-the-air updates of the interface (everything in dist/), like EAS Update for Expo.
//
// The website's latest.json carries `ota: { version, runtime, url, sha256, signature }`. A bundle is
// dist/ packed as one .asar (Electron reads files inside it directly). It is accepted only when
//   - its runtime equals OTA_RUNTIME (main/preload API it was built against; bump on IPC changes),
//   - it is newer than what runs now,
//   - its sha256 matches and the ed25519 signature over "version\nruntime\nsha256" verifies
//     with PUBLIC_KEY (the private key never leaves the publishing machine).
// A downloaded bundle waits as `pending` until the operator restarts ("Neu starten"). A bundle that
// does not report ready within BOOT_TIMEOUT_MS is marked bad and the built-in interface comes back.

const crypto = require('node:crypto');
const path = require('node:path');

// Bump whenever main.cjs/preload.cjs change in a way an older/newer interface cannot work with.
const OTA_RUNTIME = 1;
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAlIykqhmezmrnhA8+mPg7oMu9BLAmx+8cg9keFggbIcw=
-----END PUBLIC KEY-----`;
const BOOT_TIMEOUT_MS = 30_000;
const ALLOWED_URL = /^https:\/\/github\.com\/Roebel-Labs\/Roebel-App\/releases\/download\/ortis-studio-ota-v[0-9.]+\/renderer-[0-9.]+\.asar$/;

function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

const signedText = (o) => `${o.version}\n${o.runtime}\n${String(o.sha256).toLowerCase()}`;

function verifySignature(o, publicKey = PUBLIC_KEY) {
  try {
    return crypto.verify(null, Buffer.from(signedText(o)), publicKey, Buffer.from(String(o.signature), 'base64'));
  } catch {
    return false;
  }
}

/**
 * fsImpl must be Electron's `original-fs` in the app (plain fs would treat .asar files as folders).
 * readable: path inside an asar the app can read (Electron's fs) — used only to check a bundle exists.
 */
function createOta({ userDataDir, appVersion, bundledDist, fsImpl, readable = fsImpl.existsSync, fetchImpl = fetch, log = () => {}, now = Date.now, publicKey = PUBLIC_KEY }) {
  const dir = path.join(userDataDir, 'ota');
  const stateFile = path.join(dir, 'state.json');
  const bundleFile = (v) => path.join(dir, `renderer-${v}.asar`);

  let state = { current: null, pending: null, bad: [] };
  try {
    const raw = JSON.parse(fsImpl.readFileSync(stateFile, 'utf8'));
    state = {
      current: typeof raw.current === 'string' ? raw.current : null,
      pending: typeof raw.pending === 'string' ? raw.pending : null,
      bad: Array.isArray(raw.bad) ? raw.bad.filter((x) => typeof x === 'string') : [],
    };
  } catch {
    // first start or unreadable: built-in interface
  }
  const save = () => {
    try {
      fsImpl.mkdirSync(dir, { recursive: true });
      fsImpl.writeFileSync(`${stateFile}.tmp`, JSON.stringify(state));
      fsImpl.renameSync(`${stateFile}.tmp`, stateFile);
    } catch (e) {
      log(`ota state not saved: ${e.message}`);
    }
  };

  // A bundle is usable when present, newer than the installed app and not marked bad.
  const usable = (v) =>
    !!v && compareVersions(v, appVersion) > 0 && !state.bad.includes(v) && fsImpl.existsSync(bundleFile(v)) && readable(path.join(bundleFile(v), 'index.html'));

  let active = usable(state.current) ? state.current : null;
  let booting = false;
  let bootTimer = null;

  const distDir = () => (active ? bundleFile(active) : bundledDist);
  const version = () => active || appVersion;

  /** Called right before loading the interface: arms the rollback for an OTA bundle. */
  function beginBoot(onFailed) {
    if (bootTimer) clearTimeout(bootTimer);
    booting = !!active;
    if (!booting) return;
    bootTimer = setTimeout(() => {
      if (!booting) return;
      log(`ota ${active} did not start, back to the built-in interface`);
      state.bad.push(active);
      state.current = null;
      active = null;
      booting = false;
      save();
      onFailed();
    }, BOOT_TIMEOUT_MS);
  }

  /** The interface reports it rendered. */
  function ready() {
    booting = false;
    if (bootTimer) clearTimeout(bootTimer);
    bootTimer = null;
  }

  /** Looks for a newer bundle, downloads and verifies it. Resolves to the pending version or null. */
  async function check(latestUrl) {
    const res = await fetchImpl(latestUrl, { headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) throw new Error(`OTA-Prüfung: HTTP ${res.status}`);
    const o = (await res.json())?.ota;
    if (!o || typeof o.version !== 'string' || o.runtime !== OTA_RUNTIME) return state.pending;
    if (compareVersions(o.version, version()) <= 0 || state.bad.includes(o.version)) return state.pending;
    if (state.pending && compareVersions(o.version, state.pending) <= 0) return state.pending;
    if (!ALLOWED_URL.test(String(o.url)) || !verifySignature(o, publicKey)) {
      log(`ota ${o.version} rejected (url or signature)`);
      return state.pending;
    }
    const got = await fetchImpl(o.url, { redirect: 'follow' });
    if (!got.ok) throw new Error(`OTA-Download: HTTP ${got.status}`);
    const buf = Buffer.from(await got.arrayBuffer());
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (sha !== String(o.sha256).toLowerCase()) throw new Error('OTA-Paket beschädigt (Prüfsumme)');
    fsImpl.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, `download-${now()}.tmp`);
    fsImpl.writeFileSync(tmp, buf);
    fsImpl.renameSync(tmp, bundleFile(o.version));
    state.pending = o.version;
    save();
    log(`ota ${o.version} downloaded, waiting for restart`);
    return state.pending;
  }

  /** Makes the pending bundle the active one; returns the index.html to load (or null). */
  function apply() {
    if (!state.pending || !usable(state.pending)) {
      state.pending = null;
      save();
      return null;
    }
    const old = active;
    state.current = state.pending;
    state.pending = null;
    active = state.current;
    save();
    // Keep the previous bundle as fallback material only while it is the one we come from.
    for (const f of safeList(fsImpl, dir)) {
      const m = /^renderer-(.+)\.asar$/.exec(f);
      if (m && m[1] !== active && m[1] !== old) fsImpl.rmSync(path.join(dir, f), { force: true });
    }
    return path.join(distDir(), 'index.html');
  }

  return {
    distDir,
    indexFile: () => path.join(distDir(), 'index.html'),
    version,
    pending: () => (usable(state.pending) ? state.pending : null),
    beginBoot,
    ready,
    check,
    apply,
  };
}

function safeList(fsImpl, dir) {
  try {
    return fsImpl.readdirSync(dir);
  } catch {
    return [];
  }
}

module.exports = { OTA_RUNTIME, BOOT_TIMEOUT_MS, compareVersions, signedText, verifySignature, createOta };
