'use strict';
// Electron main process for Ortis Studio.

const { app, BrowserWindow, Menu, dialog, ipcMain, powerSaveBlocker, session, shell, systemPreferences } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { resolveUserDataDir } = require('./userdata.cjs');
const { checkFfmpeg, createOutput, resolveEncoder, testDestination } = require('./output.cjs');
const { bundledFfmpegPath, resolveFfmpegPath } = require('./ffmpeg-path.cjs');
const { usableDestinations } = require('./ffmpeg-args.cjs');
const { createOverlayServer } = require('./overlay-server.cjs');
const { appendAirLog } = require('./airlog.cjs');

// Product name + data folder. Electron derives userData from the app name; the studio used to be
// '@roebel/studio'. Existing installs keep their saved show (localStorage) by staying on the old folder.
app.setName('Ortis Studio');
{
  const dir = resolveUserDataDir({ appData: app.getPath('appData'), // 'in use' = holds a saved profile (a stray empty folder must not hide the legacy data)
    exists: (p) => fs.existsSync(path.join(p, 'Local Storage')) });
  if (dir !== path.join(app.getPath('appData'), 'Ortis Studio')) {
    app.setPath('userData', dir);
    console.log(`${new Date().toISOString()} [main] using legacy data folder ${dir}`);
  }
}

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

// "Testen" run in progress: { abort: AbortController, done: Promise } | null.
let test_ = null;
let starting = false;

/**
 * Privileged IPC only from our own window's top frame: never from a child window,
 * an iframe or a page that is not ours (those could spawn ffmpeg or serve any file).
 */
function isMainFrame(e) {
  if (!win || win.isDestroyed() || e.sender !== win.webContents) return false;
  const f = e.senderFrame;
  if (!f) return false;
  const main = win.webContents.mainFrame;
  const same = f === main || (f.processId === main.processId && f.routingId === main.routingId);
  return same && isOwnOrigin(f.url);
}

function guard(channel, e) {
  if (isMainFrame(e)) return;
  log(`rejected ${channel} from a foreign frame (${(e.senderFrame && e.senderFrame.url) || 'unknown'})`);
  throw new Error('forbidden');
}

// The ffmpeg binary to run for a Settings value (bundled one if that path is missing).
function ffmpegFor(configured) {
  const bundled = bundledFfmpegPath({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath });
  return resolveFfmpegPath(configured, { bundled });
}

// ffmpeg path + probed H.264 encoder for a show or a test; throws a German message if none works.
async function encoderSetup(configured) {
  const { path: ffmpegPath } = ffmpegFor(configured);
  const encoder = await resolveEncoder(ffmpegPath);
  if (!encoder) throw new Error('Kein funktionierender H.264-Encoder (Einstellungen → ffmpeg prüfen)');
  return { ffmpegPath, encoder };
}

ipcMain.handle('output:start', async (e, rawCfg) => {
  guard('output:start', e);
  starting = true;
  try {
    // Going live kills a running test first: the same key must never be pushed twice.
    if (test_) {
      log('output:start while a destination test runs: aborting the test');
      test_.abort.abort();
      await Promise.race([test_.done, new Promise((r) => setTimeout(r, 2000))]);
    }
    // Record-only (no destination) runs no ffmpeg, so a missing encoder only blocks a live start.
    // It is still resolved then: a destination switched on later reconnects with it.
    const live = usableDestinations(rawCfg).length > 0;
    let cfg = rawCfg;
    try {
      cfg = { ...rawCfg, ...(await encoderSetup(rawCfg.ffmpegPath)) };
      log(`encoder ${cfg.encoder} via ${cfg.ffmpegPath}`);
    } catch (err) {
      if (live) throw err;
    }
    await output.start(cfg);
    session_ = { startedAt: Date.now(), videoKbps: cfg.videoKbps };
    setOnAir(true);
  } finally {
    starting = false;
  }
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
// "Ziel neu verbinden": restart the encoder so failed destinations reconnect (brief gap on all).
// The renderer sends the destinations currently switched on, so a hung one can be dropped.
ipcMain.handle('output:reconnect', (_e, cfg) => output.reconnect(cfg && Array.isArray(cfg.destinations) ? cfg.destinations : undefined));

// "Testen": 20 s test pattern to one destination; one at a time, never during a show
// (the same key would collide with the live stream). The result never contains the key.
ipcMain.handle('output:test', async (e, req) => {
  guard('output:test', e);
  if (session_ || starting) return { ok: false, error: 'Während der Sendung nicht möglich' };
  if (test_) return { ok: false, error: 'Es läuft bereits ein Test' };
  let setup;
  try {
    setup = await encoderSetup(req.ffmpegPath);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const abort = new AbortController();
  const run = testDestination({
    destination: req.destination,
    fps: req.fps,
    videoKbps: req.videoKbps,
    audioKbps: req.audioKbps,
    ffmpegPath: setup.ffmpegPath,
    encoder: setup.encoder,
    seconds: 20,
    signal: abort.signal,
    log: (msg) => console.log(`${new Date().toISOString()} [test] ${msg}`),
  });
  test_ = { abort, done: run };
  try {
    return await run;
  } finally {
    test_ = null;
  }
});
ipcMain.handle('ffmpeg:check', async (_e, configured) => {
  const { path: ffmpegPath, source } = ffmpegFor(String(configured || ''));
  return { ...(await checkFfmpeg(ffmpegPath)), path: ffmpegPath, source };
});

// Sponsor air-time log (append-only JSONL in the recording folder); never rejects.
ipcMain.handle('fs:appendAirLog', (e, payload) => {
  guard('fs:appendAirLog', e);
  return appendAirLog(payload);
});

let overlay = null;
ipcMain.handle('media:allow', (e, absPath) => {
  guard('media:allow', e);
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

ipcMain.handle('dialog:pickFile', async (e, kind) => {
  guard('dialog:pickFile', e);
  const filters = FILE_FILTERS[kind];
  if (!filters) throw new Error(`unknown file kind ${kind}`);
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
});

ipcMain.handle('dialog:pickFolder', async (e) => {
  guard('dialog:pickFolder', e);
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
});

// Help links: only http(s) ever leaves the app (never file:, javascript:, custom schemes).
ipcMain.handle('shell:openExternal', async (e, url) => {
  guard('shell:openExternal', e);
  let u;
  try {
    u = new URL(String(url));
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  await shell.openExternal(u.href);
  return true;
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
    title: 'Ortis Studio',
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
  // The page must never be replaced: a dropped file or a stray link would unload the renderer
  // (MediaRecorder dies → dead stream). In-page #hash links and win.reload() do not fire will-navigate;
  // a renderer-side reload of our own page does (Vite dev full reload) and stays allowed: main keeps
  // the session and the reloaded page adopts it, as after a crash.
  const noHash = (u) => String(u).split('#')[0];
  win.webContents.on('will-navigate', (e, url) => {
    if (noHash(url) === noHash(win.webContents.getURL())) return;
    e.preventDefault();
    log(`blocked navigation to ${String(url).split('?')[0].slice(0, 120)}`);
  });
  // No child windows (they would inherit the preload): web links open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // Closing the window while on air needs a confirmation and the graceful stop (final chunk flushed).
  win.on('close', (e) => {
    if (quitting || confirmedQuit || !session_) return;
    e.preventDefault();
    askToEndBroadcast();
  });
  // A crashed renderer must not leave main "on air" with nobody feeding ffmpeg: reload, the new page adopts.
  win.webContents.on('render-process-gone', (_e, details) => {
    log(`renderer gone: ${details.reason}${session_ ? ' (on air)' : ''}`);
    if (details.reason === 'clean-exit' || !win || win.isDestroyed()) return;
    if (allowReload(Date.now())) {
      win.reload();
      return;
    }
    // Crash loop: stop reloading, keep the broadcast running, tell the operator.
    log('renderer crash loop, not reloading');
    void dialog.showMessageBox({
      type: 'error',
      message: 'Die Oberfläche ist wiederholt abgestürzt.',
      detail: session_
        ? 'Die Sendung läuft weiter, das Bild bleibt aber stehen. Ortis Studio beenden (⌘Q) schließt die Aufnahme ab.'
        : 'Bitte Ortis Studio neu starten.',
    });
  });
  // A frozen page cannot answer the close confirmation: ask natively instead.
  win.webContents.on('unresponsive', () => {
    log('renderer unresponsive');
    if (confirmPending) void nativeConfirmEnd();
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

// At most RELOAD_MAX automatic reloads per RELOAD_WINDOW_MS after renderer crashes.
const RELOAD_MAX = 3;
const RELOAD_WINDOW_MS = 60_000;
const reloads = [];
function allowReload(now) {
  while (reloads.length && now - reloads[0] > RELOAD_WINDOW_MS) reloads.shift();
  if (reloads.length >= RELOAD_MAX) return false;
  reloads.push(now);
  return true;
}

// The page must acknowledge the close question within this time, or main asks natively
// (frozen page, or a freshly reloaded page whose dialog is not mounted yet).
const CONFIRM_ACK_MS = 4000;
let confirmPending = false;
let confirmTimer = null;
let nativeConfirmOpen = false;

function clearConfirm() {
  confirmPending = false;
  if (confirmTimer) clearTimeout(confirmTimer);
  confirmTimer = null;
}

/** Asks the renderer to confirm ending the broadcast; it acks with app:confirm-shown, answers with app:quit-confirmed. */
function askToEndBroadcast() {
  if (!win || win.isDestroyed() || win.webContents.isCrashed()) {
    confirmedQuit = true;
    app.quit();
    return;
  }
  win.show();
  win.focus();
  if (nativeConfirmOpen) return;
  confirmPending = true;
  win.webContents.send('app:confirm-quit');
  if (!confirmTimer) {
    confirmTimer = setTimeout(() => {
      confirmTimer = null;
      if (confirmPending) void nativeConfirmEnd();
    }, CONFIRM_ACK_MS);
  }
}

async function nativeConfirmEnd() {
  if (nativeConfirmOpen || confirmedQuit) return;
  nativeConfirmOpen = true;
  clearConfirm();
  log('page did not answer the close question, asking natively');
  try {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Abbrechen', 'Sendung beenden'],
      defaultId: 0,
      cancelId: 0,
      message: 'Sendung läuft – wirklich beenden?',
      detail: 'Die Oberfläche reagiert nicht. Der Livestream endet für alle Zuschauer, die Aufnahme wird so sauber wie möglich abgeschlossen.',
    });
    if (response === 1) {
      confirmedQuit = true;
      app.quit();
    }
  } finally {
    nativeConfirmOpen = false;
  }
}

ipcMain.on('app:confirm-shown', () => {
  // The page shows its own dialog: the question is answered there (confirm → app:quit-confirmed,
  // cancel → nothing), so nothing is pending any more and a later 'unresponsive' must not pop
  // a native dialog. The operator may take as long as needed.
  clearConfirm();
});

ipcMain.on('app:quit-confirmed', () => {
  clearConfirm();
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
const OUTPUT_STOP_CAP_MS = 1500;
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
    log('quit took too long, closing the output and exiting');
    // Give ffmpeg + the recording file one short chance to close cleanly.
    Promise.race([output.stop().catch(() => {}), new Promise((r) => setTimeout(r, OUTPUT_STOP_CAP_MS))]).finally(() => {
      setOnAir(false);
      app.exit(0);
    });
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
