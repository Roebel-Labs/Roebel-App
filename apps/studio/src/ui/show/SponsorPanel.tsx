import { useState } from 'react';
import { useShow } from '../../state/store';
import { errorText } from '../engine';
import { failedSponsorIds } from './sponsor-runtime';

async function pickLogo(): Promise<string | null> {
  const path = await window.studio.dialog.pickFile('image');
  return path ? await window.studio.media.allow(path) : null;
}

function AddPartner({ onClose }: { onClose: () => void }) {
  const { dispatch } = useShow();
  const [name, setName] = useState('');
  const [logo, setLogo] = useState<{ url: string; file: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async () => {
    setError(null);
    try {
      const path = await window.studio.dialog.pickFile('image');
      if (path) setLogo({ url: await window.studio.media.allow(path), file: path.split('/').pop() ?? path });
    } catch (e) {
      setError(errorText(e));
    }
  };
  const ok = name.trim() !== '' && logo !== null;
  const add = () => {
    if (!ok) return;
    dispatch({ type: 'addSponsor', sponsor: { name: name.trim(), logoUrl: logo.url } });
    onClose();
  };
  return (
    <div className="spn-add">
      <input
        className="input"
        placeholder="Name des Partners"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add();
          if (e.key === 'Escape') onClose();
        }}
      />
      <button className="btn ghost" onClick={choose}>
        {logo ? logo.file : 'Logo wählen …'}
      </button>
      <button className="btn" disabled={!ok} onClick={add}>
        Hinzufügen
      </button>
      <button className="btn ghost" onClick={onClose}>
        Abbrechen
      </button>
      {error && <span className="spn-error">{error}</span>}
    </div>
  );
}

/** "Werbung": the partner list for the break spots and the Werbeblock start/stop. */
export function SponsorPanel() {
  const { state, dispatch } = useShow();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sp = state.sponsors;
  const failed = new Set(failedSponsorIds(state));
  const usable = sp.items.some((i) => i.logoUrl && !failed.has(i.id));
  const hasOverlay = state.overlays.some((o) => state.templates.find((t) => t.id === o.templateId)?.kind === 'breakSpot');

  const changeLogo = async (id: string) => {
    setError(null);
    try {
      const url = await pickLogo();
      if (url) dispatch({ type: 'updateSponsor', id, patch: { logoUrl: url } });
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <section>
      <div className="row-head spn-head">
        <span className="row-title">Werbung</span>
        {sp.breakActive ? (
          <button className="btn danger" onClick={() => dispatch({ type: 'stopBreak', now: Date.now() })}>
            Werbeblock beenden
          </button>
        ) : (
          <button
            className="btn"
            disabled={!usable || !hasOverlay}
            onClick={() => dispatch({ type: 'startBreak', now: Date.now(), failedIds: [...failed] })}
          >
            Werbeblock starten
          </button>
        )}
        {!sp.breakActive && !usable && <span className="hint">Erst Partner mit Logo hinzufügen</span>}
        {!sp.breakActive && usable && !hasOverlay && <span className="hint">Die Einblendung „Werbepause“ fehlt</span>}
        <label className="spn-rot">
          <span className="hint">Wechsel alle</span>
          <input
            className="input"
            type="number"
            min={3}
            max={60}
            value={sp.rotationSeconds}
            onChange={(e) => dispatch({ type: 'setRotationSeconds', seconds: Number(e.target.value) })}
          />
          <span className="hint">Sekunden</span>
        </label>
      </div>
      <div className="strip wrap">
        {sp.items.map((it, i) => (
          <div key={it.id} className={`spn${sp.breakActive && sp.currentId === it.id ? ' on' : ''}`}>
            <button className="spn-logo" title="Logo ändern" aria-label={`Logo von ${it.name} ändern`} onClick={() => changeLogo(it.id)}>
              {it.logoUrl ? <img src={it.logoUrl} alt="" /> : <span className="hint">Kein Logo</span>}
            </button>
            <span className="spn-name" title={failed.has(it.id) ? 'Logo konnte nicht geladen werden' : it.name}>
              {it.name}
              {failed.has(it.id) && <span className="spn-warn"> · Logo defekt</span>}
            </span>
            <button className="spn-btn" aria-label={`${it.name} nach vorn`} disabled={i === 0} onClick={() => dispatch({ type: 'moveSponsor', id: it.id, delta: -1 })}>
              ↑
            </button>
            <button
              className="spn-btn"
              aria-label={`${it.name} nach hinten`}
              disabled={i === sp.items.length - 1}
              onClick={() => dispatch({ type: 'moveSponsor', id: it.id, delta: 1 })}
            >
              ↓
            </button>
            <button
              className="spn-btn"
              aria-label={`${it.name} entfernen`}
              onClick={() => dispatch({ type: 'removeSponsor', id: it.id, now: Date.now(), failedIds: [...failed] })}
            >
              ×
            </button>
          </div>
        ))}
        {adding ? (
          <AddPartner onClose={() => setAdding(false)} />
        ) : (
          <button className="add-tile small spn-addbtn" onClick={() => setAdding(true)}>
            + Partner
          </button>
        )}
      </div>
      {error && <div className="spn-error">{error}</div>}
    </section>
  );
}
