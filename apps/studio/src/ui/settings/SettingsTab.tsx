// Settings: stream destinations (several at once), picture/sound, recording folder, ffmpeg.
// Keys and SRT addresses live only in localStorage (show state); they are never logged
// and only ever shown in password fields (with an explicit "Zeigen").

import { useEffect, useRef, useState } from 'react';
import { locale, t } from '../../i18n';
import { replaceStoredShow, useShow } from '../../state/store';
import { serialize } from '../../state/reducer';
import { annotateDevices, relinkDevices } from '../../state/relink';
import type { Destination, OutputTarget, Settings } from '../../state/types';
import { errorText } from '../engine';
import { useOnAir } from '../studio';
import { clean, destinationProblem, destinationsWarning, duplicateIngestProblem, enabledDestinations, newDestination, PRESETS, uploadEstimate, type PresetId } from './destinations';
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
        {shown ? t('Verbergen') : t('Zeigen')}
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
          {t(p.label)}
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
  const tg = d.target;
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
    if (tg.kind === 'none') return;
    setTest({ phase: 'running', startedAt: Date.now() });
    try {
      const r = await trackTest(
        window.studio.output.test({
          destination: tg,
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
          <span>{d.enabled ? t('An') : t('Aus')}</span>
        </label>
        <input
          className="input dest-name"
          aria-label={t('Name des Ziels')}
          value={d.name}
          disabled={locked}
          onChange={(e) => onChange({ ...d, name: e.target.value })}
        />
        <span className="dest-kind">{tg.kind === 'srt' ? 'SRT' : tg.kind === 'rtmp' ? (tg.url.startsWith('rtmps') ? 'RTMPS' : 'RTMP') : '–'}</span>
        <button className="btn ghost" onClick={onRemove} disabled={locked}>
          {t('Entfernen')}
        </button>
      </div>

      {tg.kind === 'srt' && (
        <label className="field">
          <span>{t('SRT-Adresse')}</span>
          <SecretInput disabled={locked} label={t('SRT-Adresse')} placeholder="srt://live.cloudflare.com:778?passphrase=…&streamid=…" value={tg.url} onChange={(url) => setTarget({ kind: 'srt', url })} />
        </label>
      )}
      {tg.kind === 'srt' && tg.url.includes('live.cloudflare.com') && (
        <span className="err-text">
          {t('Cloudflare über SRT stockt in der App (gemessen: Aussetzer bis 35 s). Besser RTMPS: Live-Raum → Zugangsdaten holen → „RTMPS als Ziel übernehmen“.')}
        </span>
      )}
      {tg.kind === 'rtmp' && (
        <div className="grid2">
          <label className="field">
            <span>{t('Server-Adresse')}</span>
            <input
              className="input"
              spellCheck={false}
              placeholder="rtmps://…"
              disabled={locked}
              value={tg.url}
              onChange={(e) => setTarget({ ...tg, url: clean(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>{t('Streamschlüssel')}</span>
            <SecretInput disabled={locked} label={t('Streamschlüssel')} value={tg.key} onChange={(key) => setTarget({ ...tg, key })} />
          </label>
        </div>
      )}

      <div className="dest-foot">
        <button className="btn" onClick={runTest} disabled={locked || !!problem || test.phase === 'running'} title={t('{s} s Testbild nur an dieses Ziel', { s: TEST_SECONDS })}>
          {test.phase === 'running' ? t('Teste… {done} / {total} s', { done: Math.min(TEST_SECONDS, Math.round((now - test.startedAt) / 1000)), total: TEST_SECONDS }) : t('Testen')}
        </button>
        {problem && d.enabled && <span className="hint">{problem}</span>}
        {!problem && test.phase === 'idle' && <span className="hint">{t('Sendet {s} s Testbild mit Ton nur an dieses Ziel.', { s: TEST_SECONDS })}</span>}
        {test.phase === 'done' && test.ok && <span className="ok-text">{t('Test erfolgreich: {s} s gesendet. Bild beim Ziel prüfen.', { s: TEST_SECONDS })}</span>}
        {test.phase === 'done' && !test.ok && <span className="err-text">{t('Test fehlgeschlagen: {error}', { error: test.error ?? t('unbekannter Fehler') })}</span>}
      </div>
    </div>
  );
}

const ENCODER_LABELS: Record<string, string> = {
  h264_videotoolbox: 'VideoToolbox (Apple)',
  h264_nvenc: 'NVENC (NVIDIA)',
  h264_qsv: 'Quick Sync (Intel)',
  h264_amf: 'AMF (AMD)',
  libx264: 'x264 (Software)',
};
const encoderLabel = (e: string) => ENCODER_LABELS[e] ?? e;
const FFMPEG_INSTALL_HINT = navigator.userAgent.includes('Windows')
  ? 'Ortis Studio neu installieren oder ffmpeg.exe mit SRT angeben'
  : 'brew install ffmpeg-full';

type FfmpegCheck = { ok: boolean; version: string | null; srt: boolean; encoder: string | null; softwareEncoder: boolean; path?: string; source?: 'configured' | 'bundled'; error?: string } | 'running' | null;

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
      setCheck({ ok: false, version: null, srt: false, encoder: null, softwareEncoder: false, error: errorText(e) });
    }
  };

  return (
    <div className="settings">
      <h2>{t('Einstellungen')}</h2>
      <p>{t('Wohin gesendet wird und wo die Aufnahme landet. Änderungen gelten ab dem nächsten Sendestart.')}</p>
      {locked && (
        <div className="locked">
          {t('Während der Sendung gesperrt. Nur Ziele lassen sich an- und ausschalten; das wirkt erst mit „Ziel neu verbinden“.')}
        </div>
      )}

      {/* Outside the locked fieldset: on air, the destination on/off toggles stay usable. */}
      <section>
        <h3>{t('Sendeziele')}</h3>
        <span className="hint">
          {t('Alle eingeschalteten Ziele bekommen gleichzeitig dasselbe Bild. Jedes Ziel braucht seinen eigenen Schlüssel: denselben Schlüssel nie zweimal verwenden (auch nicht parallel in OBS).')}
        </span>
        {s.destinations.map((d) => (
          <DestinationCard key={d.id} d={d} settings={s} locked={locked} onChange={setDest} onRemove={() => removeDest(d.id)} />
        ))}
        <div className="dest-add">
          <button className="btn" onClick={() => setMenu((v) => !v)} aria-expanded={menu} disabled={locked}>
            {t('+ Ziel')}
          </button>
          {menu && !locked && <AddDestinationMenu onPick={addDest} onClose={() => setMenu(false)} />}
          {streaming && <ReconnectButton />}
        </div>
        {duplicateIngestProblem(s.destinations) && <div className="dialog-error">{duplicateIngestProblem(s.destinations)}</div>}
        {destinationsWarning(s.destinations) && <div className="dialog-warn">{destinationsWarning(s.destinations)}</div>}
        {streaming && (
          <span className="hint">
            {t('Tempo fällt gegen 0 oder ein Ziel ist ausgefallen: das Ziel ausschalten, dann „Ziel neu verbinden“. Alle Ziele sind dabei kurz unterbrochen.')}
          </span>
        )}
        {n === 0 ? (
          <span className="hint">{t('Kein Ziel eingeschaltet: „Nur aufnehmen“ speichert die Sendung lokal, ohne zu streamen.')}</span>
        ) : (
          <span className={up.warn ? 'warn-text' : 'hint'}>
            {t('≈ {n} × ({video} + {audio}) kbit/s = {mbit} Mbit/s Upload nötig.', { n, video: s.videoKbps, audio: s.audioKbps, mbit: up.mbit.toLocaleString(locale(), { maximumFractionDigits: 1 }) })}
            {up.warn && ` ${n === 2 ? t('Zwei Ziele brauchen doppelte Upload-Bandbreite.') : t('{n} Ziele brauchen {n}-fache Upload-Bandbreite.', { n })}`}
          </span>
        )}
      </section>

      <fieldset disabled={locked} style={{ all: 'unset', display: 'block' }}>
        <section>
          <h3>{t('Bild und Ton')}</h3>
          <div className="grid2">
            <div className="field">
              <span>{t('Bildrate')}</span>
              <div className="seg" role="group" aria-label={t('Bildrate')}>
                {([30, 50] as const).map((f) => (
                  <button key={f} aria-pressed={s.fps === f} onClick={() => set({ fps: f })}>
                    {f} fps
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>{t('Video-Bitrate: {kbps} kbit/s', { kbps: s.videoKbps })}</span>
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
              <span>{t('Audio-Bitrate')}</span>
              <select className="input" value={s.audioKbps} onChange={(e) => set({ audioKbps: Number(e.target.value) })}>
                {[128, 160, 192, 256].map((k) => (
                  <option key={k} value={k}>
                    {k} kbit/s
                  </option>
                ))}
              </select>
            </label>
          </div>
          <span className="hint">{t('1080p mit 30 fps ist Standard. 50 fps nur bei viel Bewegung und genug Upload.')}</span>
        </section>

        <section>
          <h3>{t('Aufnahme')}</h3>
          <label className="check">
            <input type="checkbox" checked={s.record} onChange={(e) => set({ record: e.target.checked })} />
            {t('Lokal aufnehmen')}
          </label>
          {!s.record && (
            <span className="hint">
              {t('Aus: nichts wird auf diesem Rechner gespeichert (gut für lange Sendungen). Der Stream läuft unverändert; die Aufzeichnung in der App macht Cloudflare.')}
            </span>
          )}
          <label className="field">
            <span>{t('Ordner')}</span>
            <div className="with-btn">
              <input className="input" spellCheck={false} value={s.recordDir} onChange={(e) => set({ recordDir: e.target.value })} />
              <button
                className="btn"
                onClick={async () => {
                  const dir = await window.studio.dialog.pickFolder();
                  if (dir) set({ recordDir: dir });
                }}
              >
                {t('Wählen…')}
              </button>
            </div>
          </label>
          {s.record && (
            <span className="hint">
              {t('Jede Sendung wird zusätzlich lokal als .mkv gespeichert, auch bei „Nur aufnehmen“. Bedarf: etwa 5–6 GB pro Stunde.')}
            </span>
          )}
        </section>

        <section>
          <h3>{t('Technik')}</h3>
          <label className="field">
            <span>{t('ffmpeg-Pfad')}</span>
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
                {check === 'running' ? t('Prüfe…') : t('Prüfen')}
              </button>
            </div>
          </label>
          {check && check !== 'running' && check.ok && check.softwareEncoder && (
            <span className="err-text">{t('Kein Grafikkarten-Encoder gefunden: Software-Encoder, höhere CPU-Last.')}</span>
          )}
          {check && check !== 'running' && (
            <span className={check.ok ? 'ok-text' : 'err-text'}>
              {check.error
                ? t('ffmpeg nicht nutzbar: {error}', { error: check.error })
                : `ffmpeg ${check.version ?? '?'}${check.source === 'bundled' ? ` (${t('mitgeliefert')})` : ''} · SRT ${check.srt ? t('ja') : t('fehlt')} · Encoder ${
                    check.encoder ? encoderLabel(check.encoder) : t('fehlt')
                  }${check.ok ? '' : ` (${t(FFMPEG_INSTALL_HINT)})`}`}
            </span>
          )}
        </section>

        <ShowTransfer />
        <VersionLine />
      </fieldset>
    </div>
  );
}

/** Running version (an over-the-air interface update shows its own number). */
function VersionLine() {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => {
    window.studio.ota
      ?.status()
      .then((r) => setV(r.version))
      .catch(() => {});
  }, []);
  return v ? <p className="hint">Ortis Studio {v}</p> : null;
}

/** Show-Paket: the whole show (sources, media, templates, table, sponsors, mixer) to another computer. */
function ShowTransfer() {
  const { state } = useShow();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ stateJson: string; files: number; missing: string[] } | null>(null);
  const [withKeys, setWithKeys] = useState(true);
  const devices = async () => {
    try {
      return await navigator.mediaDevices.enumerateDevices();
    } catch {
      return [];
    }
  };

  const doExport = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const annotated = annotateDevices(JSON.parse(serialize(state)) as Record<string, unknown>, await devices());
      const r = await window.studio.show.exportPackage(JSON.stringify(annotated), withKeys);
      if (r) {
        const miss = r.missing.length ? ` ${t('{n} Datei(en) fehlten und sind nicht dabei.', { n: r.missing.length })}` : '';
        const keys = withKeys ? ` ${t('Enthält die Stream-Schlüssel: nicht weitergeben.')}` : '';
        setMsg({ ok: r.missing.length === 0, text: `${t('Gespeichert: {dir} ({files} Mediendateien).', { dir: r.dir, files: r.files })}${miss} ${t('Den ganzen Ordner auf den anderen Rechner kopieren.')}${keys}` });
      }
    } catch (e) {
      setMsg({ ok: false, text: t('Export fehlgeschlagen: {error}', { error: errorText(e) }) });
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await window.studio.show.importPackage();
      if (r) setConfirm(r);
    } catch (e) {
      setMsg({ ok: false, text: t('Import fehlgeschlagen: {error}', { error: errorText(e) }) });
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!confirm) return;
    // Cameras/microphones: same device name on this computer. Machine paths stay as they are here;
    // destinations come from the package when it carries them.
    const { state: imported } = relinkDevices(JSON.parse(confirm.stateJson) as Record<string, unknown>, await devices());
    const carried = (imported.settings as { destinations?: Settings['destinations'] } | undefined)?.destinations;
    const settings = carried && carried.length ? { ...state.settings, destinations: carried } : state.settings;
    replaceStoredShow(JSON.stringify({ ...imported, settings }));
  };

  return (
    <section>
      <h3>{t('Show übertragen')}</h3>
      <p className="hint">
        {t('Nimmt die ganze Show auf einen anderen Rechner mit: Quellen, Videos, Bilder, Logos, Einblendungen, Tabelle, Sponsoren und Mixer. Kameras und Mikrofone werden am neuen Rechner über ihren Namen wiedergefunden (z. B. „OsmoPocket4P“), wenn sie beim Import angeschlossen sind.')}
      </p>
      <label className="check">
        <input type="checkbox" checked={withKeys} onChange={(e) => setWithKeys(e.target.checked)} />
        {t('Sendeziele und Stream-Schlüssel mitnehmen (Paket dann nicht weitergeben)')}
      </label>
      <div className="with-btn">
        <button className="btn" onClick={doExport} disabled={busy}>
          {t('Show exportieren…')}
        </button>
        <button className="btn" onClick={doImport} disabled={busy}>
          {t('Show importieren…')}
        </button>
      </div>
      {confirm && (
        <div className="locked">
          <p>
            {confirm.missing.length
              ? t('Show-Paket gelesen ({files} Mediendateien, {n} fehlen: {names}).', { files: confirm.files, n: confirm.missing.length, names: confirm.missing.slice(0, 3).join(', ') })
              : t('Show-Paket gelesen ({files} Mediendateien).', { files: confirm.files })}{' '}
            {t('Die aktuelle Show auf diesem Rechner wird ersetzt.')}
          </p>
          <div className="with-btn">
            <button className="btn primary" onClick={() => void apply()}>
              {t('Show ersetzen')}
            </button>
            <button className="btn" onClick={() => setConfirm(null)}>
              {t('Abbrechen')}
            </button>
          </div>
        </div>
      )}
      {msg && <span className={msg.ok ? 'ok-text' : 'err-text'}>{msg.text}</span>}
    </section>
  );
}
