// "Ändern" / "Agent hinzufügen": pick a character in two steps (grid, then confirm with personality), like the
// reference flow, or "Eigenes Bild": choose a picture, crop it, upload it, then name, role, instructions and
// personality. The caller decides what confirming does (new agent, new look for an agent, new main assistant).
import { useEffect, useRef, useState } from 'react';
import { t, tx } from '../i18n';
import { IconBack, IconCheck, IconChevronDown, IconClose, IconCopy, IconPencil, IconShuffle, IconUpload } from '../ui/shell/line-icons';
import { Tip } from '../ui/Tooltip';
import type { AgentPersonality } from '../workspace/api';
import { CHARACTERS, PICTURE_COLOR, characterById, roleLine, type Character } from './characters';
import { PictureCropper, choosePictureFile, pictureFileError, useDropTarget } from './OwnPicture';

export type PickerResult =
  | { kind: 'character'; character: string; name: string; personality: string }
  | { kind: 'own'; imageUrl: string; name: string; role: string; instructions: string; personality: string };

const ROLE_MAX = 120;
const INSTRUCTIONS_MAX = 4000;

export function CharacterPicker({
  initialCharacter, initialName, initialPersonality, personalities, mailAddress, ownerEmail, confirmVerb = 'Bestätigen', uploadPicture, onClose, onConfirm,
}: {
  initialCharacter?: string | null;
  initialName?: string;
  initialPersonality?: string;
  personalities: AgentPersonality[];
  /** Shown when the agent is (or becomes) the main assistant. */
  mailAddress?: string | null;
  ownerEmail?: string | null;
  /** German source text; translated where it is shown. */
  confirmVerb?: string;
  /** Uploads a cropped JPEG and resolves with its url; throws with a message to show. Without it there is no "Eigenes Bild". */
  uploadPicture?: (jpeg: Blob) => Promise<string>;
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
  const [step, setStep] = useState<1 | 'crop' | 2>(1);
  // "Eigenes Bild": own = chosen instead of a character; file = being cropped; ownUrl = uploaded.
  const [own, setOwn] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [ownUrl, setOwnUrl] = useState<string | null>(null);
  const [role, setRole] = useState('');
  const [instructions, setInstructions] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openPersonality, setOpenPersonality] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && !uploading && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, busy, uploading]);

  const choose = (c: Character) => {
    setOwn(false);
    setCharacter(c);
    if (!nameTouched) setName(c.name);
    if (!personalityTouched) setPersonality(c.personality);
  };
  const chooseOwn = () => {
    setOwn(true);
    if (!nameTouched) setName('');
    if (!personalityTouched) setPersonality('standard');
  };
  /** A file from the chooser or a drop: on to the crop step. */
  const take = (f: File) => {
    const bad = pictureFileError(f);
    setError(bad);
    if (bad) return;
    chooseOwn();
    setFile(f);
    setStep('crop');
  };
  const upload = async (jpeg: Blob) => {
    if (!uploadPicture) return;
    setUploading(true);
    setError(null);
    try {
      setOwnUrl(await uploadPicture(jpeg));
      setFile(null);
      setStep(2);
      setTimeout(() => nameRef.current?.focus(), 0);
    } catch (e) {
      setError((e as Error).message || t('Das hat nicht geklappt.'));
    } finally {
      setUploading(false);
    }
  };
  const drop = useDropTarget(take);
  const next = () => {
    if (!own) return setStep(2);
    if (ownUrl) setStep(2);
    else choosePictureFile(take);
  };
  const shuffle = () => {
    const others = CHARACTERS.filter((c) => c.id !== character.id);
    choose(others[Math.floor(Math.random() * others.length)]);
  };
  const shownName = name.trim() || (own ? t('Dein Agent') : character.name);
  const missingName = own && !name.trim();
  const chosen = personalities.find((p) => p.key === personality);
  const mailShown = mailAddress ? mailAddress.replace(/^[^@]*/, shownName.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'assistent') : null;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const failed = await onConfirm(
      own && ownUrl
        ? { kind: 'own', imageUrl: ownUrl, name: name.trim(), role: role.trim(), instructions: instructions.trim(), personality }
        : { kind: 'character', character: character.id, name: shownName, personality },
    );
    setBusy(false);
    if (failed) setError(failed);
  };

  return (
    <div className="dlg-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && !uploading && onClose()}>
      <div className={`cp${own ? ' own' : ''}`} role="dialog" aria-label={t('Agent auswählen')} style={{ ['--cp-color' as string]: own ? PICTURE_COLOR : character.color }}>
        <header className="cp-hero">
          <div className="cp-hero-bar">
            {step !== 1 ? (
              <button className="w-icon" aria-label={t('Zurück')} onClick={() => (setStep(1), setFile(null), setError(null))} disabled={busy || uploading}>
                <IconBack size={18} />
              </button>
            ) : (
              <span />
            )}
            <button className="w-icon" aria-label={t('Schließen')} onClick={onClose} disabled={busy || uploading}>
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
                aria-label={t('Name')}
                placeholder={own ? t('Name') : undefined}
                size={Math.max(3, (name || (own ? t('Name') : shownName)).length)}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameTouched(true);
                }}
                onBlur={() => !name.trim() && !own && (setName(character.name), setNameTouched(false))}
              />
              <Tip label={t('Namen ändern')} side="top">
                <button className="w-icon" aria-label={t('Namen ändern')} onClick={() => nameRef.current?.select()}>
                  <IconPencil size={17} />
                </button>
              </Tip>
              {!own && (
                <Tip label={t('Zufällige Figur')} side="top">
                  <button className="w-icon" aria-label={t('Zufällige Figur')} onClick={shuffle}>
                    <IconShuffle size={17} />
                  </button>
                </Tip>
              )}
            </div>
            {own ? (
              <p className="cp-tagline">{role.trim() || t('Dein eigener Agent mit deinem Bild.')}</p>
            ) : (
              <>
                <p className="cp-tagline">{t(character.tagline)}</p>
                <p className="cp-role">{roleLine(character)}</p>
              </>
            )}
            {mailShown && (
              <span className="cp-mail">
                {mailShown}
                {step === 2 && (
                  <button className="w-icon" aria-label={t('Adresse kopieren')} onClick={() => void navigator.clipboard.writeText(mailShown).catch(() => {})}>
                    <IconCopy size={14} />
                  </button>
                )}
              </span>
            )}
          </div>
          {own ? (
            ownUrl ? (
              <img key={ownUrl} className="cp-photo" src={ownUrl} alt="" draggable={false} />
            ) : (
              <span className="cp-photo empty" aria-hidden="true">
                <IconUpload size={34} />
              </span>
            )
          ) : (
            <img key={character.id} className="cp-figure" src={character.figure} alt="" draggable={false} />
          )}
        </header>

        {step === 'crop' && file ? (
          <div className="cp-body cp-crop">
            <PictureCropper
              file={file}
              busy={uploading}
              error={error}
              confirmLabel={t('Weiter')}
              onCancel={() => choosePictureFile(take)}
              onConfirm={(b) => void upload(b)}
            />
          </div>
        ) : step === 1 ? (
          <div className={`cp-grid${drop.over ? ' over' : ''}`} role="radiogroup" aria-label={t('Figuren')} {...(uploadPicture ? drop.props : {})}>
            {error && <div className="ws-error cp-grid-error">{error}</div>}
            {uploadPicture && (
              <button
                className="cp-tile cp-own"
                role="radio"
                aria-checked={own}
                aria-label={t('Eigenes Bild')}
                onClick={() => (own || !ownUrl ? choosePictureFile(take) : chooseOwn())}
              >
                {ownUrl ? <img src={ownUrl} alt="" draggable={false} /> : (
                  <span className="cp-own-empty">
                    <IconUpload size={24} />
                    <span>{t('Eigenes Bild')}</span>
                  </span>
                )}
                {ownUrl && <span className="cp-tile-name">{t('Eigenes Bild')}</span>}
              </button>
            )}
            {CHARACTERS.map((c) => (
              <button key={c.id} className="cp-tile" role="radio" aria-checked={!own && c.id === character.id} aria-label={c.name} style={{ ['--tile-color' as string]: c.color }} onClick={() => choose(c)} onDoubleClick={() => (choose(c), setStep(2))}>
                <img src={c.tile} alt="" draggable={false} />
                <span className="cp-tile-name">{c.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="cp-body">
            {own && (
              <section className="cp-card">
                <label className="cp-field">
                  <strong>{t('Wofür ist dein Agent da?')}</strong>
                  <input className="ag-input" value={role} maxLength={ROLE_MAX} placeholder={t('z. B. Hilft mir mit dem Verein und seinen Terminen')} onChange={(e) => setRole(e.target.value)} />
                </label>
                <label className="cp-field">
                  <strong>{t('Wie soll er arbeiten?')}</strong>
                  <span className="w-muted">{t('Optional. Ton, Vorlieben, was er lassen soll.')}</span>
                  <textarea
                    className="ag-input ag-textarea"
                    rows={4}
                    value={instructions}
                    maxLength={INSTRUCTIONS_MAX}
                    placeholder={t('z. B. Antworte kurz und freundlich. Frag nach, bevor du etwas verschickst.')}
                    onChange={(e) => setInstructions(e.target.value)}
                  />
                </label>
              </section>
            )}
            {mailShown && (
              <section className="cp-card">
                <div className="cp-card-head">
                  <strong>{t('E-Mail-Adresse')}</strong>
                  <span>{mailShown}</span>
                </div>
                <p className="w-muted">
                  {t('Du kannst {name} E-Mails schreiben oder beliebige Inhalte weiterleiten.', { name: shownName })}{' '}
                  {ownerEmail
                    ? t('{name} antwortet nur auf Nachrichten von {email}. Andere können {name} nicht per E-Mail an diese Adresse aktivieren.', { name: shownName, email: ownerEmail })
                    : t('{name} antwortet nur auf Nachrichten von deiner bestätigten Adresse.', { name: shownName })}
                </p>
              </section>
            )}
            {!own && (
              <section className="cp-card">
                <div className="cp-card-head">
                  <strong>{tx('role', 'Aufgabe')}</strong>
                </div>
                <p className="w-muted">
                  {roleLine(character)}. {t(character.tagline)} {t('Bei allem anderen hilft {name} trotzdem.', { name: shownName })}
                </p>
              </section>
            )}
            <section className="cp-card">
              <button className="cp-card-toggle" aria-expanded={openPersonality} onClick={() => setOpenPersonality((v) => !v)}>
                <span>
                  <strong>{t('Persönlichkeit')}</strong>
                  <span className="w-muted">{chosen ? `${chosen.title}: ${chosen.description}` : ''}</span>
                </span>
                <span className={`cp-chev${openPersonality ? ' open' : ''}`}>
                  <IconChevronDown size={18} />
                </span>
              </button>
              {openPersonality && (
                <div className="cp-presets" role="radiogroup" aria-label={t('Persönlichkeit')}>
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
          <span className="w-muted">
            {step === 1
              ? uploadPicture
                ? t('{n} Figuren oder dein eigenes Bild', { n: CHARACTERS.length })
                : t('{n} Figuren', { n: CHARACTERS.length })
              : step === 'crop'
                ? t('Das Bild wird quadratisch zugeschnitten.')
                : own
                  ? missingName
                    ? t('Gib deinem Agenten einen Namen.')
                    : t('Du kannst Bild, Namen und Aufgabe jederzeit ändern.')
                  : t('Du kannst die Figur oder den Namen jederzeit ändern.')}
          </span>
          {step === 1 ? (
            <button className="w-btn green cp-cta" onClick={next}>
              {t('Weiter')} <span aria-hidden="true">›</span>
            </button>
          ) : step === 'crop' ? (
            <span />
          ) : (
            <button className="w-btn green cp-cta" onClick={() => void confirm()} disabled={busy || missingName}>
              {busy ? '…' : `${t(confirmVerb)}: ${shownName}`} {!busy && <span aria-hidden="true">›</span>}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
