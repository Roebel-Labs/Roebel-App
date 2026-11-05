import { useEffect, useRef, useState } from 'react';
import { DB_FLOOR, MAX_DELAY_MS, type Mixer } from '../../audio/mixer';
import { listDevices } from '../../media/devices';
import { useShow } from '../../state/store';
import type { AudioChannel } from '../../state/types';
import './audio-strip.css';

const METER_HZ = 30;
const FADER_MAX = 10;
/** Meter colour thresholds (dBFS). */
const AMBER_DB = -18;
const RED_DB = -6;
/** Visual fall-back of the peak bar, dB per second. */
const FALL_DB_PER_S = 40;

const fmtDb = (db: number) => (db <= DB_FLOOR ? '−∞' : `${db > 0 ? '+' : db < 0 ? '−' : ''}${Math.abs(db).toFixed(1)}`);
const meterFrac = (db: number) => Math.max(0, Math.min(1, (db - DB_FLOOR) / -DB_FLOOR));
const colorFor = (db: number) => (db >= RED_DB ? 'var(--pgm, #e5484d)' : db >= AMBER_DB ? 'var(--amber, #e8a33d)' : 'var(--pvw, #2fa866)');

type MeterRef = { bar: HTMLDivElement | null; read: HTMLSpanElement | null; shown: number; lost: boolean };

/**
 * One loop for all meters: polls the mixer at ≤ 30 Hz and writes straight to the DOM
 * (no React renders, no allocations per tick).
 */
function useMeters(mixer: Mixer | null) {
  const meters = useRef(new Map<string, MeterRef>());
  useEffect(() => {
    if (!mixer) return;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = t - last;
      if (dt < 1000 / METER_HZ - 2) return;
      last = t;
      const levels = mixer.levels();
      for (const [id, m] of meters.current) {
        if (!m.bar || !m.read) continue;
        const lost = id !== 'master' && mixer.statusOf(id) === 'lost';
        const raw = levels[id] ?? DB_FLOOR;
        m.shown = Math.max(raw, m.shown - (FALL_DB_PER_S * dt) / 1000);
        if (lost) m.shown = DB_FLOOR;
        m.bar.style.transform = `scaleY(${meterFrac(m.shown)})`;
        m.bar.style.background = colorFor(m.shown);
        if (lost !== m.lost) m.read.title = lost ? 'Signal verloren' : '';
        const text = lost ? '—' : fmtDb(raw);
        if (m.read.textContent !== text) m.read.textContent = text;
        m.lost = lost;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mixer]);
  const entry = (id: string): MeterRef => {
    let m = meters.current.get(id);
    if (!m) {
      m = { bar: null, read: null, shown: DB_FLOOR, lost: false };
      meters.current.set(id, m);
    }
    return m;
  };
  return (id: string): MeterBinding => ({
    bar: (el) => {
      if (el) entry(id).bar = el;
      else meters.current.delete(id);
    },
    read: (el) => {
      if (el) entry(id).read = el;
    },
  });
}

type MeterBinding = { bar: (el: HTMLDivElement | null) => void; read: (el: HTMLSpanElement | null) => void };
type Bind = (id: string) => MeterBinding;

function Meter({ id, bind }: { id: string; bind: Bind }) {
  const b = bind(id);
  return (
    <div className="au-meter-wrap">
      <div className="au-meter" aria-hidden="true">
        <div className="au-meter-bar" ref={b.bar} />
        <i className="au-tick" style={{ bottom: `${meterFrac(AMBER_DB) * 100}%` }} />
        <i className="au-tick" style={{ bottom: `${meterFrac(RED_DB) * 100}%` }} />
      </div>
      <span className="au-read" ref={b.read}>
        −∞
      </span>
    </div>
  );
}

function AddMenu({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useShow();
  const [devices, setDevices] = useState<MediaDeviceInfo[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    listDevices()
      .then((d) => alive && setDevices(d.audio))
      .catch(() => alive && setDevices([]));
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      alive = false;
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);
  const add = (channel: Omit<AudioChannel, 'id'>) => {
    dispatch({ type: 'addAudioChannel', channel });
    onClose();
  };
  const base = { gainDb: 0, muted: false, delayMs: 0 };
  const videos = state.sources.filter((s) => s.kind === 'video');
  return (
    <div className="au-menu" ref={ref} role="menu">
      <div className="au-menu-sub">Audiogerät</div>
      {devices === null && <div className="au-menu-empty">Suche Geräte…</div>}
      {devices?.length === 0 && <div className="au-menu-empty">Keine Audiogeräte gefunden</div>}
      {devices?.map((d, i) => (
        <button
          key={d.deviceId}
          role="menuitem"
          className="au-menu-item"
          onClick={() => add({ ...base, label: d.label || `Audiogerät ${i + 1}`, input: { kind: 'device', deviceId: d.deviceId } })}
        >
          {d.label || `Audiogerät ${i + 1}`}
        </button>
      ))}
      <div className="au-menu-sub">Ton einer Quelle</div>
      {videos.length === 0 && <div className="au-menu-empty">Keine Videoquelle vorhanden</div>}
      {videos.map((s) => (
        <button
          key={s.id}
          role="menuitem"
          className="au-menu-item"
          onClick={() => add({ ...base, label: `Ton: ${s.label}`, input: { kind: 'source', sourceId: s.id } })}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function ChannelStrip({ ch, bind }: { ch: AudioChannel; bind: Bind }) {
  const { state, dispatch } = useShow();
  const patch = (p: Partial<Omit<AudioChannel, 'id'>>) => dispatch({ type: 'updateAudioChannel', id: ch.id, patch: p });
  return (
    <div className={`au-strip${ch.muted ? ' muted' : ''}`}>
      <div className="au-label" title={ch.label}>
        {ch.label}
      </div>
      <div className="au-body">
        <Meter id={ch.id} bind={bind} />
        <input
          className="au-fader"
          type="range"
          min={DB_FLOOR}
          max={FADER_MAX}
          step={0.5}
          value={ch.gainDb}
          aria-label={`Pegel ${ch.label}`}
          onChange={(e) => patch({ gainDb: Number(e.target.value) })}
          onDoubleClick={() => patch({ gainDb: 0 })}
        />
      </div>
      <div className="au-db">{fmtDb(ch.gainDb)} dB</div>
      <button className={`au-btn${ch.muted ? ' on' : ''}`} aria-pressed={ch.muted} onClick={() => patch({ muted: !ch.muted })}>
        Stumm
      </button>
      <label className="au-field">
        <span>Verzögerung</span>
        <span className="au-num">
          <input
            type="number"
            min={0}
            max={MAX_DELAY_MS}
            step={10}
            value={ch.delayMs}
            onChange={(e) => {
              const v = Number(e.target.value);
              patch({ delayMs: Number.isFinite(v) ? Math.min(MAX_DELAY_MS, Math.max(0, v)) : 0 });
            }}
          />
          ms
        </span>
      </label>
      <label className="au-field">
        <span>Folgt Bild</span>
        <select value={ch.followsVideoSourceId ?? ''} onChange={(e) => patch({ followsVideoSourceId: e.target.value || undefined })}>
          <option value="">Keine</option>
          {state.sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <button className="au-btn" onClick={() => dispatch({ type: 'removeAudioChannel', id: ch.id })}>
        Entfernen
      </button>
    </div>
  );
}

export function AudioStrip({ mixer }: { mixer: Mixer | null }) {
  const { state, dispatch } = useShow();
  const bind = useMeters(mixer);
  const [adding, setAdding] = useState(false);
  const [monitor, setMonitor] = useState(false);
  const { masterDb, channels } = state.audio;
  return (
    <section className="au" aria-label="Audio">
      <div className="au-head">
        <span className="au-title">Audio</span>
        <div className="au-add">
          <button className="au-btn" onClick={() => setAdding((v) => !v)} aria-haspopup="menu" aria-expanded={adding}>
            + Kanal
          </button>
          {adding && <AddMenu onClose={() => setAdding(false)} />}
        </div>
      </div>
      <div className="au-row">
        {channels.map((c) => (
          <ChannelStrip key={c.id} ch={c} bind={bind} />
        ))}
        {channels.length === 0 && <div className="au-empty">Noch kein Audiokanal. Mit „+ Kanal“ ein Gerät oder den Ton einer Videoquelle hinzufügen.</div>}
        <div className="au-strip au-master">
          <div className="au-label">Master</div>
          <div className="au-body">
            <Meter id="master" bind={bind} />
            <input
              className="au-fader"
              type="range"
              min={DB_FLOOR}
              max={FADER_MAX}
              step={0.5}
              value={masterDb}
              aria-label="Pegel Master"
              onChange={(e) => dispatch({ type: 'setMasterDb', db: Number(e.target.value) })}
              onDoubleClick={() => dispatch({ type: 'setMasterDb', db: 0 })}
            />
          </div>
          <div className="au-db">{fmtDb(masterDb)} dB</div>
          <button
            className={`au-btn${monitor ? ' on' : ''}`}
            aria-pressed={monitor}
            disabled={!mixer}
            title="Master auf Kopfhörer / Lautsprecher. Mit Raummikrofon Rückkopplung vermeiden."
            onClick={() => {
              mixer?.setMonitor(!monitor);
              setMonitor(!monitor);
            }}
          >
            Mithören
          </button>
        </div>
      </div>
    </section>
  );
}
