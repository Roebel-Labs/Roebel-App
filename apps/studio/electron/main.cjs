'use strict';
// Electron main process for Röbel Studio.

const { app, BrowserWindow, Menu, dialog, ipcMain, powerSaveBlocker, session, systemPreferences } = require('electron');
const path = require('node:path');
const { createOutput } = require('./output.cjs');
const { createOverlayServer } = require('./overlay-server.cjs');

// Program audio (silent track, later the mixer) must run without a click.
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

// The display must not sleep while on air (macOS would throttle the renderer).
let blockerId = null;
function setOnAir(on) {
  if (on && blockerId === null) blockerId = powerSaveBlocker.start('prevent-display-sleep');
  if (!on && blockerId !== null) {
    powerSaveBlocker.stop(blockerId);
    blockerId = null;
  }
}

// The broadcast session as main sees it. Survives a renderer reload/crash so the new page can adopt it.
let session_ = null; // { startedAt, videoKbps } while started

ipcMain.handle('output:start', async (_e, cfg) => {
  await output.start(cfg);
  session_ = { startedAt: Date.now(), videoKbps: cfg.videoKbps };
  setOnAir(true);
});
ipcMain.handle('output:stop', async () => {
  try {
    await output.stop();
  } finally {
    session_ = null;
    setOnAir(false);
  }
});
ipcMain.handle('output:getStatus', () => ({
  started: session_ !== null,
  startedAt: session_ ? session_.startedAt : null,
  videoKbps: session_ ? session_.videoKbps : null,
  status: output.getStatus(),
}));
ipcMain.on('output:chunk', (_e, buf) => output.chunk(buf));

let overlay = null;
ipcMain.handle('media:allow', (_e, absPath) => {
  if (!overlay) throw new Error('Medienserver nicht bereit');
  return overlay.allow(absPath);
});
// Media server listen state for the UI: { ok, port, error } (e.g. port 7311 busy).
ipcMain.handle('overlay:status', () =>
  overlay ? overlay.status() : { ok: false, port: null, error: 'Medienserver nicht gestartet' },
);

const FILE_FILTERS = {
  video: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv'] }],
  image: [{ name: 'Bild', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }],
};

ipcMain.handle('dialog:pickFile', async (_e, kind) => {
  const filters = FILE_FILTERS[kind];
  if (!filters) throw new Error(`unknown file kind ${kind}`);
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
});

ipcMain.handle('dialog:pickFolder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
});

// Whole-app CPU (percent of one core, summed over all processes) + memory.
ipcMain.handle('sys:usage', () => {
  const metrics = app.getAppMetrics();
  let cpu = 0;
  let memKb = 0;
  for (const m of metrics) {
    cpu += m.cpu.percentCPUUsage;
    memKb += m.memory.workingSetSize;
  }
  return { cpu, memMb: memKb / 1024, mainCpu: process.getCPUUsage().percentCPUUsage };
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
    backgroundColor: '#17191C',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      backgroundThrottling: false, // keep rendering/encoding when hidden
    },
  });
  const devUrl = process.env.STUDIO_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // Closing the window while on air needs a confirmation and the graceful stop (final chunk flushed).
  win.on('close', (e) => {
    if (quitting || confirmedQuit || !session_) return;
    e.preventDefault();
    askToEndBroadcast();
  });
  // A crashed renderer must not leave main "on air" with nobody feeding ffmpeg: reload, the new page adopts.
  win.webContents.on('render-process-gone', (_e, details) => {
    log(`renderer gone: ${details.reason}${session_ ? ' (on air, reloading)' : ''}`);
    if (details.reason !== 'clean-exit' && win && !win.isDestroyed()) win.reload();
  });
  win.on('closed', () => {
    win = null;
  });
}

function log(msg) {
  console.log(`${new Date().toISOString()} [main] ${msg}`);
}

// Reload / force reload would silently drop the recorder while main stays on air: dev only.
function setupMenu() {
  const dev = !!process.env.STUDIO_DEV_URL;
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    dev ? { role: 'viewMenu' } : { label: 'Darstellung', submenu: [{ role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Asks the renderer to confirm ending the broadcast; it answers with app:quit-confirmed. */
function askToEndBroadcast() {
  if (!win || win.isDestroyed() || win.webContents.isCrashed()) {
    confirmedQuit = true;
    app.quit();
    return;
  }
  win.show();
  win.focus();
  win.webContents.send('app:confirm-quit');
}

ipcMain.on('app:quit-confirmed', () => {
  confirmedQuit = true;
  app.quit();
});

app.whenReady().then(() => {
  setupPermissions();
  setupMenu();
  overlay = createOverlayServer({
    userDataDir: app.getPath('userData'),
    log: (msg) => console.log(`${new Date().toISOString()} [overlay] ${msg}`),
  });
  overlay.start().catch((e) => console.log(`${new Date().toISOString()} [overlay] start failed: ${e.message}`));
  createWindow();
  // Never block window creation on the macOS permission dialog.
  void askMacMediaAccess();
});

// Quit: while on air the operator confirms first (Cmd+Q, window close). Then the renderer
// stops its MediaRecorder (final chunk flushed), then ffmpeg + the recording file stop.
// Waits at most QUIT_GRACE_MS for the renderer and QUIT_HARD_CAP_MS overall.
const QUIT_GRACE_MS = 3000;
const QUIT_HARD_CAP_MS = 5000;
let quitting = false;
let confirmedQuit = false;
app.on('before-quit', (e) => {
  if (quitting) return;
  e.preventDefault();
  if (session_ && !confirmedQuit && win && !win.isDestroyed()) {
    askToEndBroadcast();
    return;
  }
  quitting = true;
  const cap = setTimeout(() => {
    log('quit took too long, exiting');
    setOnAir(false);
    app.exit(0);
  }, QUIT_HARD_CAP_MS);
  const rendererDone = new Promise((resolve) => {
    if (!win || win.isDestroyed()) return resolve();
    const timer = setTimeout(resolve, QUIT_GRACE_MS);
    ipcMain.once('app:quit-ready', () => {
      clearTimeout(timer);
      resolve();
    });
    win.webContents.send('app:will-quit');
  });
  rendererDone
    .then(() => Promise.allSettled([output.stop(), overlay ? overlay.stop() : null]))
    .finally(() => {
      clearTimeout(cap);
      session_ = null;
      setOnAir(false);
      app.quit();
    });
});

app.on('window-all-closed', () => app.quit());
