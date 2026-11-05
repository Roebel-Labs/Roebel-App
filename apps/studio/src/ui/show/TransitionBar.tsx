import { useEffect, useRef, useState } from 'react';
import { useShow } from '../../state/store';
import { Dialog } from '../Dialog';

const MIN_MS = 100;
const MAX_MS = 2000;

function TakeProgress({ startedAt, durationMs }: { startedAt: number; durationMs: number }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const step = () => {
      const p = Math.min(1, (Date.now() - startedAt) / Math.max(1, durationMs));
      if (bar.current) bar.current.style.width = `${p * 100}%`;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [startedAt, durationMs]);
  return (
    <div className="take-progress" aria-hidden="true">
      <div ref={bar} />
    </div>
  );
}

export function TransitionBar() {
  const { state, dispatch } = useShow();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const preset = state.presets.find((p) => p.id === state.transition.presetId) ?? state.presets[0];
  const running = state.transition.startedAt !== null;
  const canTake = !!state.previewSceneId && state.previewSceneId !== state.programSceneId && !running;
  const isCut = preset?.kind === 'cut';

  const save = () => {
    const n = name.trim();
    if (!n || !preset) return;
    const id = crypto.randomUUID();
    const { id: _old, name: _n, ...rest } = preset;
    dispatch({ type: 'savePreset', preset: { ...rest, id, name: n } });
    dispatch({ type: 'setPreset', presetId: id });
    setSaving(false);
    setName('');
  };

  return (
    <div className="tbar">
      <span className="tbar-label">Übergang</span>
      <div className="chips" role="group" aria-label="Übergang">
        {state.presets.map((p) => (
          <button
            key={p.id}
            className="chip"
            aria-pressed={p.id === preset?.id}
            onClick={() => dispatch({ type: 'setPreset', presetId: p.id })}
            title={p.name}
          >
            {p.name}
          </button>
        ))}
      </div>
      <label className="duration">
        <span className="duration-row">
          <span>Dauer</span>
          <span className="num">{isCut ? 'sofort' : `${preset?.durationMs ?? 0} ms`}</span>
        </span>
        <input
          type="range"
          min={MIN_MS}
          max={MAX_MS}
          step={50}
          disabled={isCut || !preset}
          value={isCut ? MIN_MS : (preset?.durationMs ?? 600)}
          onChange={(e) => preset && dispatch({ type: 'savePreset', preset: { ...preset, durationMs: Number(e.target.value) } })}
          // Hand the keyboard back to the hotkeys once the drag is over.
          onPointerUp={(e) => e.currentTarget.blur()}
        />
      </label>
      <button className="linkbtn" onClick={() => setSaving(true)} disabled={!preset}>
        Als Preset speichern
      </button>
      <button
        className="take"
        disabled={!canTake}
        onClick={(e) => {
          e.currentTarget.blur(); // keep Space/Enter for the hotkeys
          dispatch({ type: 'take', now: Date.now() });
        }}
      >
        TAKE
        <span className="take-sub">Leertaste, C schneidet hart</span>
      </button>
      {running && preset ? (
        <TakeProgress startedAt={state.transition.startedAt!} durationMs={preset.durationMs} />
      ) : (
        <div className="take-progress" aria-hidden="true" />
      )}

      {saving && (
        <Dialog
          title="Übergang als Preset speichern"
          onCancel={() => setSaving(false)}
          actions={
            <>
              <button className="btn ghost" onClick={() => setSaving(false)}>
                Abbrechen
              </button>
              <button className="btn primary" onClick={save} disabled={!name.trim()}>
                Speichern
              </button>
            </>
          }
        >
          <p>
            Speichert „{preset?.name}“ mit {preset?.durationMs} ms als eigenen Knopf.
          </p>
          <label className="field" style={{ marginBottom: 18 }}>
            <span>Name</span>
            <input
              className="input"
              autoFocus
              value={name}
              placeholder="z. B. Langsame Blende"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </label>
        </Dialog>
      )}
    </div>
  );
}
