// Browser build of Ortis Studio: stands in for the Electron preload bridge (window.studio) so the
// workspace, sign-in, mini apps and settings run in any browser. Broadcasting needs the desktop app
// (bundled ffmpeg), so every output call rejects with a German hint and the Livestream section shows a
// download notice instead of the control room (see isWebBuild()).

import { t } from './i18n';

// Translated when the message is produced, not at load (the language can change at runtime).
const desktopOnly = () => t('Nur in der Desktop-App von Ortis Studio verfügbar.');
const noop = () => {};
const unsub = () => noop;
const reject = () => Promise.reject(new Error(desktopOnly()));

export function isWebBuild(): boolean {
  return (globalThis as { window?: { studio?: { ui?: { platform?: string } } } }).window?.studio?.ui?.platform === 'web';
}

export function installWebShim(): void {
  const w = window as unknown as { studio?: unknown };
  if (w.studio) return; // Electron: the real bridge is there
  w.studio = {
    output: {
      start: reject,
      chunk: noop,
      stop: () => Promise.resolve(),
      reconnect: reject,
      test: () => Promise.resolve({ ok: false, error: desktopOnly() }),
      getStatus: () => Promise.resolve({ started: false }),
      onStatus: unsub,
      onNeedHeader: unsub,
    },
    media: { allow: reject },
    fs: { appendAirLog: () => Promise.resolve({ ok: false, error: desktopOnly() }) },
    overlay: { status: () => Promise.resolve({ ok: false, port: 0, error: desktopOnly() }) },
    ota: { status: () => Promise.resolve({ version: 'web', pending: null }), apply: () => Promise.resolve(false), ready: noop, onPending: unsub },
    update: { check: () => Promise.resolve({ current: 'web', update: null }), install: reject, onProgress: unsub },
    show: { exportPackage: reject, importPackage: reject },
    dialog: { pickFile: () => Promise.resolve(null), pickFiles: () => Promise.resolve([]), pathForFile: () => '', pickFolder: () => Promise.resolve(null) },
    ffmpeg: { check: () => Promise.resolve({ ok: false, error: desktopOnly() }) },
    sys: { usage: () => Promise.resolve({ cpu: 0, memMb: 0 }) },
    shell: {
      openExternal: (url: string) => {
        if (/^https?:\/\//.test(url)) window.open(url, '_blank', 'noopener');
        return Promise.resolve();
      },
    },
    ui: { platform: 'web', glass: false },
    app: { onWillQuit: unsub, quitReady: noop, onConfirmQuit: unsub, confirmShown: noop, confirmQuit: noop },
  };
}
