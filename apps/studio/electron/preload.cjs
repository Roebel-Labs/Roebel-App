'use strict';
// Preload bridge: exposes window.studio to the renderer (contextIsolation on).

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, cb) {
  const listener = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('studio', {
  output: {
    start: (cfg) => ipcRenderer.invoke('output:start', cfg),
    chunk: (buf) => ipcRenderer.send('output:chunk', buf),
    stop: () => ipcRenderer.invoke('output:stop'),
    // Restart the encoder so failed destinations reconnect (all destinations see a short gap).
    // cfg (optional): the destinations switched on right now; a switched-off one is dropped.
    reconnect: (cfg) => ipcRenderer.invoke('output:reconnect', cfg),
    // 20 s test pattern to one destination -> { ok, error? } (never contains the key).
    test: (req) => ipcRenderer.invoke('output:test', req),
    // { started, startedAt, videoKbps, status }: lets a reloaded page adopt a running broadcast.
    getStatus: () => ipcRenderer.invoke('output:getStatus'),
    onStatus: (cb) => subscribe('output:status', cb),
    // Main asks for a fresh MediaRecorder (new Matroska header) after an ffmpeg restart.
    onNeedHeader: (cb) => subscribe('output:need-header', () => cb()),
  },
  media: {
    // Returns http://127.0.0.1:7311/media/<token> for a local file.
    allow: (absPath) => ipcRenderer.invoke('media:allow', absPath),
  },
  fs: {
    // { recordDir, sponsorId, name, startedAt, endedAt } -> { ok, error? }; appends to <recordDir>/werbung-airtime.jsonl.
    appendAirLog: (entry) => ipcRenderer.invoke('fs:appendAirLog', entry),
  },
  overlay: {
    // { ok, port, error }: whether the local media/overlay server is listening.
    status: () => ipcRenderer.invoke('overlay:status'),
  },
  dialog: {
    // Resolves to an absolute path, or null when cancelled.
    pickFile: (kind) => ipcRenderer.invoke('dialog:pickFile', kind),
    pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  },
  ffmpeg: {
    // { ok, version, srt, videotoolbox, error? }
    check: (ffmpegPath) => ipcRenderer.invoke('ffmpeg:check', ffmpegPath),
  },
  sys: {
    usage: () => ipcRenderer.invoke('sys:usage'),
  },
  app: {
    // Main asks the renderer to end the broadcast cleanly before quitting.
    onWillQuit: (cb) => subscribe('app:will-quit', () => cb()),
    quitReady: () => ipcRenderer.send('app:quit-ready'),
    // Main asks "Sendung läuft – wirklich beenden?" (window close / Cmd+Q while on air).
    onConfirmQuit: (cb) => subscribe('app:confirm-quit', () => cb()),
    // Tells main the question is on screen (otherwise main asks natively after a few seconds).
    confirmShown: () => ipcRenderer.send('app:confirm-shown'),
    confirmQuit: () => ipcRenderer.send('app:quit-confirmed'),
  },
});
