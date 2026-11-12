'use strict';
// Desktop integration (installer ≥ 0.2.0): menu-bar/tray icon, global quick-ask shortcut, screen capture
// into the workspace, and the OS keychain (safeStorage) for the chat session token.
// Main owns none of the chat logic: it only sends commands to the renderer ('desktop:command').

const { Menu, Tray, globalShortcut, nativeImage, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFile } = require('node:child_process');

const QUICK_ASK = 'CommandOrControl+Shift+Space';
const SECRET_KEY_RE = /^[a-z0-9-]{1,64}$/;
const MAX_SECRET_BYTES = 16 * 1024;

/** Encrypted key/value file in userData. Values never leave main unencrypted except to our own renderer. */
function createSecrets({ userDataDir, log }) {
  const file = path.join(userDataDir, 'secrets.json');
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
    } catch {
      return {};
    }
  };
  const write = (obj) => {
    fs.writeFileSync(file, JSON.stringify(obj), { mode: 0o600 });
  };
  const available = () => {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  };
  return {
    get(key) {
      if (!SECRET_KEY_RE.test(key) || !available()) return null;
      const v = read()[key];
      if (typeof v !== 'string') return null;
      try {
        return safeStorage.decryptString(Buffer.from(v, 'base64'));
      } catch (e) {
        log(`secrets: decrypt failed for ${key}: ${e.message}`);
        return null;
      }
    },
    set(key, value) {
      if (!SECRET_KEY_RE.test(key) || typeof value !== 'string' || Buffer.byteLength(value) > MAX_SECRET_BYTES) return false;
      if (!available()) return false;
      const obj = read();
      obj[key] = safeStorage.encryptString(value).toString('base64');
      write(obj);
      return true;
    },
    clear(key) {
      if (!SECRET_KEY_RE.test(key)) return false;
      const obj = read();
      delete obj[key];
      write(obj);
      return true;
    },
  };
}

/** macOS interactive region capture → PNG bytes (null when cancelled). Needs Screen Recording permission. */
function captureRegion() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve(null);
    const file = path.join(os.tmpdir(), `ortis-capture-${Date.now()}.png`);
    execFile('/usr/sbin/screencapture', ['-i', '-x', file], () => {
      try {
        const bytes = fs.readFileSync(file);
        fs.rmSync(file, { force: true });
        resolve(bytes);
      } catch {
        resolve(null); // Esc pressed: no file
      }
    });
  });
}

function createDesktop({ getWindow, showWindow, buildDir, quit, log }) {
  let tray = null;

  const send = (cmd) => {
    const win = showWindow();
    if (win && !win.isDestroyed()) win.webContents.send('desktop:command', cmd);
  };

  const capture = async () => {
    const bytes = await captureRegion();
    if (!bytes) return;
    send({ kind: 'capture', name: 'Bildschirmfoto.png', type: 'image/png', bytes: new Uint8Array(bytes) });
  };

  function menu() {
    const mac = process.platform === 'darwin';
    return Menu.buildFromTemplate([
      { label: 'Ortis Studio öffnen', click: () => showWindow() },
      { type: 'separator' },
      { label: 'Neue Nachricht', accelerator: QUICK_ASK, click: () => send({ kind: 'compose' }) },
      { label: 'Sprachnachricht aufnehmen', click: () => send({ kind: 'dictate' }) },
      ...(mac ? [{ label: 'Bildschirmfoto an Assistenten', click: () => void capture() }] : []),
      { type: 'separator' },
      { label: 'Arbeitsbereich', click: () => send({ kind: 'navigate', section: 'home' }) },
      { label: 'Livestream', click: () => send({ kind: 'navigate', section: 'live' }) },
      { type: 'separator' },
      { label: 'Abmelden', click: () => send({ kind: 'signout' }) },
      { label: 'Ortis Studio beenden', click: () => quit() },
    ]);
  }

  return {
    start() {
      try {
        const icon =
          process.platform === 'darwin'
            ? nativeImage.createFromPath(path.join(buildDir, 'trayTemplate.png'))
            : nativeImage.createFromPath(path.join(buildDir, 'tray-win.png'));
        if (process.platform === 'darwin') icon.setTemplateImage(true);
        tray = new Tray(icon);
        tray.setToolTip('Ortis Studio');
        tray.setContextMenu(menu());
      } catch (e) {
        log(`tray failed: ${e.message}`);
      }
      try {
        if (!globalShortcut.register(QUICK_ASK, () => send({ kind: 'compose' }))) log(`shortcut ${QUICK_ASK} is taken`);
      } catch (e) {
        log(`shortcut failed: ${e.message}`);
      }
    },
    stop() {
      try {
        globalShortcut.unregisterAll();
      } catch {
        /* ignore */
      }
      if (tray) tray.destroy();
      tray = null;
    },
    capture,
    getWindow,
  };
}

module.exports = { createDesktop, createSecrets, QUICK_ASK };
