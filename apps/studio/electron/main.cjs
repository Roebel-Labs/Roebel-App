'use strict';
// Electron main process for Röbel Studio.

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { createOutput } = require('./output.cjs');

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
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(createWindow);

let quitting = false;
app.on('before-quit', (e) => {
  if (quitting) return;
  quitting = true;
  e.preventDefault();
  output.stop().finally(() => app.quit());
});

app.on('window-all-closed', () => app.quit());
