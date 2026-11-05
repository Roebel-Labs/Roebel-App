'use strict';
// Electron main process for Röbel Studio.

const { app, BrowserWindow, ipcMain, session, systemPreferences } = require('electron');
const path = require('node:path');
const { createOutput } = require('./output.cjs');
const { createOverlayServer } = require('./overlay-server.cjs');

// Program audio (e.g. the spike's oscillator) must run without a click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null;

const output = createOutput({
  sendStatus: (s) => {
    if (win && !win.isDestroyed()) win.webContents.send('output:status', s);
  },
  onNeedHeader: () => {
    if (win && !win.isDestroyed()) win.webContents.send('output:need-header');
  },
  log: (msg) => console.log(`${new Date().toISOString()} [output] ${msg}`),
});

ipcMain.handle('output:start', (_e, cfg) => output.start(cfg));
ipcMain.handle('output:stop', () => output.stop());
ipcMain.on('output:chunk', (_e, buf) => output.chunk(buf));

let overlay = null;
ipcMain.handle('media:allow', (_e, absPath) => {
  if (!overlay) throw new Error('Medienserver nicht bereit');
  return overlay.allow(absPath);
});

// Only our own page may use cameras/microphones.
function isOwnOrigin(url) {
  if (!url) return false;
  const devUrl = process.env.STUDIO_DEV_URL;
  try {
    if (devUrl && new URL(url).origin === new URL(devUrl).origin) return true;
  } catch {
    return false;
  }
  return url.startsWith('file://');
}

function setupPermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    const url = (details && details.requestingUrl) || wc.getURL();
    cb(permission === 'media' && isOwnOrigin(url));
  });
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin) => {
    if (permission !== 'media') return false;
    return isOwnOrigin(requestingOrigin || (wc && wc.getURL()));
  });
}

async function askMacMediaAccess() {
  if (process.platform !== 'darwin') return;
  for (const kind of ['camera', 'microphone']) {
    try {
      if (systemPreferences.getMediaAccessStatus(kind) !== 'granted') {
        const ok = await systemPreferences.askForMediaAccess(kind);
        console.log(`${new Date().toISOString()} [media] macOS ${kind} access: ${ok ? 'granted' : 'denied'}`);
      }
    } catch (e) {
      console.log(`${new Date().toISOString()} [media] macOS ${kind} access check failed: ${e.message}`);
    }
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 1000,
    title: 'Röbel Studio',
    backgroundColor: '#111111',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: false, // preload needs ipcRenderer + process.env
      nodeIntegration: false,
      backgroundThrottling: false, // keep rendering/encoding when hidden
    },
  });
  const devUrl = process.env.STUDIO_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // TEMPORARY (spike): STUDIO_SPIKE_MINIMIZE=<ms> minimises the window after load to measure hidden-window fps.
  const minimizeMs = Number(process.env.STUDIO_SPIKE_MINIMIZE) || 0;
  if (minimizeMs) {
    win.webContents.once('did-finish-load', () =>
      setTimeout(() => {
        if (!win) return;
        win.minimize();
        setInterval(() => win && console.log(`[spike] main: minimized=${win.isMinimized()} visible=${win.isVisible()}`), 10000);
      }, minimizeMs),
    );
  }
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(() => {
  setupPermissions();
  overlay = createOverlayServer({
    userDataDir: app.getPath('userData'),
    log: (msg) => console.log(`${new Date().toISOString()} [overlay] ${msg}`),
  });
  overlay.start().catch((e) => console.log(`${new Date().toISOString()} [overlay] start failed: ${e.message}`));
  createWindow();
  // Never block window creation on the macOS permission dialog.
  void askMacMediaAccess();
});

let quitting = false;
app.on('before-quit', (e) => {
  if (quitting) return;
  quitting = true;
  e.preventDefault();
  Promise.allSettled([output.stop(), overlay ? overlay.stop() : null]).finally(() => app.quit());
});

app.on('window-all-closed', () => app.quit());
