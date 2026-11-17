import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n';
import { listDevices } from '../../media/devices';
import { defaultRenderContext } from '../../media/program';
import { renderFrame } from '../../render/draw';
import { useShow } from '../../state/store';
import type { Scene, ShowState } from '../../state/types';
import { ConfirmDialog } from '../Dialog';
import { errorText } from '../engine';
import { sceneHealth, useSourceHealth, useStudio } from '../studio';
import { asProgram } from './Monitors';
import { liveRoom } from '../../live-room/controller';
import { removalPlan } from './removal';
import type { Action } from '../../state/reducer';
import { useTileDrag } from './tile-drag';
import { ScreenPicker } from './ScreenPicker';
import { arrange } from './arrange';
import { defaultFrame } from '../../render/layout';

const THUMB_W = 192;
const THUMB_H = 108;
/** Thumbnails are cheap on purpose: ≤ 5 fps, drawn at 1/10 scale. */
const THUMB_INTERVAL_MS = 250;

const HEALTH_TEXT = { ok: 'Signal ok', loading: 'Lädt…', lost: 'Signal verloren' } as const;

function useThumbnails(state: ShowState) {
  const { engine } = useStudio();
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const draw = () => {
      const s = latest.current;
      const now = Date.now();
      for (const scene of s.scenes) {
        const c = canvases.current.get(scene.id);
        const ctx = c?.getContext('2d', { alpha: false });
        if (!ctx) continue;
        const shown = asProgram(s, scene.id, false);
        renderFrame(ctx, shown, engine.registry.lookup, defaultRenderContext(shown), now, { scale: THUMB_W / 1920 });
      }
    };
    draw();
    const t = setInterval(draw, THUMB_INTERVAL_MS);
    return () => clearInterval(t);
  }, [engine]);
  return (id: string) => (el: HTMLCanvasElement | null) => {
    if (el) canvases.current.set(id, el);
    else canvases.current.delete(id);
  };
}

function basename(p: string): string {
  const name = p.split(/[\\/]/).pop() ?? p;
  return name.replace(/\.[^.]+$/, '');
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg)$/i;

/** Adds every video/image path as its own source (one tile each). Returns how many were skipped. */
export async function addMediaFiles(paths: string[], dispatch: (a: Action) => void): Promise<number> {
  let skipped = 0;
  for (const path of paths) {
    const kind = VIDEO_EXT.test(path) ? 'video' : IMAGE_EXT.test(path) ? 'image' : null;
    if (!kind) {
      skipped++;
      continue;
    }
    const url = await window.studio.media.allow(path);
    dispatch({
      type: 'addSource',
      source: kind === 'video' ? { kind: 'video', label: basename(path), url, loop: true } : { kind: 'image', label: basename(path), url },
    });
  }
  return skipped;
}

/** macOS appends the USB vendor:product id to camera labels ("FaceTime HD-Kamera (5B00:3AA6)"). */
function cameraLabel(d: MediaDeviceInfo, i: number): string {
  return d.label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)$/i, '') || `Kamera ${i + 1}`;
}

type MenuView = 'root' | 'camera' | 'color' | 'split' | 'pip' | 'free';

function AddSourceMenu({ onClose, onPickScreen }: { onClose: () => void; onPickScreen: () => void }) {
  const { state, dispatch } = useShow();
  const [view, setView] = useState<MenuView>('root');
  const [cams, setCams] = useState<MediaDeviceInfo[] | null>(null);
  const [color, setColor] = useState('#00498B');
  const [error, setError] = useState<string | null>(null);
  const [a, setA] = useState(state.sources[0]?.id ?? '');
  const [b, setB] = useState(state.sources[1]?.id ?? state.sources[0]?.id ?? '');
  const [fill, setFill] = useState(true);
  const [bg, setBg] = useState('');
  const [extra, setExtra] = useState<string[]>([]);
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

  const openCameras = async () => {
    setView('camera');
    setCams(null);
    try {
      let { video } = await listDevices();
      if (video.length === 0) {
        // Device ids/labels appear only after a first permission grant.
        const probe = await Promise.race([
          navigator.mediaDevices.getUserMedia({ video: true }),
          new Promise<null>((r) => setTimeout(() => r(null), 4000)),
        ]).catch(() => null);
        probe?.getTracks().forEach((t) => t.stop());
        ({ video } = await listDevices());
      }
      setCams(video);
    } catch {
      setCams([]);
    }
  };

  const pickFile = async (kind: 'video' | 'image') => {
    setError(null);
    try {
      const path = await window.studio.dialog.pickFile(kind);
      if (!path) return;
      const url = await window.studio.media.allow(path);
      dispatch({
        type: 'addSource',
        source: kind === 'video' ? { kind: 'video', label: basename(path), url, loop: true } : { kind: 'image', label: basename(path), url },
      });
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const pickMany = async () => {
    setError(null);
    try {
      const paths = (await window.studio.dialog.pickFiles?.()) ?? [];
      if (paths.length === 0) return;
      const skipped = await addMediaFiles(paths, dispatch);
      if (skipped) setError(t('{n} Datei(en) übersprungen (kein Video oder Bild).', { n: skipped }));
      else onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const labelOf = (id: string) => state.sources.find((s) => s.id === id)?.label ?? '';
  const addCombo = (layout: 'split' | 'pip') => {
    if (!a || !b) return;
    const joiner = layout === 'split' ? ' | ' : ' + ';
    dispatch({
      type: 'addScene',
      scene: {
        label: `${labelOf(a)}${joiner}${labelOf(b)}`,
        layout,
        sourceIds: [a, b],
        ...(layout === 'split' ? { fill } : {}),
        ...(bg ? { backgroundSourceId: bg } : {}),
      },
    });
    onClose();
  };

  // Free layout: one big picture, every other picked source as a small box (bottom right, side by side).
  const addFree = () => {
    if (!a) return;
    const tops = extra.filter((x) => x !== a);
    const frames: NonNullable<Scene['frames']> = { [a]: { x: 0, y: 0, w: 1920, h: 1080 } };
    tops.forEach((id, i) => (frames[id] = defaultFrame(1920, 1080, i)));
    const id = `scene-${Date.now().toString(36)}`;
    dispatch({
      type: 'addScene',
      scene: { id, label: [a, ...tops].map(labelOf).join(' + '), layout: 'free', sourceIds: [a, ...tops], frames },
    });
    dispatch({ type: 'setPreview', sceneId: id });
    arrange.open(tops[0] ?? a);
    onClose();
  };

  const back = (
    <button className="menu-item menu-back" onClick={() => setView('root')}>
      {t('‹ Zurück')}
    </button>
  );

  return (
    <div className="menu" ref={ref} role="menu">
      {view === 'root' && (
        <>
          <button className="menu-item" onClick={openCameras}>
            {t('Kamera')}
          </button>
          {window.studio.dialog.pickFiles && (
            <button className="menu-item" onClick={() => void pickMany()}>
              {t('Videos und Bilder (mehrere)…')}
            </button>
          )}
          <button className="menu-item" onClick={() => void pickFile('video')}>
            {t('Video aus Datei…')}
          </button>
          <button className="menu-item" onClick={() => void pickFile('image')}>
            {t('Bild aus Datei…')}
          </button>
          <button className="menu-item" onClick={() => setView('color')}>
            {t('Farbfläche')}
          </button>
          <button
            className="menu-item"
            onClick={() => {
              onPickScreen();
              onClose();
            }}
          >
            {t('Bildschirm oder Fenster…')}
          </button>
          <div className="menu-sep" />
          <button className="menu-item" disabled={state.sources.length < 2} onClick={() => setView('free')}>
            {t('Freie Anordnung (z. B. Bildschirm + Gesicht)')}
          </button>
          <button className="menu-item" disabled={state.sources.length < 2} onClick={() => setView('split')}>
            {t('Split (zwei nebeneinander)')}
          </button>
          <button className="menu-item" disabled={state.sources.length < 2} onClick={() => setView('pip')}>
            {t('Bild-im-Bild')}
          </button>
          {state.sources.length < 2 && <div className="menu-sub hint">{t('Split und Bild-im-Bild brauchen zwei Quellen.')}</div>}
          {error && <div className="menu-sub dialog-error">{error}</div>}
        </>
      )}

      {view === 'camera' && (
        <>
          {back}
          <div className="menu-sep" />
          {cams === null && <div className="menu-sub hint">{t('Suche Kameras…')}</div>}
          {cams?.length === 0 && <div className="menu-sub hint">{t('Keine Kamera gefunden.')}</div>}
          {cams?.map((d, i) => {
            const used = state.sources.some((s) => s.kind === 'camera' && s.deviceId === d.deviceId);
            return (
              <button
                key={d.deviceId}
                className="menu-item"
                disabled={used}
                onClick={() => {
                  dispatch({ type: 'addSource', source: { kind: 'camera', label: cameraLabel(d, i), deviceId: d.deviceId } });
                  onClose();
                }}
              >
                {cameraLabel(d, i)}
                {used && <span className="hint" style={{ marginLeft: 'auto' }}>{t('schon da')}</span>}
              </button>
            );
          })}
          <div className="menu-sep" />
          <div className="menu-sub hint">
            {t('Kein Bild? Systemeinstellungen → Datenschutz & Sicherheit → Kamera → Electron erlauben')}
          </div>
        </>
      )}

      {view === 'color' && (
        <>
          {back}
          <div className="menu-sep" />
          <div className="menu-sub">
            <label className="field">
              <span>{t('Farbe')}</span>
              <div className="with-btn">
                <input className="input" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
                <input className="input num" value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
            </label>
            <button
              className="btn"
              onClick={() => {
                dispatch({ type: 'addSource', source: { kind: 'color', label: `Farbe ${color.toUpperCase()}`, color } });
                onClose();
              }}
            >
              {t('Farbfläche hinzufügen')}
            </button>
          </div>
        </>
      )}

      {view === 'free' && (
        <>
          {back}
          <div className="menu-sep" />
          <div className="menu-sub">
            <label className="field">
              <span>{t('Großes Bild')}</span>
              <select className="input" value={a} onChange={(e) => setA(e.target.value)}>
                {state.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>{t('Darüber (klein, frei verschiebbar)')}</span>
              {state.sources
                .filter((s) => s.id !== a)
                .map((s) => (
                  <label key={s.id} className="check">
                    <input
                      type="checkbox"
                      checked={extra.includes(s.id)}
                      onChange={(e) => setExtra((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))}
                    />
                    {s.label}
                  </label>
                ))}
            </div>
            <button className="btn" disabled={!a || extra.filter((x) => x !== a).length === 0} onClick={addFree}>
              {t('Anlegen und anordnen')}
            </button>
            <div className="hint">{t('Danach im Vorschaubild verschieben und Größe ziehen.')}</div>
          </div>
        </>
      )}

      {(view === 'split' || view === 'pip') && (
        <>
          {back}
          <div className="menu-sep" />
          <div className="menu-sub">
            <label className="field">
              <span>{view === 'split' ? t('Links') : t('Hintergrund')}</span>
              <select className="input" value={a} onChange={(e) => setA(e.target.value)}>
                {state.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{view === 'split' ? t('Rechts') : t('Kleines Bild')}</span>
              <select className="input" value={b} onChange={(e) => setB(e.target.value)}>
                {state.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <ComboOptions layout={view} fill={fill} onFill={setFill} bg={bg} onBg={setBg} />
            <button className="btn" disabled={!a || !b || a === b} onClick={() => addCombo(view)}>
              {view === 'split' ? t('Split anlegen') : t('Bild-im-Bild anlegen')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Split / picture-in-picture options: fill the frame (split only) and the background behind the layout. */
function ComboOptions(p: { layout: Scene['layout']; fill: boolean; onFill: (v: boolean) => void; bg: string; onBg: (v: string) => void }) {
  const { state } = useShow();
  // Background = any non-guest source; a still image or a colour is the usual choice.
  const options = state.sources.filter((x) => x.kind !== 'external');
  return (
    <>
      {p.layout === 'split' && (
        <label className="check">
          <input type="checkbox" checked={p.fill} onChange={(e) => p.onFill(e.target.checked)} />
          {t('Bild ausfüllen (ohne Ränder, Ränder werden abgeschnitten)')}
        </label>
      )}
      {(p.layout === 'pip' || !p.fill) && (
        <label className="field">
          <span>{t('Hintergrund')}</span>
          <select className="input" value={p.bg} onChange={(e) => p.onBg(e.target.value)}>
            <option value="">{t('Schwarz')}</option>
            {options.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {(p.layout === 'pip' || !p.fill) && options.length === 0 && (
        <div className="hint">{t('Eigenes Hintergrundbild: erst über „+ Quelle → Bild aus Datei…“ hinzufügen.')}</div>
      )}
    </>
  );
}

/** ⚙ on a split / picture-in-picture tile: change fill and background of an existing combo. */
function ComboEdit({ scene, onClose }: { scene: Scene; onClose: () => void }) {
  const { dispatch } = useShow();
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
    <div className="menu" ref={ref} role="menu">
      <div className="menu-sub">
        <ComboOptions
          layout={scene.layout}
          fill={!!scene.fill}
          onFill={(v) => dispatch({ type: 'updateScene', id: scene.id, patch: { fill: v } })}
          bg={scene.backgroundSourceId ?? ''}
          onBg={(v) => dispatch({ type: 'updateScene', id: scene.id, patch: { backgroundSourceId: v || undefined } })}
        />
        <div className="hint">{t('Änderungen gelten sofort, auch im Live-Bild.')}</div>
        <button
          className="btn"
          onClick={() => {
            dispatch({ type: 'setPreview', sceneId: scene.id });
            arrange.open();
            onClose();
          }}
        >
          {t('Frei anordnen…')}
        </button>
      </div>
    </div>
  );
}

export function SourceRow() {
  const { state, dispatch } = useShow();
  const health = useSourceHealth();
  const thumbRef = useThumbnails(state);
  const [menu, setMenu] = useState(false);
  const [removing, setRemoving] = useState<Scene | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [screenPicker, setScreenPicker] = useState(false);
  const kindOf = (id: string) => state.sources.find((s) => s.id === id)?.kind;
  const [dropNote, setDropNote] = useState<string | null>(null);
  const drag = useTileDrag('scene', (id, to) => dispatch({ type: 'moveScene', id, to }), async (files) => {
    const pathFor = window.studio.dialog.pathForFile;
    if (!pathFor) {
      setDropNote(t('Dateien hineinziehen geht erst mit der neuen App-Version 0.1.6 (Installer) – bis dahin „+ Quelle“.'));
      return;
    }
    const skipped = await addMediaFiles(files.map((f) => pathFor(f)).filter(Boolean), dispatch);
    setDropNote(skipped ? t('{n} Datei(en) übersprungen (kein Video oder Bild).', { n: skipped }) : null);
  });

  const remove = (scene: Scene) => {
    const plan = removalPlan(state, scene.id);
    setRemoving(null);
    if (plan.blockedByLive) return; // re-checked: the program may have changed meanwhile
    if (plan.externalSourceId) {
      // A Live-Raum guest: end the guest there, which unregisters the source (else the next track event re-adds it).
      const id = plan.externalSourceId;
      void liveRoom.endGuestBySource(id).then(
        (handled) => !handled && dispatch(plan.action),
        () => dispatch(plan.action),
      );
      return;
    }
    dispatch(plan.action);
  };

  return (
    <section>
      <div className="row-head">
        <span className="row-title">{t('Quellen')}</span>
        <span className="row-hint">{t('Klick = in die Vorschau, Doppelklick = sofort live, Tasten 1–9 · Ziehen = umsortieren')}</span>
        {dropNote && <span className="row-hint warn">{dropNote}</span>}
      </div>
      <div className={`strip wrap${drag.fileOver ? ' drop-over' : ''}`} {...drag.stripProps}>
        {state.scenes.map((scene, i) => {
          const h = sceneHealth(scene, kindOf, health);
          const isPgm = scene.id === state.programSceneId;
          const isPvw = scene.id === state.previewSceneId;
          return (
            <div key={scene.id} className={`tile${isPgm ? ' is-pgm' : isPvw ? ' is-pvw' : ''}${drag.overIndex === i ? ' drag-target' : ''}`} {...drag.tileProps(scene.id, i)}>
              <button
                style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}
                onClick={() => dispatch({ type: 'setPreview', sceneId: scene.id })}
                onDoubleClick={() => {
                  dispatch({ type: 'setPreview', sceneId: scene.id });
                  dispatch({ type: 'cut' });
                }}
                title={`${scene.label}: ${t(HEALTH_TEXT[h])}`}
              >
                <canvas ref={thumbRef(scene.id)} width={THUMB_W} height={THUMB_H} />
                <div className="tile-foot">
                  <span className={`dot ${h}`} aria-label={t(HEALTH_TEXT[h])} />
                  <span className="tile-label">{scene.label}</span>
                  {i < 9 && <span className="key">{i + 1}</span>}
                </div>
              </button>
              {scene.layout !== 'full' && (
                <button
                  className="tile-edit"
                  aria-label={t('{name} anpassen', { name: scene.label })}
                  title={scene.layout === 'free' ? t('Im Vorschaubild anordnen') : t('Ausfüllen und Hintergrund')}
                  aria-expanded={editing === scene.id}
                  onClick={() => {
                    // A free scene is edited in the preview ("Anordnen"); split / pip keep their quick options.
                    if (scene.layout === 'free') {
                      dispatch({ type: 'setPreview', sceneId: scene.id });
                      arrange.open();
                      return;
                    }
                    setEditing((cur) => (cur === scene.id ? null : scene.id));
                  }}
                >
                  ⚙
                </button>
              )}
              {editing === scene.id && <ComboEdit scene={scene} onClose={() => setEditing(null)} />}
              {isPgm && <span className="tile-tag pgm">Live</span>}
              {isPvw && !isPgm && <span className="tile-tag pvw">{t('Vorschau')}</span>}
              {(() => {
                const blocked = removalPlan(state, scene.id).blockedByLive;
                return (
                  <button
                    className="tile-remove"
                    aria-label={t('{name} entfernen', { name: scene.label })}
                    title={blocked ? t('Wird gerade live verwendet') : t('{name} entfernen', { name: scene.label })}
                    disabled={blocked}
                    onClick={() => setRemoving(scene)}
                  >
                    ×
                  </button>
                );
              })()}
            </div>
          );
        })}
        <div className="add-wrap">
          <button className="add-tile" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            {t('+ Quelle')}
          </button>
          {menu && <AddSourceMenu onClose={() => setMenu(false)} onPickScreen={() => setScreenPicker(true)} />}
        </div>
      </div>
      {screenPicker && <ScreenPicker onClose={() => setScreenPicker(false)} />}
      {removing && (
        <ConfirmDialog
          title={t('„{name}“ entfernen?', { name: removing.label })}
          body={
            removalPlan(state, removing.id).externalSourceId ? (
              <p>{t('Der Gast wird aus dem Live-Raum verabschiedet und verschwindet aus der Leiste.')}</p>
            ) : (
              <p>{t('Die Quelle verschwindet aus der Leiste. Split- und Bild-im-Bild-Ansichten mit dieser Quelle werden ebenfalls entfernt.')}</p>
            )
          }
          confirmLabel={t('Entfernen')}
          danger
          onConfirm={() => remove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </section>
  );
}
