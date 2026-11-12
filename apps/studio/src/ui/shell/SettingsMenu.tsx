import { useEffect, useRef, useState } from 'react';
import { ACCENT_PRESETS, applyAccent, loadAccent, normalizeAccent, saveAccent } from './accent';
import { IconCheck, IconSettings } from './line-icons';
import { onDesktopCommand } from '../../workspace/desktop';

/** Toolbar gear (Town position): appearance settings. Today: the primary colour. */
export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [accent, setAccent] = useState(loadAccent);
  const ref = useRef<HTMLDivElement>(null);

  // Tray → "Einstellungen …"
  useEffect(() => onDesktopCommand((c) => c.kind === 'settings' && setOpen(true)), []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const choose = (raw: string) => {
    const v = normalizeAccent(raw);
    if (!v) return;
    setAccent(v);
    applyAccent(v);
    saveAccent(v);
  };

  return (
    <div className="tb-settings" ref={ref}>
      <button className="tb-icon" title="Einstellungen" aria-label="Einstellungen" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <IconSettings />
      </button>
      {open && (
        <div className="tb-popover" role="dialog" aria-label="Einstellungen">
          <div className="tb-popover-title">Akzentfarbe</div>
          <div className="tb-swatches">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.value}
                className="tb-swatch"
                style={{ background: p.value }}
                title={p.name}
                aria-label={p.name}
                aria-pressed={accent === p.value}
                onClick={() => choose(p.value)}
              >
                {accent === p.value && <IconCheck size={14} />}
              </button>
            ))}
          </div>
          <label className="tb-custom">
            <span>Eigene Farbe</span>
            <input type="color" value={accent} onChange={(e) => choose(e.target.value)} />
            <code>{accent}</code>
          </label>
          <p className="tb-hint">Gilt für Schaltflächen, Vorschläge und Hervorhebungen im Arbeitsbereich.</p>
        </div>
      )}
    </div>
  );
}
