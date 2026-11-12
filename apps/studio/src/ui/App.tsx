import { useEffect, useRef, useState } from 'react';
import { LiveRoomPanel, LiveRoomRuntime } from '../live-room/LiveRoomPanel';
import { useShow } from '../state/store';
import { ConfirmDialog, Dialog } from './Dialog';
import { errorText, maskedTarget, outputConfig } from './engine';
import { hotkeyAction, targetKind } from './hotkeys';
import { hasAudibleChannel } from '../audio/mixer';
import { destinationsProblem, destinationsWarning, enabledDestinations, uploadEstimate } from './settings/destinations';
import { ReconnectButton } from './settings/ReconnectButton';
import { useTestRunning } from './settings/test-runs';
import { SettingsTab } from './settings/SettingsTab';
import { HelpTab } from '../help/HelpTab';
import { HealthBar } from './show/HealthBar';
import { DesignTab } from './design/DesignTab';
import { ShowTab } from './show/ShowTab';
import { flushSponsorLog, useSponsorRuntime } from './show/sponsor-runtime';
import { TableTab } from './table/TableTab';
import { UpdateButton } from './UpdateButton';
import { useLiveRoomStudioSeams } from './live-room-seams';
import { hms, StudioProvider, useOnAir, useStudio, useTick } from './studio';
import { AppsSection } from './shell/AppsSection';
import { WorkspaceSection } from '../workspace/WorkspaceSection';
import { loadSection, saveSection, visibleLiveTab, type LiveTab, type Section } from './shell/nav';
import { Rail } from './shell/Rail';
import { Toolbar } from './shell/Toolbar';
import { onDesktopCommand } from '../workspace/desktop';
import { setCaptureSection } from '../media/gate';
import { isWebBuild } from '../web-shim';
import './theme.css';
import './shell/shell.css';

type Tab = LiveTab;
const TABS: Array<[Tab, string]> = [
  ['show', 'Show'],
  ['design', 'Design'],
  ['table', 'Tabelle'],
  ['liveroom', 'Live-Raum'],
  ['settings', 'Einstellungen'],
  ['help', 'Hilfe'],
];

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
  if (air.status?.recordOnly && st === 'live')
    return (
      <span className="pill on" title="Nur Aufnahme, kein Livestream">
        <span className="pill-dot" />
        AUFNAHME {hms(now - (air.startedAt ?? now))}
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
  const problem = destinationsProblem(s.destinations);
  const warning = destinationsWarning(s.destinations);
  const silent = !hasAudibleChannel(state.audio.channels);
  const enabled = enabledDestinations(s.destinations);
  const recordOnly = enabled.length === 0;
  const up = uploadEstimate(enabled.length, s.videoKbps, s.audioKbps);

  const start = async () => {
    setBusy(true);
    setError(null);
    const cfg = outputConfig(s);
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
      title={recordOnly ? 'Nur aufnehmen?' : 'Auf Sendung gehen?'}
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
              {busy ? (recordOnly ? 'Starte…' : 'Verbinde…') : recordOnly ? 'Aufnahme starten' : 'Jetzt senden'}
            </button>
          )}
        </>
      }
    >
      <p>
        {recordOnly
          ? 'Kein Sendeziel eingeschaltet: Das Programm wird nur lokal aufgenommen, es geht nichts ins Internet.'
          : enabled.length > 1
            ? `Das Live-Bild geht gleichzeitig an ${enabled.length} Ziele und wird lokal aufgenommen.`
            : 'Das Live-Bild geht an das Sendeziel und wird gleichzeitig lokal aufgenommen.'}
      </p>
      <dl className="facts">
        <dt>{enabled.length > 1 ? 'Ziele' : 'Ziel'}</dt>
        <dd>
          {recordOnly
            ? 'Keins (nur Aufnahme)'
            : enabled.map((d) => (
                <div key={d.id}>
                  {d.name}: {maskedTarget(d.target)}
                </div>
              ))}
        </dd>
        <dt>Bild</dt>
        <dd>1920 × 1080, {s.fps} fps</dd>
        <dt>Bitrate</dt>
        <dd>
          Video {s.videoKbps} kbit/s, Audio {s.audioKbps} kbit/s
        </dd>
        {enabled.length > 1 && (
          <>
            <dt>Upload</dt>
            <dd className="warn-text">≈ {up.mbit.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mbit/s ({enabled.length} Ziele)</dd>
          </>
        )}
        <dt>Aufnahme</dt>
        <dd>{s.recordDir}</dd>
      </dl>
      {silent && (
        <div className="dialog-warn">
          Kein Ton: Im Mischpult ist kein Kanal aktiv – der Stream wäre stumm. Show → Audio → „+ Kanal“.
        </div>
      )}
      {!problem && warning && <div className="dialog-warn">{warning}</div>}
      {problem && <div className="dialog-error">{problem}</div>}
      {error && <div className="dialog-error">Start fehlgeschlagen: {error}</div>}
    </Dialog>
  );
}

function OnAirButton({ onOpenSettings }: { onOpenSettings: () => void }) {
  const air = useOnAir();
  const { onAir } = useStudio();
  const { state } = useShow();
  const recordOnlyNext = enabledDestinations(state.settings.destinations).length === 0;
  const recordOnly = !!air.status?.recordOnly;
  const testing = useTestRunning();
  const [dialog, setDialog] = useState<'start' | 'stop' | null>(null);
  if (air.phase === 'off' || air.phase === 'starting') {
    return (
      <>
        <button
          className="btn"
          onClick={() => setDialog('start')}
          disabled={air.phase === 'starting' || testing}
          title={testing ? 'Ein Ziel-Test läuft noch (bis zu 20 s)' : undefined}
        >
          <span className="golive-dot" />
          {testing ? 'Test läuft noch …' : recordOnlyNext ? 'Nur aufnehmen' : 'Auf Sendung gehen'}
        </button>
        {dialog === 'start' && <GoLiveDialog onClose={() => setDialog(null)} onOpenSettings={onOpenSettings} />}
      </>
    );
  }
  return (
    <>
      <button className="btn danger" onClick={() => setDialog('stop')} disabled={air.phase === 'stopping'}>
        {recordOnly ? 'Aufnahme beenden' : 'Sendung beenden'}
      </button>
      {dialog === 'stop' && (
        <ConfirmDialog
          title={recordOnly ? 'Aufnahme beenden?' : 'Sendung beenden?'}
          body={
            <p>
              {recordOnly
                ? 'Die Aufnahme wird sauber abgeschlossen.'
                : 'Der Livestream endet für alle Zuschauer. Die Aufnahme wird sauber abgeschlossen.'}
            </p>
          }
          confirmLabel={recordOnly ? 'Aufnahme beenden' : 'Sendung beenden'}
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

/** A destination dropped out of the tee: ffmpeg never retries it on its own. */
function DestinationBanner() {
  const air = useOnAir();
  const { state } = useShow();
  const failed = air.phase === 'on' ? (air.status?.destinations ?? []).filter((d) => d.state === 'failed') : [];
  // A single destination reconnects on its own (the whole encoder restarts with backoff).
  if (failed.length === 0 || (air.status?.destinations?.length ?? 0) < 2) return null;
  const names = failed.map((f) => state.settings.destinations.find((d) => d.id === f.id)?.name ?? 'Ziel').join(', ');
  return (
    <div className="banner" role="alert">
      <strong>Ziel ausgefallen: {names}</strong>
      <span>
        {failed[0].lastError ?? 'Verbindung verloren'}. Die anderen Ziele laufen weiter. Hängt es weiter: in den Einstellungen
        ausschalten, dann neu verbinden.
      </span>
      <ReconnectButton />
    </div>
  );
}

/** How long the slow-destination banner stays after the last "FIFO queue full". */
const SLOW_BANNER_MS = 10_000;

/** A destination drops packets (its fifo overflows): the stream degrades there without failing. */
function SlowDestinationBanner() {
  const air = useOnAir();
  const now = useTick(1000);
  const at = air.phase === 'on' ? air.status?.slowDestinationAt : undefined;
  if (at === undefined || now - at > SLOW_BANNER_MS) return null;
  return (
    <div className="banner" role="alert">
      <strong>Ziel zu langsam</strong>
      <span>Ein Ziel kommt nicht hinterher – Pakete werden verworfen. Ziel prüfen oder ausschalten.</span>
    </div>
  );
}

/**
 * Ends running transitions, binds hotkeys (only while the Show tab is on screen), and stops the broadcast
 * cleanly on quit. Lives in the shell, so leaving the livestream section never touches a running show.
 */
function useShowRuntime(tab: Tab | null) {
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
      body={<p>Ortis Studio schließt. Der Livestream endet für alle Zuschauer, die Aufnahme wird vorher sauber abgeschlossen.</p>}
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
  const [section, setSectionState] = useState<Section>(() => loadSection());
  const [tab, setTab] = useState<Tab>('show');
  const setSection = (next: Section) => {
    setSectionState(next);
    saveSection(next);
  };
  // Cameras and microphones may open only in the livestream section (or while on air).
  useEffect(() => setCaptureSection(section), [section]);
  useShowRuntime(visibleLiveTab(section, tab));
  useSponsorRuntime();
  const { dispatch } = useShow();
  const { onAir } = useStudio();
  const air = useOnAir();
  useLiveRoomStudioSeams(dispatch, onAir);
  // Tray / shortcut: everything except "Livestream" lands in the workspace (which handles the rest).
  useEffect(
    () =>
      onDesktopCommand((cmd) => {
        if (cmd.kind === 'navigate') setSection(cmd.section === 'live' ? 'live' : 'home');
        else if (cmd.kind !== 'settings') setSection('home');
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <div className="app shell">
      <Toolbar section={section} onSection={setSection} />
      <div className="shell-body">
        <Rail section={section} onSelect={setSection} />
        <div className={`shell-card ${section === 'live' && !isWebBuild() ? 'live-mode' : 'ws-mode'}`}>
          {/* Broadcast alarms stay visible in every section. */}
          <RecordingBanner />
          <DestinationBanner />
          <SlowDestinationBanner />
          {section === 'live' && isWebBuild() && (
            <div className="section web-live">
              <div className="web-live-card">
                <h1>Livestream gibt es in der Desktop-App</h1>
                <p>
                  Kameras umschalten, Einblendungen und gleichzeitig in die Röbel App und auf YouTube senden: dafür braucht
                  Ortis Studio deinen Rechner. Arbeitsbereich und Mini-Apps funktionieren auch hier im Browser.
                </p>
                <a className="w-btn green" href="https://www.roebel.app/studio" target="_blank" rel="noreferrer">
                  Ortis Studio herunterladen
                </a>
              </div>
            </div>
          )}
          {section === 'live' && !isWebBuild() && (
            <div className="section">
              <header className="topbar">
                <span className="wordmark">Livestream</span>
                <nav className="tabs" role="tablist">
                  {TABS.map(([id, label]) => (
                    <button key={id} className="tab" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                      {label}
                    </button>
                  ))}
                </nav>
                <div className="topbar-end">
                  <UpdateButton />
                  <StatusPill />
                  <OnAirButton onOpenSettings={() => setTab('settings')} />
                </div>
              </header>
              <main className="content">
                {tab === 'show' && <ShowTab />}
                {tab === 'design' && <DesignTab />}
                {tab === 'table' && <TableTab />}
                {tab === 'liveroom' && <LiveRoomPanel />}
                {tab === 'settings' && <SettingsTab />}
                {tab === 'help' && <HelpTab />}
              </main>
            </div>
          )}
          {section === 'home' && (
            <div className="section">
              <WorkspaceSection />
            </div>
          )}
          {section === 'apps' && <AppsSection />}
          {/* Livestream health: always in the livestream, elsewhere only while on air (silent-audio alarm). */}
          {((section === 'live' && !isWebBuild()) || air.phase !== 'off') && <HealthBar />}
        </div>
      </div>
      <QuitConfirm />
      {/* Alerts, guests, on-stage sync and the on-air follow keep running in every section and tab. */}
      <LiveRoomRuntime />
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
