import { useEffect, useState } from 'react';
import { useShow } from '../../state/store';
import type { OutputStatus, Settings } from '../../state/types';
import { hms, useOnAir, useStudio, useTick } from '../studio';

const STATE_TEXT = {
  idle: 'Bereit',
  connecting: 'Verbinde…',
  live: 'Live',
  reconnecting: 'Verbinde neu…',
  error: 'Fehler',
} as const;

function mb(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  return `${Math.round(bytes / 1e6)} MB`;
}

function Item({ label, value, bad, title }: { label: string; value: string; bad?: boolean; title?: string }) {
  return (
    <span className={`health-item${bad ? ' bad' : ''}`} title={title}>
      <span>{label}</span>
      <span>{value}</span>
    </span>
  );
}

/**
 * One small pill per destination of the running encoder (falls back to the enabled ones
 * before main reports): name + ok / failed. A destination switched off on air keeps its
 * pill until "Ziel neu verbinden" really drops it.
 */
export function destinationPills(settings: Settings, st: OutputStatus | null) {
  const nameOf = (id: string) => settings.destinations.find((d) => d.id === id)?.name.trim() || 'Ziel';
  const running = st?.destinations?.length
    ? st.destinations
    : settings.destinations.filter((d) => d.enabled && d.target.kind !== 'none').map((d) => ({ id: d.id, state: 'ok' as const }));
  return running.map((ds) => {
    const failed = ds.state === 'failed';
    // Amber while (re)connecting, so a single destination's restart never flickers to "failed".
    const tone: 'ok' | 'loading' | 'lost' = failed ? 'lost' : st?.state === 'live' && st.destinations?.length ? 'ok' : 'loading';
    return { id: ds.id, name: nameOf(ds.id), failed, tone, lastError: 'lastError' in ds ? ds.lastError : undefined };
  });
}

/** Pure health thresholds (also used for the red state). */
export function healthFlags(o: { speed?: number; renderFps: number; targetFps: number; live: boolean }) {
  return {
    speedBad: o.live && o.speed !== undefined && o.speed < 0.95,
    renderBad: o.renderFps > 0 && o.renderFps < 0.9 * o.targetFps,
  };
}

export function HealthBar() {
  const { engine } = useStudio();
  const { state } = useShow();
  const air = useOnAir();
  const now = useTick(1000);
  const [usage, setUsage] = useState<{ cpu: number; memMb: number } | null>(null);
  const [server, setServer] = useState<{ ok: boolean; error: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = () =>
      window.studio.sys
        .usage()
        .then((u) => alive && setUsage(u))
        .catch(() => {});
    const pollServer = () =>
      window.studio.overlay
        .status()
        .then((r) => alive && setServer(r))
        .catch((e) => alive && setServer({ ok: false, error: String(e) }));
    poll();
    pollServer();
    const t = setInterval(poll, 1000);
    const t2 = setInterval(pollServer, 5000);
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(t2);
    };
  }, []);

  const clock = engine.program.clock.stats();
  const st = air.status;
  const onAir = air.phase !== 'off';
  const live = onAir && st?.state === 'live';
  const { speedBad, renderBad } = healthFlags({ speed: st?.speed, renderFps: clock.fps, targetFps: engine.fps, live });
  const recordOnly = onAir && !!st?.recordOnly;
  const outState = !onAir ? 'Aus' : recordOnly ? 'Nur Aufnahme' : st ? STATE_TEXT[st.state] : 'Startet…';
  const pills = onAir && !recordOnly ? destinationPills(state.settings, st) : [];

  return (
    <footer className="health" aria-label="Zustand">
      <Item label="Ausgang" value={outState} bad={onAir && (st?.state === 'error' || st?.state === 'reconnecting')} title={st?.lastError} />
      {pills.length > 0 &&
        pills.map((p) => (
          <span
            key={p.id}
            className={`dest-pill${p.failed ? ' failed' : ''}`}
            title={p.failed ? `Ausgefallen: ${p.lastError ?? 'Verbindung verloren'}` : 'Verbunden'}
          >
            <span className={`dot ${p.tone}`} />
            {p.name}
            {p.failed ? ' ausgefallen' : ''}
          </span>
        ))}
      <Item label="Render" value={`${clock.fps.toFixed(1)} fps`} bad={renderBad} title={`Ziel: ${engine.fps} fps`} />
      <Item label="Aussetzer" value={String(clock.overruns)} title="Ausgelassene Render-Takte seit dem Start" />
      {onAir && !recordOnly && (
        <>
          <Item label="Encoder" value={st?.fps !== undefined ? `${st.fps.toFixed(0)} fps` : '–'} />
          <Item
            label="Bitrate"
            value={st?.kbps !== undefined ? `${Math.round(st.kbps)} kbit/s` : '–'}
            title={pills.length > 1 ? 'Bei mehreren Zielen meldet ffmpeg keine Bitrate; Tempo und Encoder-fps zeigen, ob es läuft' : undefined}
          />
          <Item label="Tempo" value={st?.speed !== undefined ? `${st.speed.toFixed(2)}×` : '–'} bad={speedBad} title="Unter 0,95× kommt der Rechner nicht mit" />
          <Item label="Verworfen" value={String(st?.dropped ?? 0)} bad={(st?.dropped ?? 0) > 0} />
        </>
      )}
      {onAir && (
        <>
          <Item
            label="Aufnahme"
            value={st?.recordingError ? 'unterbrochen' : mb(st?.recordingBytes ?? 0)}
            bad={!!st?.recordingError}
            title={st?.recordingFile}
          />
          {air.recorderError && <Item label="Kodierer" value={`neu gestartet (${air.recorderRestarts}×)`} bad title={air.recorderError} />}
        </>
      )}
      {server && !server.ok && (
        <Item label="Medienserver" value={server.error ?? 'nicht erreichbar'} bad title="Videos, Bilder und die OBS-Einblendungsseite brauchen ihn" />
      )}
      <span className="health-end" />
      <Item label="CPU" value={usage ? `${Math.round(usage.cpu)} %` : '–'} title="Anteil der gesamten Rechenleistung des Macs (alle Studio-Prozesse)" />
      <Item label="Speicher" value={usage ? `${Math.round(usage.memMb)} MB` : '–'} />
      <Item label="Sendezeit" value={air.startedAt ? hms(now - air.startedAt) : '–'} />
    </footer>
  );
}
