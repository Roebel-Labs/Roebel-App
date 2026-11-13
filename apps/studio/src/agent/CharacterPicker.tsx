// "Ändern" / "Agent hinzufügen": pick a character in two steps (grid, then confirm with personality), like the
// reference flow. The caller decides what confirming does (new agent, new look for an agent, new main assistant).
import { useEffect, useRef, useState } from 'react';
import { IconBack, IconCheck, IconChevronDown, IconClose, IconCopy, IconPencil, IconShuffle } from '../ui/shell/line-icons';
import { Tip } from '../ui/Tooltip';
import type { AgentPersonality } from '../workspace/api';
import { CHARACTERS, characterById, roleLine, type Character } from './characters';

export interface PickerResult {
  character: string;
  name: string;
  personality: string;
}

export function CharacterPicker({
  initialCharacter, initialName, initialPersonality, personalities, mailAddress, ownerEmail, confirmVerb = 'Bestätigen', onClose, onConfirm,
}: {
  initialCharacter?: string | null;
  initialName?: string;
  initialPersonality?: string;
  personalities: AgentPersonality[];
  /** Shown when the agent is (or becomes) the main assistant. */
  mailAddress?: string | null;
  ownerEmail?: string | null;
  confirmVerb?: string;
  onClose: () => void;
  /** Resolves with an error message, or null when done. */
  onConfirm: (r: PickerResult) => Promise<string | null>;
}) {
  const first = characterById(initialCharacter) ?? CHARACTERS[0];
  const [character, setCharacter] = useState<Character>(first);
  // The name follows the character until the person types one.
  const [name, setName] = useState(initialName && initialName !== first.name ? initialName : first.name);
  const [nameTouched, setNameTouched] = useState(Boolean(initialName && initialName !== first.name));
  const [personality, setPersonality] = useState(initialPersonality ?? first.personality);
  const [personalityTouched, setPersonalityTouched] = useState(Boolean(initialPersonality));
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openPersonality, setOpenPersonality] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, busy]);

  const choose = (c: Character) => {
    setCharacter(c);
    if (!nameTouched) setName(c.name);
    if (!personalityTouched) setPersonality(c.personality);
  };
  const shuffle = () => {
    const others = CHARACTERS.filter((c) => c.id !== character.id);
    choose(others[Math.floor(Math.random() * others.length)]);
  };
  const shownName = name.trim() || character.name;
  const chosen = personalities.find((p) => p.key === personality);
  const mailShown = mailAddress ? mailAddress.replace(/^[^@]*/, shownName.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'assistent') : null;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const failed = await onConfirm({ character: character.id, name: shownName, personality });
    setBusy(false);
    if (failed) setError(failed);
  };

  return (
    <div className="dlg-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="cp" role="dialog" aria-label="Agent auswählen" style={{ ['--cp-color' as string]: character.color }}>
        <header className="cp-hero">
          <div className="cp-hero-bar">
            {step === 2 ? (
              <button className="w-icon" aria-label="Zurück" onClick={() => setStep(1)} disabled={busy}>
                <IconBack size={18} />
              </button>
            ) : (
              <span />
            )}
            <button className="w-icon" aria-label="Schließen" onClick={onClose} disabled={busy}>
              <IconClose size={18} />
            </button>
          </div>
          <div className="cp-hero-text">
            <div className="cp-name-row">
              <input
                ref={nameRef}
                className="cp-name"
                value={name}
                maxLength={30}
                aria-label="Name"
                size={Math.max(3, shownName.length)}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameTouched(true);
                }}
                onBlur={() => !name.trim() && (setName(character.name), setNameTouched(false))}
              />
              <Tip label="Namen ändern" side="top">
                <button className="w-icon" aria-label="Namen ändern" onClick={() => nameRef.current?.select()}>
                  <IconPencil size={17} />
                </button>
              </Tip>
              <Tip label="Zufällige Figur" side="top">
                <button className="w-icon" aria-label="Zufällige Figur" onClick={shuffle}>
                  <IconShuffle size={17} />
                </button>
              </Tip>
            </div>
            <p className="cp-tagline">{character.tagline}</p>
            <p className="cp-role">{roleLine(character)}</p>
            {mailShown && (
              <span className="cp-mail">
                {mailShown}
                {step === 2 && (
                  <button className="w-icon" aria-label="Adresse kopieren" onClick={() => void navigator.clipboard.writeText(mailShown).catch(() => {})}>
                    <IconCopy size={14} />
                  </button>
                )}
              </span>
            )}
          </div>
          <img key={character.id} className="cp-figure" src={character.figure} alt="" draggable={false} />
        </header>

        {step === 1 ? (
          <div className="cp-grid" role="radiogroup" aria-label="Figuren">
            {CHARACTERS.map((c) => (
              <button key={c.id} className="cp-tile" role="radio" aria-checked={c.id === character.id} aria-label={c.name} style={{ ['--tile-color' as string]: c.color }} onClick={() => choose(c)} onDoubleClick={() => (choose(c), setStep(2))}>
                <img src={c.tile} alt="" draggable={false} />
                <span className="cp-tile-name">{c.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="cp-body">
            {mailShown && (
              <section className="cp-card">
                <div className="cp-card-head">
                  <strong>E-Mail-Adresse</strong>
                  <span>{mailShown}</span>
                </div>
                <p className="w-muted">
                  Du kannst {shownName} E-Mails schreiben oder beliebige Inhalte weiterleiten.
                  {ownerEmail ? ` ${shownName} antwortet nur auf Nachrichten von ${ownerEmail}. Andere können ${shownName} nicht per E-Mail an diese Adresse aktivieren.` : ` ${shownName} antwortet nur auf Nachrichten von deiner bestätigten Adresse.`}
                </p>
              </section>
            )}
            <section className="cp-card">
              <div className="cp-card-head">
                <strong>Aufgabe</strong>
              </div>
              <p className="w-muted">
                {roleLine(character)}. {character.tagline} Bei allem anderen hilft {shownName} trotzdem.
              </p>
            </section>
            <section className="cp-card">
              <button className="cp-card-toggle" aria-expanded={openPersonality} onClick={() => setOpenPersonality((v) => !v)}>
                <span>
                  <strong>Persönlichkeit</strong>
                  <span className="w-muted">{chosen ? `${chosen.title}: ${chosen.description}` : ''}</span>
                </span>
                <span className={`cp-chev${openPersonality ? ' open' : ''}`}>
                  <IconChevronDown size={18} />
                </span>
              </button>
              {openPersonality && (
                <div className="cp-presets" role="radiogroup" aria-label="Persönlichkeit">
                  {personalities.map((p) => (
                    <button
                      key={p.key}
                      className="ag-preset"
                      role="radio"
                      aria-checked={personality === p.key}
                      onClick={() => {
                        setPersonality(p.key);
                        setPersonalityTouched(true);
                      }}
                    >
                      <span className="ag-preset-mark" aria-hidden="true">
                        {personality === p.key && <IconCheck size={14} />}
                      </span>
                      <span className="ag-preset-text">
                        <strong>{p.title}</strong>
                        <span className="w-muted">{p.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
            {error && <div className="ws-error">{error}</div>}
          </div>
        )}

        <footer className="cp-foot">
          <span className="w-muted">{step === 1 ? `${CHARACTERS.length} Figuren` : 'Du kannst die Figur oder den Namen jederzeit ändern.'}</span>
          {step === 1 ? (
            <button className="w-btn green cp-cta" onClick={() => setStep(2)}>
              Weiter <span aria-hidden="true">›</span>
            </button>
          ) : (
            <button className="w-btn green cp-cta" onClick={() => void confirm()} disabled={busy}>
              {busy ? '…' : `${confirmVerb}: ${shownName}`} {!busy && <span aria-hidden="true">›</span>}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
