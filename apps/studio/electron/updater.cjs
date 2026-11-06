'use strict';
// In-app updates. The website publishes the newest release at LATEST_URL:
//   { version, downloads: [{ os: 'win' | 'mac', url, sha256 }] }
// Windows: download the installer, check its sha256, run it silently (/S) and let it start the new
// version (--force-run); the app quits so the files can be replaced. macOS: the app is not signed for
// self-replacement, so the dmg opens in the browser instead. Never while a broadcast is running
// (the caller checks).

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LATEST_URL = 'https://www.roebel.app/studio/latest.json';
// Installers only ever come from the project's GitHub releases.
const ALLOWED_DOWNLOAD = /^https:\/\/(github\.com\/Roebel-Labs\/Roebel-App\/releases\/download\/|objects\.githubusercontent\.com\/|release-assets\.githubusercontent\.com\/)/;

/** -1 / 0 / 1 for dotted numeric versions ("0.1.10" > "0.1.9"). */
function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

const osKey = (platform) => (platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : null);

/** Picks this platform's download from latest.json; null when there is none or it is not newer. */
function pickUpdate(latest, currentVersion, platform) {
  const key = osKey(platform);
  if (!latest || typeof latest.version !== 'string' || !Array.isArray(latest.downloads) || !key) return null;
  if (compareVersions(latest.version, currentVersion) <= 0) return null;
  const d = latest.downloads.find((x) => x && x.os === key && typeof x.url === 'string');
  if (!d || !ALLOWED_DOWNLOAD.test(d.url)) return null;
  return { version: latest.version, url: d.url, sha256: typeof d.sha256 === 'string' ? d.sha256.toLowerCase() : null, os: key };
}

async function checkForUpdate({ currentVersion, platform, fetchImpl = fetch }) {
  const res = await fetchImpl(LATEST_URL, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`Update-Prüfung: HTTP ${res.status}`);
  return pickUpdate(await res.json(), currentVersion, platform);
}

/** Streams the installer to the temp folder and verifies its sha256. onProgress(0..1). */
async function downloadInstaller(update, { onProgress = () => {}, fetchImpl = fetch } = {}) {
  if (!update.sha256) throw new Error('Kein Prüfwert für das Update – bitte von roebel.app/studio laden');
  const res = await fetchImpl(update.url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const file = path.join(os.tmpdir(), `Ortis-Studio-${update.version}-setup.exe`);
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(file);
  let got = 0;
  try {
    for await (const chunk of res.body) {
      hash.update(chunk);
      got += chunk.length;
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      if (total) onProgress(got / total);
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  if (hash.digest('hex') !== update.sha256) {
    fs.rmSync(file, { force: true });
    throw new Error('Update-Datei beschädigt (Prüfsumme falsch) – bitte erneut versuchen');
  }
  return file;
}

module.exports = { LATEST_URL, compareVersions, pickUpdate, checkForUpdate, downloadInstaller };
