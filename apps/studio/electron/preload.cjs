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
    onStatus: (cb) => subscribe('output:status', cb),
    // Main asks for a fresh MediaRecorder (new Matroska header) after an ffmpeg restart.
    onNeedHeader: (cb) => subscribe('output:need-header', () => cb()),
  },
  media: {
    // Returns http://127.0.0.1:7311/media/<token> for a local file.
    allow: (absPath) => ipcRenderer.invoke('media:allow', absPath),
  },
  // TEMPORARY (Task 1 spike): dev-only env passthrough for the test-pattern page.
  spike: {
    // STUDIO_SPIKE_AUTOSTART=srt://... or STUDIO_SPIKE_RTMP_URL + STUDIO_SPIKE_RTMP_KEY (secrets via env only).
    autostart: process.env.STUDIO_SPIKE_AUTOSTART || null,
    rtmp: process.env.STUDIO_SPIKE_RTMP_URL
      ? { url: process.env.STUDIO_SPIKE_RTMP_URL, key: process.env.STUDIO_SPIKE_RTMP_KEY || '' }
      : null,
    ffmpegPath: process.env.STUDIO_FFMPEG_PATH || null,
    recordDir: process.env.STUDIO_RECORD_DIR || null,
    // STUDIO_SPIKE_CAMERA=1: program = first camera via createProgramOutput; fps from STUDIO_SPIKE_FPS.
    camera: process.env.STUDIO_SPIKE_CAMERA === '1',
    fps: process.env.STUDIO_SPIKE_FPS === '50' ? 50 : 30,
    // STUDIO_SPIKE_SIMULATE_LOSS=<ms>: end the camera track after that many ms.
    simulateLossMs: Number(process.env.STUDIO_SPIKE_SIMULATE_LOSS) || 0,
  },
});
