// Minimal output settings. Task 11 replaces this with multi-destination settings.

import { useShow } from '../state/store';
import type { OutputTarget, Settings } from '../state/types';
import { useOnAir } from './studio';

const KBPS_MIN = 2500;
const KBPS_MAX = 9000;

/** Pasted addresses/keys often carry whitespace or wrapping quotes. */
const clean = (v: string) => v.trim().replace(/^(['"])(.*)\1$/, '$2');

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function SettingsTab() {
  const { state, dispatch } = useShow();
  const air = useOnAir();
  const s = state.settings;
  const locked = air.phase !== 'off';
  const set = (patch: Partial<Settings>) => dispatch({ type: 'updateSettings', patch });
  const t = s.target;

  const setKind = (kind: OutputTarget['kind']) => {
    if (kind === t.kind) return;
    const url = t.kind === 'none' ? '' : t.url;
    if (kind === 'none') set({ target: { kind: 'none' } });
    else if (kind === 'srt') set({ target: { kind: 'srt', url: url.startsWith('srt://') ? url : '' } });
    else set({ target: { kind: 'rtmp', url: url.startsWith('rtmp') ? url : '', key: '' } });
  };

  return (
    <div className="settings">
      <h2>Einstellungen</h2>
      <p>Wohin gesendet wird und wo die Aufnahme landet. Änderungen gelten ab dem nächsten Sendestart.</p>
      {locked && <div className="locked">Während der Sendung gesperrt. Beende die Sendung, um etwas zu ändern.</div>}

      <fieldset disabled={locked} style={{ all: 'unset', display: 'block' }}>
        <section>
          <h3>Sendeziel</h3>
          <div className="seg" role="group" aria-label="Protokoll">
            {(
              [
                ['srt', 'SRT'],
                ['rtmp', 'RTMPS'],
                ['none', 'Keins'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} aria-pressed={t.kind === k} onClick={() => setKind(k)}>
                {label}
              </button>
            ))}
          </div>
          {t.kind === 'srt' && (
            <label className="field">
              <span>SRT-Adresse</span>
              <input
                className="input"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="srt://live.example.com:778?streamid=…"
                value={t.url}
                onChange={(e) => set({ target: { kind: 'srt', url: clean(e.target.value) } })}
              />
            </label>
          )}
          {t.kind === 'rtmp' && (
            <>
              <label className="field">
                <span>RTMPS-Adresse</span>
                <input
                  className="input"
                  spellCheck={false}
                  placeholder="rtmps://live.example.com:443/live/"
                  value={t.url}
                  onChange={(e) => set({ target: { ...t, url: clean(e.target.value) } })}
                />
              </label>
              <label className="field">
                <span>Streamschlüssel</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={t.key}
                  onChange={(e) => set({ target: { ...t, key: clean(e.target.value) } })}
                />
              </label>
            </>
          )}
          {t.kind === 'none' && <span className="hint">Ohne Ziel lässt sich nicht auf Sendung gehen.</span>}
        </section>

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
          <span className="hint">Jede Sendung wird zusätzlich lokal als .mkv gespeichert.</span>
        </section>

        <section>
          <h3>Technik</h3>
          <label className="field">
            <span>ffmpeg-Pfad</span>
            <input className="input" spellCheck={false} value={s.ffmpegPath} onChange={(e) => set({ ffmpegPath: e.target.value })} />
          </label>
        </section>
      </fieldset>
    </div>
  );
}
