import { useEffect, useState } from 'react';
import { errorText } from './engine';
import { useOnAir } from './studio';

const CHECK_EVERY_MS = 30 * 60_000;

type Update = { version: string; os: 'win' | 'mac' };

/** Top-bar button that appears when roebel.app/studio has a newer version; hidden while on air. */
export function UpdateButton() {
  const air = useOnAir();
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () =>
      window.studio.update
        ?.check()
        .then((r) => alive && setUpdate(r.update))
        .catch(() => {}); // offline: try again later
    void check();
    const t = setInterval(check, CHECK_EVERY_MS);
    const off = window.studio.update?.onProgress((p) => setProgress(p));
    return () => {
      alive = false;
      clearInterval(t);
      off?.();
    };
  }, []);

  if (!update || air.phase !== 'off') return null;

  const install = async () => {
    const what =
      update.os === 'win'
        ? `Ortis Studio ${update.version} jetzt installieren? Die App schließt sich und startet nach etwa einer Minute neu. Die Show bleibt erhalten.`
        : `Ortis Studio ${update.version} herunterladen? Danach die neue App in den Programme-Ordner ziehen und die alte ersetzen. Die Show bleibt erhalten.`;
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
      {progress !== null ? `Update lädt… ${Math.round(progress * 100)} %` : error ? 'Update fehlgeschlagen – erneut' : `Update ${update.version}`}
    </button>
  );
}
