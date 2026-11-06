#!/usr/bin/env node
'use strict';
// Downloads the ffmpeg that packaged builds ship (electron-builder copies
// vendor/ffmpeg/<os>/ into resources/ffmpeg/). Usage:
//   node scripts/fetch-ffmpeg.cjs mac|win            download, check sha256, unpack, verify
//   node scripts/fetch-ffmpeg.cjs mac|win --pin      print the sha256 of a fresh download (to update SOURCES)
// Both builds are GPL (libx264, libsrt); the license file travels with the binary and the
// Hilfe page names the source, as the GPL asks.

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SOURCES = {
  // Gyan Doshi's Windows "full" release build: libsrt, NVENC, QSV, AMF, libx264.
  win: {
    url: 'https://github.com/GyanD/codexffmpeg/releases/download/7.1.1/ffmpeg-7.1.1-full_build.zip',
    sha256: 'd760e1b3574402ed18b4865851f87d87e73965a982e6453212df8621fed1c508',
    binary: 'ffmpeg.exe',
    // paths inside the zip
    entries: { binary: 'ffmpeg-7.1.1-full_build/bin/ffmpeg.exe', license: 'ffmpeg-7.1.1-full_build/LICENSE' },
  },
  // Martin Riedl's static macOS arm64 release build: libsrt, VideoToolbox, libx264, no Homebrew dylibs.
  mac: {
    // Redirects to the newest release build; the sha256 pin stops an unnoticed version change.
    url: 'https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip',
    sha256: 'c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924',
    binary: 'ffmpeg',
    entries: { binary: 'ffmpeg', license: null },
  },
};

const LICENSE_NOTE =
  'This ffmpeg binary is distributed under the GNU General Public License v3.\n' +
  'Source code: https://ffmpeg.org/download.html (version as printed by `ffmpeg -version`).\n';

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function download(url, file) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} ${url}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function verify(bin, osName) {
  // Only a binary for this machine's OS can be run here; a cross-built one is checked on its own OS.
  const runnable = (osName === 'mac' && process.platform === 'darwin') || (osName === 'win' && process.platform === 'win32');
  if (!runnable) return console.log(`[ffmpeg] ${osName} binary not runnable here, verification skipped`);
  const protocols = execFileSync(bin, ['-hide_banner', '-protocols'], { encoding: 'utf8' });
  const encoders = execFileSync(bin, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  const need = osName === 'mac' ? ['h264_videotoolbox', 'libx264'] : ['h264_nvenc', 'h264_qsv', 'h264_amf', 'libx264'];
  if (!/^\s*srt\s*$/m.test(protocols)) throw new Error('ffmpeg lacks SRT');
  if (!/^\s*rtmps\s*$/m.test(protocols)) throw new Error('ffmpeg lacks RTMPS');
  for (const e of need) if (!encoders.includes(e)) throw new Error(`ffmpeg lacks ${e}`);
  if (osName === 'mac') {
    const libs = execFileSync('otool', ['-L', bin], { encoding: 'utf8' });
    if (/\/opt\/homebrew|\/usr\/local\//.test(libs)) throw new Error('ffmpeg links Homebrew libraries (not self-contained)');
  }
  console.log(`[ffmpeg] verified: SRT, RTMPS, ${need.join(', ')}`);
}

async function main() {
  const osName = process.argv[2];
  const pin = process.argv.includes('--pin');
  const src = SOURCES[osName];
  if (!src) throw new Error('usage: fetch-ffmpeg.cjs mac|win [--pin]');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ortis-ffmpeg-'));
  try {
    const zip = path.join(tmp, 'ffmpeg.zip');
    console.log(`[ffmpeg] downloading ${src.url}`);
    await download(src.url, zip);
    const hash = sha256(zip);
    if (pin) return console.log(`[ffmpeg] sha256 ${osName}: ${hash}`);
    if (!src.sha256) throw new Error(`no pinned sha256 for ${osName}; run with --pin and add it to SOURCES`);
    if (hash !== src.sha256) throw new Error(`sha256 mismatch for ${osName}: ${hash}`);
    const out = path.join(__dirname, '..', 'vendor', 'ffmpeg', osName);
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    const unpacked = path.join(tmp, 'x');
    execFileSync('unzip', ['-q', zip, '-d', unpacked]);
    const bin = path.join(out, src.binary);
    fs.copyFileSync(path.join(unpacked, src.entries.binary), bin);
    fs.chmodSync(bin, 0o755);
    const license = src.entries.license ? fs.readFileSync(path.join(unpacked, src.entries.license), 'utf8') + '\n' : '';
    fs.writeFileSync(path.join(out, 'LICENSE.txt'), license + LICENSE_NOTE);
    verify(bin, osName);
    console.log(`[ffmpeg] ${osName} → ${path.relative(process.cwd(), bin)}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(`[ffmpeg] ${e.message}`);
  process.exit(1);
});
