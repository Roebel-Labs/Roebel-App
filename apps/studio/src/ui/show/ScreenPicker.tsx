// "Bildschirm oder Fenster": picks a whole screen or one app window (Keynote, PowerPoint, a browser…) as a
// livestream source. Thumbnails refresh while the dialog is open. Needs installer ≥ 0.3.13 (window.studio.screen).

import { useEffect, useState } from 'react';
import { t } from '../../i18n';
import { useShow } from '../../state/store';
import { Dialog } from '../Dialog';
import { errorText } from '../engine';

const REFRESH_MS = 2500;
type Access = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';

/** Window titles like "Präsentation1 – PowerPoint" are long; macOS screens are "Entire screen" / "Screen 1". */
function displayName(s: ScreenSourceInfo, i: number): string {
  if (s.kind === 'screen') return /^(entire screen|screen \d+)$/i.test(s.name) || !s.name ? t('Bildschirm {n}', { n: i + 1 }) : s.name;
  return s.name || t('Fenster');
}

export function ScreenPicker({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useShow();
  const api = window.studio.screen;
  const [list, setList] = useState<ScreenSourceInfo[] | null>(null);
  const [tab, setTab] = useState<'screen' | 'window'>('screen');
  const [picked, setPicked] = useState<string | null>(null);
  const [access, setAccess] = useState<Access>('granted');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!api) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const [a, l] = await Promise.all([api.access(), api.list({ thumbnails: true })]);
        if (!alive) return;
        setAccess(a);
        setList(l);
        setError(null);
      } catch (e) {
        if (alive) setError(errorText(e));
      }
      if (alive) timer = setTimeout(load, REFRESH_MS);
    };
    void load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [api]);

  const shown = (list ?? []).filter((s) => s.kind === tab);
  const sel = list?.find((s) => s.id === picked) ?? null;
  const used = (id: string) => state.sources.some((s) => s.kind === 'screen' && s.screenId === id);

  const add = () => {
    if (!sel) return;
    const i = (list ?? []).filter((s) => s.kind === sel.kind).indexOf(sel);
    const label = sel.kind === 'screen' ? displayName(sel, i) : sel.name;
    dispatch({ type: 'addSource', source: { kind: 'screen', label, screenId: sel.id, screenKind: sel.kind } });
    onClose();
  };

  if (!api) {
    return (
      <Dialog
        title={t('Bildschirm oder Fenster')}
        onCancel={onClose}
        actions={
          <button className="btn primary" onClick={onClose} data-autofocus>
            {t('OK')}
          </button>
        }
      >
        <p>{t('Bildschirm übertragen geht erst mit der neuen App-Version 0.3.13 (Installer). Lade sie unter roebel.app/studio.')}</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      title={t('Bildschirm oder Fenster')}
      onCancel={onClose}
      actions={
        <>
          <button className="btn ghost" onClick={onClose} data-autofocus>
            {t('Abbrechen')}
          </button>
          <button className="btn primary" onClick={add} disabled={!sel}>
            {t('Hinzufügen')}
          </button>
        </>
      }
    >
      <div className="screen-picker">
        <div className="screen-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'screen'} className={`arrange-chip${tab === 'screen' ? ' sel' : ''}`} onClick={() => setTab('screen')}>
            {t('Ganzer Bildschirm')}
          </button>
          <button role="tab" aria-selected={tab === 'window'} className={`arrange-chip${tab === 'window' ? ' sel' : ''}`} onClick={() => setTab('window')}>
            {t('App-Fenster')}
          </button>
        </div>
        {(access === 'denied' || access === 'restricted') && (
          <div className="hint" style={{ marginBottom: 12 }}>
            {t('macOS erlaubt Ortis Studio noch keine Bildschirmaufnahme. Systemeinstellungen → Datenschutz & Sicherheit → Bildschirm- und Systemaudioaufnahme → Ortis Studio einschalten, dann die App neu starten.')}{' '}
            <button className="btn ghost small" onClick={() => void api.openSettings()}>
              {t('Systemeinstellungen öffnen')}
            </button>
          </div>
        )}
        {error && <div className="dialog-error">{error}</div>}
        {list === null && !error && <div className="hint">{t('Suche Bildschirme und Fenster…')}</div>}
        {list !== null && shown.length === 0 && (
          <div className="hint">{tab === 'window' ? t('Keine offenen Fenster gefunden.') : t('Kein Bildschirm gefunden.')}</div>
        )}
        <div className="screen-grid">
          {shown.map((s, i) => (
            <button
              key={s.id}
              className={`screen-item${picked === s.id ? ' sel' : ''}`}
              onClick={() => setPicked(s.id)}
              onDoubleClick={() => {
                setPicked(s.id);
                if (!used(s.id)) {
                  dispatch({
                    type: 'addSource',
                    source: { kind: 'screen', label: s.kind === 'screen' ? displayName(s, i) : s.name, screenId: s.id, screenKind: s.kind },
                  });
                  onClose();
                }
              }}
              disabled={used(s.id)}
              title={used(s.id) ? t('schon da') : s.name}
            >
              {s.thumbnail ? <img className="screen-thumb" src={s.thumbnail} alt="" /> : <div className="screen-thumb" />}
              <span className="screen-name">
                {s.icon && <img src={s.icon} alt="" />}
                <span>{displayName(s, i)}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          {t('Tipp für Präsentationen: läuft Keynote oder PowerPoint im Vollbild auf einem zweiten Bildschirm, nimm den ganzen Bildschirm. Ton vom Computer wird nicht mit übertragen.')}
        </p>
      </div>
    </Dialog>
  );
}
