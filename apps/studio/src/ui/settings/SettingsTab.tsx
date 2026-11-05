// Settings: stream destinations (several at once), picture/sound, recording folder, ffmpeg.
// Keys and SRT addresses live only in localStorage (show state); they are never logged
// and only ever shown in password fields (with an explicit "Zeigen").

import { useEffect, useRef, useState } from 'react';
import { useShow } from '../../state/store';
import type { Destination, OutputTarget, Settings } from '../../state/types';
import { errorText } from '../engine';
import { useOnAir } from '../studio';
import { clean, destinationProblem, enabledDestinations, newDestination, PRESETS, uploadEstimate, type PresetId } from './destinations';
import { ReconnectButton } from './ReconnectButton';
import { trackTest } from './test-runs';

const KBPS_MIN = 2500;
const KBPS_MAX = 9000;
const TEST_SECONDS = 20;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** Password field with a show/hide toggle. */
function SecretInput({
  value,
  onChange,
  placeholder,
  label,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  disabled?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="with-btn">
      <input
        className="input"
        type={shown ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        aria-label={label}
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(clean(e.target.value))}
        onBlur={() => setShown(false)}
      />
      <button className="btn ghost" type="button" onClick={() => setShown((v) => !v)} aria-pressed={shown} disabled={disabled}>
        {shown ? 'Verbergen' : 'Zeigen'}
      </button>
    </div>
  );
}

function AddDestinationMenu({ onPick, onClose }: { onPick: (p: PresetId) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="menu menu-down" ref={ref} role="menu">
      {PRESETS.map((p) => (
        <button key={p.id} className="menu-item" role="menuitem" onClick={() => onPick(p.id)}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

type TestState = { phase: 'idle' } | { phase: 'running'; startedAt: number } | { phase: 'done'; ok: boolean; error?: string };

function DestinationCard({
  d,
  settings,
  onChange,
  onRemove,
  locked,
}: {
  d: Destination;
  settings: Settings;
  onChange: (d: Destination) => void;
  onRemove: () => void;
  locked: boolean;
}) {
  const [test, setTest] = useState<TestState>({ phase: 'idle' });
  const [now, setNow] = useState(Date.now());
  const t = d.target;
  const problem = destinationProblem(d);
  const setTarget = (target: OutputTarget) => {
    onChange({ ...d, target });
    if (test.phase === 'done') setTest({ phase: 'idle' });
  };

  useEffect(() => {
    if (test.phase !== 'running') return;
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, [test.phase]);

  const runTest = async () => {
    if (t.kind === 'none') return;
    setTest({ phase: 'running', startedAt: Date.now() });
    try {
      const r = await trackTest(
        window.studio.output.test({
          destination: t,
          fps: settings.fps,
          videoKbps: settings.videoKbps,
          audioKbps: settings.audioKbps,
          ffmpegPath: settings.ffmpegPath,
        }),
      );
      setTest({ phase: 'done', ok: r.ok, error: r.error });
    } catch (e) {
      setTest({ phase: 'done', ok: false, error: errorText(e) });
    }
  };

  return (
    <div className={`dest${d.enabled ? '' : ' off'}`}>
      <div className="dest-head">
        <label className="dest-toggle">
          <input type="checkbox" checked={d.enabled} onChange={(e) => onChange({ ...d, enabled: e.target.checked })} />
          <span>{d.enabled ? 'An' : 'Aus'}</span>
        </label>
        <input
          className="input dest-name"
          aria-label="Name des Ziels"
          value={d.name}
          disabled={locked}
          onChange={(e) => onChange({ ...d, name: e.target.value })}
        />
        <span className="dest-kind">{t.kind === 'srt' ? 'SRT' : t.kind === 'rtmp' ? (t.url.startsWith('rtmps') ? 'RTMPS' : 'RTMP') : '–'}</span>
        <button className="btn ghost" onClick={onRemove} disabled={locked}>
          Entfernen
        </button>
      </div>

      {t.kind === 'srt' && (
        <label className="field">
          <span>SRT-Adresse</span>
          <SecretInput disabled={locked} label="SRT-Adresse" placeholder="srt://live.cloudflare.com:778?passphrase=…&streamid=…" value={t.url} onChange={(url) => setTarget({ kind: 'srt', url })} />
        </label>
      )}
      {t.kind === 'rtmp' && (
        <div className="grid2">
          <label className="field">
            <span>Server-Adresse</span>
            <input
              className="input"
              spellCheck={false}
              placeholder="rtmps://…"
              disabled={locked}
              value={t.url}
              onChange={(e) => setTarget({ ...t, url: clean(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Streamschlüssel</span>
            <SecretInput disabled={locked} label="Streamschlüssel" value={t.key} onChange={(key) => setTarget({ ...t, key })} />
          </label>
        </div>
      )}

      <div className="dest-foot">
        <button className="btn" onClick={runTest} disabled={locked || !!problem || test.phase === 'running'} title={`${TEST_SECONDS} s Testbild nur an dieses Ziel`}>
          {test.phase === 'running' ? `Teste… ${Math.min(TEST_SECONDS, Math.round((now - test.startedAt) / 1000))} / ${TEST_SECONDS} s` : 'Testen'}
        </button>
        {problem && d.enabled && <span className="hint">{problem}</span>}
        {!problem && test.phase === 'idle' && <span className="hint">Sendet {TEST_SECONDS} s Testbild mit Ton nur an dieses Ziel.</span>}
        {test.phase === 'done' && test.ok && <span className="ok-text">Test erfolgreich: {TEST_SECONDS} s gesendet. Bild beim Ziel prüfen.</span>}
        {test.phase === 'done' && !test.ok && <span className="err-text">Test fehlgeschlagen: {test.error ?? 'unbekannter Fehler'}</span>}
      </div>
    </div>
  );
}

type FfmpegCheck = { ok: boolean; version: string | null; srt: boolean; videotoolbox: boolean; error?: string } | 'running' | null;

export function SettingsTab() {
  const { state, dispatch } = useShow();
  const air = useOnAir();
  const s = state.settings;
  const locked = air.phase !== 'off';
  const streaming = air.phase === 'on' && !air.status?.recordOnly;
  const set = (patch: Partial<Settings>) => dispatch({ type: 'updateSettings', patch });
  const [menu, setMenu] = useState(false);
  const [check, setCheck] = useState<FfmpegCheck>(null);

  const setDest = (d: Destination) => set({ destinations: s.destinations.map((x) => (x.id === d.id ? d : x)) });
  const removeDest = (id: string) => set({ destinations: s.destinations.filter((x) => x.id !== id) });
  const addDest = (p: PresetId) => {
    setMenu(false);
    set({ destinations: [...s.destinations, newDestination(p)] });
  };

  const n = enabledDestinations(s.destinations).length;
  const up = uploadEstimate(n, s.videoKbps, s.audioKbps);

  const runCheck = async () => {
    setCheck('running');
    try {
      setCheck(await window.studio.ffmpeg.check(s.ffmpegPath));
    } catch (e) {
      setCheck({ ok: false, version: null, srt: false, videotoolbox: false, error: errorText(e) });
    }
  };

  return (
    <div className="settings">
      <h2>Einstellungen</h2>
      <p>Wohin gesendet wird und wo die Aufnahme landet. Änderungen gelten ab dem nächsten Sendestart.</p>
      {locked && (
        <div className="locked">
          Während der Sendung gesperrt. Nur Ziele lassen sich an- und ausschalten; das wirkt erst mit „Ziel neu verbinden“.
        </div>
      )}

      {/* Outside the locked fieldset: on air, the destination on/off toggles stay usable. */}
      <section>
        <h3>Sendeziele</h3>
        <span className="hint">
          Alle eingeschalteten Ziele bekommen gleichzeitig dasselbe Bild. Jedes Ziel braucht seinen eigenen Schlüssel: denselben
          Schlüssel nie zweimal verwenden (auch nicht parallel in OBS).
        </span>
        {s.destinations.map((d) => (
          <DestinationCard key={d.id} d={d} settings={s} locked={locked} onChange={setDest} onRemove={() => removeDest(d.id)} />
        ))}
        <div className="dest-add">
          <button className="btn" onClick={() => setMenu((v) => !v)} aria-expanded={menu} disabled={locked}>
            + Ziel
          </button>
          {menu && !locked && <AddDestinationMenu onPick={addDest} onClose={() => setMenu(false)} />}
          {streaming && <ReconnectButton />}
        </div>
        {streaming && (
          <span className="hint">
            Tempo fällt gegen 0 oder ein Ziel ist ausgefallen: das Ziel ausschalten, dann „Ziel neu verbinden“. Alle Ziele sind
            dabei kurz unterbrochen.
          </span>
        )}
        {n === 0 ? (
          <span className="hint">Kein Ziel eingeschaltet: „Nur aufnehmen“ speichert die Sendung lokal, ohne zu streamen.</span>
        ) : (
          <span className={up.warn ? 'warn-text' : 'hint'}>
            ≈ {n} × ({s.videoKbps} + {s.audioKbps}) kbit/s = {up.mbit.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mbit/s Upload
            nötig.
            {up.warn && ` ${n === 2 ? 'Zwei Ziele brauchen' : `${n} Ziele brauchen`} ${n === 2 ? 'doppelte' : `${n}-fache`} Upload-Bandbreite.`}
          </span>
        )}
      </section>

      <fieldset disabled={locked} style={{ all: 'unset', display: 'block' }}>
        <section>
          <h3>Bild und Ton</h3>
          <div className="grid2">
            <div className="field">
              <span>Bildrate</span>
              <div className="seg" role="group" aria-label="Bildrate">
                {([30, 50] as const).map((f) => (
                  <button key={f} aria-pressed={s.fps === f} onClick={() => set({ fps: f })}>
                    {f} fps
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>Video-Bitrate: {s.videoKbps} kbit/s</span>
              <input
                type="range"
                min={KBPS_MIN}
                max={KBPS_MAX}
                step={250}
                value={clamp(s.videoKbps, KBPS_MIN, KBPS_MAX)}
                onChange={(e) => set({ videoKbps: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>Audio-Bitrate</span>
              <select className="input" value={s.audioKbps} onChange={(e) => set({ audioKbps: Number(e.target.value) })}>
                {[128, 160, 192, 256].map((k) => (
                  <option key={k} value={k}>
                    {k} kbit/s
                  </option>
                ))}
              </select>
            </label>
          </div>
          <span className="hint">1080p mit 30 fps ist Standard. 50 fps nur bei viel Bewegung und genug Upload.</span>
        </section>

        <section>
          <h3>Aufnahme</h3>
          <label className="field">
            <span>Ordner</span>
            <div className="with-btn">
              <input className="input" spellCheck={false} value={s.recordDir} onChange={(e) => set({ recordDir: e.target.value })} />
              <button
                className="btn"
                onClick={async () => {
                  const dir = await window.studio.dialog.pickFolder();
                  if (dir) set({ recordDir: dir });
                }}
              >
                Wählen…
              </button>
            </div>
          </label>
          <span className="hint">Jede Sendung wird zusätzlich lokal als .mkv gespeichert, auch bei „Nur aufnehmen“.</span>
        </section>

        <section>
          <h3>Technik</h3>
          <label className="field">
            <span>ffmpeg-Pfad</span>
            <div className="with-btn">
              <input
                className="input"
                spellCheck={false}
                value={s.ffmpegPath}
                onChange={(e) => {
                  set({ ffmpegPath: e.target.value });
                  setCheck(null);
                }}
              />
              <button className="btn" onClick={runCheck} disabled={check === 'running'}>
                {check === 'running' ? 'Prüfe…' : 'Prüfen'}
              </button>
            </div>
          </label>
          {check && check !== 'running' && (
            <span className={check.ok ? 'ok-text' : 'err-text'}>
              {check.error
                ? `ffmpeg nicht nutzbar: ${check.error}`
                : `ffmpeg ${check.version ?? '?'} · SRT ${check.srt ? 'ja' : 'fehlt'} · VideoToolbox ${check.videotoolbox ? 'ja' : 'fehlt'}${
                    check.ok ? '' : ' (brew install ffmpeg-full)'
                  }`}
            </span>
          )}
        </section>
      </fieldset>
    </div>
  );
}
