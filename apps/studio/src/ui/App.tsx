import { useEffect, useRef, useState } from 'react';
import { useShow } from '../state/store';
import type { OutputConfig, Settings } from '../state/types';
import { ConfirmDialog, Dialog } from './Dialog';
import { errorText, maskedTarget } from './engine';
import { hotkeyAction, targetKind } from './hotkeys';
import { SettingsTab } from './SettingsTab';
import { HealthBar } from './show/HealthBar';
import { DesignTab } from './design/DesignTab';
import { ShowTab } from './show/ShowTab';
import { flushSponsorLog, useSponsorRuntime } from './show/sponsor-runtime';
import { TableTab } from './table/TableTab';
import { hms, StudioProvider, useOnAir, useStudio, useTick } from './studio';
import './theme.css';

type Tab = 'show' | 'design' | 'table' | 'settings';
const TABS: Array<[Tab, string]> = [
  ['show', 'Show'],
  ['design', 'Design'],
  ['table', 'Tabelle'],
  ['settings', 'Einstellungen'],
];

function targetProblem(s: Settings): string | null {
  const t = s.target;
  if (t.kind === 'none') return 'Es ist kein Sendeziel eingestellt.';
  if (t.kind === 'srt' && !/^srt:\/\/.+/.test(t.url)) return 'Die SRT-Adresse fehlt oder beginnt nicht mit srt://.';
  if (t.kind === 'rtmp' && !/^rtmps?:\/\/.+/.test(t.url)) return 'Die RTMPS-Adresse fehlt oder beginnt nicht mit rtmps://.';
  if (t.kind === 'rtmp' && !t.key) return 'Der Streamschlüssel fehlt.';
  return null;
}

function StatusPill() {
  const air = useOnAir();
  const now = useTick(500);
  const st = air.status?.state;
  if (air.phase === 'off') return <span className="pill">OFF AIR</span>;
  if (air.phase === 'stopping') return <span className="pill">BEENDE …</span>;
  if (air.phase === 'starting' || st === 'connecting' || !st || st === 'idle') return <span className="pill warn">VERBINDE …</span>;
  if (st === 'reconnecting')
    return (
      <span className="pill warn" title={air.status?.lastError}>
        VERBINDE NEU …
      </span>
    );
  if (st === 'error')
    return (
      <span className="pill err" title={air.status?.lastError}>
        FEHLER <span className="pill-err-text">{air.status?.lastError}</span>
      </span>
    );
  return (
    <span className="pill on">
      <span className="pill-dot" />
      ON AIR {hms(now - (air.startedAt ?? now))}
    </span>
  );
}

function GoLiveDialog({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  const { state } = useShow();
  const { engine, onAir } = useStudio();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = state.settings;
  const problem = targetProblem(s);

  const start = async () => {
    setBusy(true);
    setError(null);
    const cfg: OutputConfig = { ...s };
    try {
      await onAir.start(cfg, engine.program.stream);
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Auf Sendung gehen?"
      onCancel={busy ? () => {} : onClose}
      actions={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy} data-autofocus>
            Abbrechen
          </button>
          {problem ? (
            <button
              className="btn"
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
            >
              Einstellungen öffnen
            </button>
          ) : (
            <button className="btn solid-danger" onClick={start} disabled={busy}>
              {busy ? 'Verbinde…' : 'Jetzt senden'}
            </button>
          )}
        </>
      }
    >
      <p>Das Live-Bild geht an das Sendeziel und wird gleichzeitig lokal aufgenommen.</p>
      <dl className="facts">
        <dt>Ziel</dt>
        <dd>{maskedTarget(s.target)}</dd>
        <dt>Bild</dt>
        <dd>1920 × 1080, {s.fps} fps</dd>
        <dt>Bitrate</dt>
        <dd>
          Video {s.videoKbps} kbit/s, Audio {s.audioKbps} kbit/s
        </dd>
        <dt>Aufnahme</dt>
        <dd>{s.recordDir}</dd>
      </dl>
      {problem && <div className="dialog-error">{problem}</div>}
      {error && <div className="dialog-error">Start fehlgeschlagen: {error}</div>}
    </Dialog>
  );
}

function OnAirButton({ onOpenSettings }: { onOpenSettings: () => void }) {
  const air = useOnAir();
  const { onAir } = useStudio();
  const [dialog, setDialog] = useState<'start' | 'stop' | null>(null);
  if (air.phase === 'off' || air.phase === 'starting') {
    return (
      <>
        <button className="btn" onClick={() => setDialog('start')} disabled={air.phase === 'starting'}>
          <span className="golive-dot" />
          Auf Sendung gehen
        </button>
        {dialog === 'start' && <GoLiveDialog onClose={() => setDialog(null)} onOpenSettings={onOpenSettings} />}
      </>
    );
  }
  return (
    <>
      <button className="btn danger" onClick={() => setDialog('stop')} disabled={air.phase === 'stopping'}>
        Sendung beenden
      </button>
      {dialog === 'stop' && (
        <ConfirmDialog
          title="Sendung beenden?"
          body={<p>Der Livestream endet für alle Zuschauer. Die Aufnahme wird sauber abgeschlossen.</p>}
          confirmLabel="Sendung beenden"
          danger
          onConfirm={() => {
            setDialog(null);
            void onAir.stop();
          }}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  );
}

function RecordingBanner() {
  const air = useOnAir();
  const { onAir } = useStudio();
  const [confirm, setConfirm] = useState(false);
  const err = air.phase === 'on' ? air.status?.recordingError : undefined;
  if (!err) return null;
  return (
    <div className="banner" role="alert">
      <strong>Aufnahme unterbrochen</strong>
      <span>{err}</span>
      <button className="btn" onClick={() => setConfirm(true)}>
        Aufnahme neu starten
      </button>
      {confirm && (
        <ConfirmDialog
          title="Aufnahme neu starten?"
          body={
            <p>
              Die Aufnahme beginnt in einer neuen Datei. Der Livestream verbindet sich dafür kurz neu, die Zuschauer sehen
              eine Unterbrechung von wenigen Sekunden.
            </p>
          }
          confirmLabel="Neu starten"
          onConfirm={() => {
            setConfirm(false);
            void onAir.restartRecorder();
          }}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

/** Ends running transitions, binds hotkeys (Show tab only), and stops the broadcast cleanly on quit. */
function useShowRuntime(tab: Tab) {
  const { state, dispatch } = useShow();
  const { onAir } = useStudio();
  const latest = useRef(state);
  latest.current = state;

  const { startedAt, presetId } = state.transition;
  useEffect(() => {
    if (startedAt === null) return;
    const preset = latest.current.presets.find((p) => p.id === presetId);
    const left = Math.max(0, startedAt + (preset?.durationMs ?? 0) - Date.now());
    const t = setTimeout(() => dispatch({ type: 'transitionDone' }), left + 20);
    return () => clearTimeout(t);
  }, [startedAt, presetId, dispatch]);

  useEffect(() => {
    if (tab !== 'show') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (document.querySelector('.backdrop, .menu')) return; // a dialog or menu has the keyboard
      const a = hotkeyAction({ key: e.key, code: e.code, target: targetKind(e.target), shift: e.shiftKey }, latest.current);
      if (!a || a === 'goLive') return;
      e.preventDefault();
      dispatch(a);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, dispatch]);

  useEffect(
    () =>
      window.studio.app.onWillQuit(() => {
        // Bounded: main's own grace timer still applies; never let the log hold up the quit.
        const logged = Promise.race([flushSponsorLog(), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
        void Promise.all([onAir.stop().catch(() => {}), logged]).finally(() => window.studio.app.quitReady());
      }),
    [onAir],
  );
}

/** Window close / Cmd+Q while on air: main asks, the operator confirms, main then quits gracefully. */
function QuitConfirm() {
  const [open, setOpen] = useState(false);
  useEffect(
    () =>
      window.studio.app.onConfirmQuit(() => {
        setOpen(true);
        window.studio.app.confirmShown();
      }),
    [],
  );
  if (!open) return null;
  return (
    <ConfirmDialog
      title="Sendung läuft – wirklich beenden?"
      body={<p>Röbel Studio schließt. Der Livestream endet für alle Zuschauer, die Aufnahme wird vorher sauber abgeschlossen.</p>}
      confirmLabel="Sendung beenden und schließen"
      danger
      onConfirm={() => {
        setOpen(false);
        window.studio.app.confirmQuit();
      }}
      onCancel={() => setOpen(false)}
    />
  );
}

function Shell() {
  const [tab, setTab] = useState<Tab>('show');
  useShowRuntime(tab);
  useSponsorRuntime();
  return (
    <div className="app">
      <header className="topbar">
        <span className="wordmark">Röbel Studio</span>
        <nav className="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} className="tab" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="topbar-end">
          <StatusPill />
          <OnAirButton onOpenSettings={() => setTab('settings')} />
        </div>
      </header>
      <RecordingBanner />
      <main className="content">
        {tab === 'show' && <ShowTab />}
        {tab === 'design' && <DesignTab />}
        {tab === 'table' && <TableTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
      <HealthBar />
      <QuitConfirm />
    </div>
  );
}

export function App() {
  return (
    <StudioProvider>
      <Shell />
    </StudioProvider>
  );
}
