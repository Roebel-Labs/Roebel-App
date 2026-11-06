'use strict';
// Makes the stock Electron.app expose the iPhone (Continuity Camera) to getUserMedia.
// macOS hides Continuity Camera devices unless NSCameraUseContinuityCameraDeviceType is in the Info.plist of the app
// AND the helper apps (video capture runs in a helper). Editing a plist breaks the signature, so we re-sign ad hoc.
// Idempotent: does nothing when every plist has the keys and the signature verifies.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REQUIRED = {
  NSCameraUseContinuityCameraDeviceType: true,
  NSCameraUsageDescription: 'Ortis Studio nutzt die Kamera für den Livestream.',
  NSMicrophoneUsageDescription: 'Ortis Studio nutzt das Mikrofon für den Livestream.',
};

/** Pure: which required keys are absent or wrong in a plist (as a plain JS object)? */
function missingKeys(plist, required = REQUIRED) {
  return Object.keys(required).filter((k) => {
    const v = plist ? plist[k] : undefined;
    return v !== required[k];
  });
}

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function readPlist(file) {
  return JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file]));
}

function plistFiles(appPath) {
  const out = [path.join(appPath, 'Contents', 'Info.plist')];
  const fw = path.join(appPath, 'Contents', 'Frameworks');
  if (fs.existsSync(fw)) {
    for (const n of fs.readdirSync(fw)) {
      if (/^Electron Helper.*\.app$/.test(n)) out.push(path.join(fw, n, 'Contents', 'Info.plist'));
    }
  }
  return out.filter((f) => fs.existsSync(f));
}

function signatureValid(appPath) {
  try {
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath]);
    return true;
  } catch {
    return false;
  }
}

function main() {
  if (process.platform !== 'darwin') return console.log('[studio] Continuity Camera patch: skipped (not macOS)');
  let appPath;
  try {
    const dist = path.join(path.dirname(require.resolve('electron')), 'dist');
    appPath = path.join(dist, 'Electron.app');
  } catch {
    return console.log('[studio] Continuity Camera patch: electron not installed yet, skipped');
  }
  if (!fs.existsSync(appPath)) return console.log('[studio] Continuity Camera patch: Electron.app not found, skipped');

  const todo = plistFiles(appPath)
    .map((f) => ({ f, missing: missingKeys(readPlist(f)) }))
    .filter((x) => x.missing.length);
  if (!todo.length && signatureValid(appPath)) return console.log('[studio] Continuity Camera patch: already applied');

  for (const { f, missing } of todo) {
    for (const k of missing) {
      const v = REQUIRED[k];
      const args = typeof v === 'boolean' ? ['-bool', v ? 'YES' : 'NO'] : ['-string', v];
      run('/usr/bin/plutil', ['-replace', k, ...args, f]);
    }
  }
  run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appPath]);
  if (!signatureValid(appPath)) throw new Error('codesign verification failed after patch');
  console.log(`[studio] Continuity Camera patch: ${todo.length} plist(s) updated, re-signed ad hoc` +
    ' (macOS may ask for camera/microphone permission again)');
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    // Never break an install/start over this; the iPhone just stays hidden.
    console.warn('[studio] Continuity Camera patch failed:', e.message);
  }
}

module.exports = { missingKeys, REQUIRED, plistFiles };
