import { useEffect, useState } from 'react';
import { errorText } from './engine';
import { useOnAir } from './studio';

const CHECK_EVERY_MS = 30 * 60_000;

type Update = { version: string; os: 'win' | 'mac' };

/**
 * Top-bar update, hidden while on air.
 * 1. Interface update (OTA, downloaded in the background): "Neu starten" reloads the studio with the new
 *    version in about two seconds, the show stays.
 * 2. Only when the app itself changed: "Neue App-Version" (Windows installs silently, macOS opens the download).
 */
export function UpdateButton() {
  const air = useOnAir();
  const [ota, setOta] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () => {
      window.studio.ota
        ?.status()
        .then((r) => alive && setOta(r.pending))
        .catch(() => {});
      window.studio.update
        ?.check()
        .then((r) => alive && setUpdate(r.update))
        .catch(() => {}); // offline: try again later
    };
    check();
    const t = setInterval(check, CHECK_EVERY_MS);
    const offPending = window.studio.ota?.onPending((v) => setOta(v));
    const offProgress = window.studio.update?.onProgress((p) => setProgress(p));
    return () => {
      alive = false;
      clearInterval(t);
      offPending?.();
      offProgress?.();
    };
  }, []);

  if (air.phase !== 'off') return null;

  if (ota) {
    const restart = async () => {
      setError(null);
      try {
        if (!(await window.studio.ota.apply())) setOta(null);
      } catch (e) {
        setError(errorText(e));
      }
    };
    return (
      <button className="btn update-btn" onClick={() => void restart()} title={error ?? `Startet das Studio mit Version ${ota} neu (ca. 2 Sekunden). Die Show bleibt erhalten.`}>
        {error ? 'Neustart fehlgeschlagen – erneut' : `Neu starten · Update ${ota}`}
      </button>
    );
  }

  if (!update) return null;

  const install = async () => {
    const what =
      update.os === 'win'
        ? `Neue App-Version ${update.version} installieren? Die App schließt sich und startet nach etwa einer Minute neu. Die Show bleibt erhalten.`
        : `Neue App-Version ${update.version} herunterladen? Danach die neue App in den Programme-Ordner ziehen und die alte ersetzen. Die Show bleibt erhalten.`;
    if (!window.confirm(what)) return;
    setError(null);
    setProgress(0);
    try {
      const r = await window.studio.update.install();
      if (!r.started) setProgress(null);
    } catch (e) {
      setProgress(null);
      setError(errorText(e));
    }
  };

  return (
    <button className="btn update-btn" onClick={() => void install()} disabled={progress !== null} title={error ?? undefined}>
      {progress !== null ? `Update lädt… ${Math.round(progress * 100)} %` : error ? 'Update fehlgeschlagen – erneut' : `Neue App-Version ${update.version}`}
    </button>
  );
}
