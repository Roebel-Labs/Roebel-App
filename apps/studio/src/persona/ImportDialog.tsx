import { useCallback, useEffect, useState } from 'react';
import {
  addPersonaImport, buildPersona, ChatApiError, createPersonaLink, deletePersonaImport, deletePersonaLink, fetchPersonaImports, fetchPersonaLinks,
  type ImportKind, type LinkCreated, type LinkToken,
} from '../workspace/api';
import { IconCheck, IconCopy, IconTrash } from '../ui/shell/line-icons';
import { LoadError, Modal, useLoad } from './common';
import { fmtDate, friendlyError } from './format';

type Tab = ImportKind | 'link';
const TABS: Array<{ id: Tab; label: string; app: string }> = [
  { id: 'claude', label: 'Claude', app: 'Claude' },
  { id: 'chatgpt', label: 'ChatGPT', app: 'ChatGPT' },
  { id: 'text', label: 'Freitext', app: '' },
  { id: 'link', label: 'Mit Claude verbinden', app: '' },
];
const MAX_LINKS = 5;
const KIND_LABEL: Record<ImportKind, string> = { claude: 'Claude', chatgpt: 'ChatGPT', text: 'Freitext' };
const MAX_CHARS = 60_000;

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/** Import what Claude or ChatGPT already know about the user (or any free text) as a wiki source. */
export function ImportDialog({ token, mode = 'refresh', onClose, onBuildStarted }: { token: string; mode?: 'full' | 'refresh'; onClose: () => void; onBuildStarted: () => void }) {
  const [tab, setTab] = useState<Tab>('claude');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [changed, setChanged] = useState(false);
  const imports = useLoad(() => fetchPersonaImports(token));
  const app = TABS.find((t) => t.id === tab)?.app ?? '';
  const prompt = imports.data?.exportPrompt ?? '';

  const save = async () => {
    if (tab === 'link') return;
    setBusy(true);
    setError(null);
    try {
      await addPersonaImport(token, { kind: tab, title: title.trim() || undefined, text: text.trim() });
      setText('');
      setTitle('');
      setChanged(true);
      await imports.reload(true);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await deletePersonaImport(token, id);
      setChanged(true);
      await imports.reload(true);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      await buildPersona(token, mode);
      onBuildStarted();
      onClose();
    } catch (e) {
      if (e instanceof ChatApiError && e.status === 409) {
        onBuildStarted();
        onClose();
      } else setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const tooLong = text.length > MAX_CHARS;

  return (
    <Modal
      title="Importieren"
      size="lg"
      onClose={onClose}
      footer={
        <>
          {changed && <span className="w-muted pz-foot-note">{mode === 'full' ? 'Gespeichert. Jetzt kannst du dein Wiki aufbauen.' : 'Gespeichert. Damit das Wiki die Änderung übernimmt, aktualisiere es.'}</span>}
          <button className="w-btn" onClick={onClose}>
            Schließen
          </button>
          {tab === 'link' ? null : changed ? (
            <button className="w-btn green" disabled={busy} onClick={() => void refresh()}>
              {mode === 'full' ? 'Wiki jetzt aufbauen' : 'Wiki aktualisieren'}
            </button>
          ) : (
            <button className="w-btn green" disabled={busy || !text.trim() || tooLong} onClick={() => void save()}>
              {busy ? 'Speichere …' : 'Speichern'}
            </button>
          )}
        </>
      }
    >
      <div className="pz-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" className="pz-chip" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'link' ? (
        <LinkPanel token={token} />
      ) : (
        <>
        {tab !== 'text' ? (
          <>
            <ol className="pz-steps">
              <li>Kopiere diesen Text in {app}.</li>
              <li>Füge die Antwort hier ein.</li>
            </ol>
            <div className="pz-prompt">
              {imports.loading && !imports.data ? (
                <span className="w-muted">Lade …</span>
              ) : prompt ? (
                <pre>{prompt}</pre>
              ) : (
                <span className="w-muted">Der Text zum Kopieren ist gerade nicht verfügbar. Du kannst trotzdem eine Antwort einfügen.</span>
              )}
              {prompt && (
                <button
                  className="w-btn pz-prompt-copy"
                  onClick={() =>
                    void copyText(prompt).then((ok) => {
                      setCopied(ok);
                      if (ok) setTimeout(() => setCopied(false), 2000);
                    })
                  }
                >
                  {copied ? <IconCheck size={15} /> : <IconCopy size={15} />} {copied ? 'Kopiert' : 'Kopieren'}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="w-muted pz-p">Schreib oder füge ein, was Ortis über dich wissen soll: Lebenslauf, Vereinsbeschreibung, Notizen, Arbeitsweise.</p>
            <label className="pz-field">
              <span>Titel (optional)</span>
              <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Über meinen Verein" />
            </label>
          </>
        )}

        <label className="pz-field">
          <span>{tab === 'text' ? 'Text' : `Antwort von ${app}`}</span>
          <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={tab === 'text' ? 'Text hier einfügen' : 'Antwort hier einfügen'} />
        </label>
        <div className={`pz-count${tooLong ? ' over' : ''}`}>
          {text.length.toLocaleString('de-DE')} / {MAX_CHARS.toLocaleString('de-DE')} Zeichen
        </div>
        {changed && text.trim() && !tooLong && (
          <button className="w-btn" disabled={busy} onClick={() => void save()}>
            Weiteren Import speichern
          </button>
        )}
        {error && <div className="ws-error">{error}</div>}

        <h3 className="pz-h3">Bisherige Importe</h3>
        {imports.error && !imports.data ? (
          <LoadError message={imports.error} onRetry={() => void imports.reload()} />
        ) : imports.data && imports.data.imports.length === 0 ? (
          <div className="w-muted">Noch nichts importiert.</div>
        ) : (
          <ul className="pz-rows">
            {imports.data?.imports.map((im) => (
              <li key={im.id} className="pz-row">
                <div className="pz-row-text">
                  <strong className="w-ellipsis">{im.title || KIND_LABEL[im.kind]}</strong>
                  <span className="w-muted">
                    {KIND_LABEL[im.kind]} · {im.chars.toLocaleString('de-DE')} Zeichen · {fmtDate(im.createdAt)}
                  </span>
                </div>
                <button className="w-icon" aria-label="Import löschen" title="Import löschen" disabled={busy} onClick={() => void remove(im.id)}>
                  <IconTrash size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        </>
      )}
    </Modal>
  );
}

/** A value with its own copy button (connector URL, command, prompt). */
function CopyBlock({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="pz-copy">
      <div className="pz-copy-head">
        <strong>{label}</strong>
        <button
          className="w-btn pz-copy-btn"
          onClick={() =>
            void copyText(value).then((ok) => {
              setCopied(ok);
              if (ok) setTimeout(() => setCopied(false), 2000);
            })
          }
        >
          {copied ? <IconCheck size={15} /> : <IconCopy size={15} />} {copied ? 'Kopiert' : 'Kopieren'}
        </button>
      </div>
      {hint && <span className="w-muted">{hint}</span>}
      <pre>{value}</pre>
    </div>
  );
}

type LinkState = { state: 'loading' } | { state: 'unavailable' } | { state: 'error'; message: string } | { state: 'ready'; tokens: LinkToken[]; syncPrompt: string };

/** "Mit Claude verbinden": Claude reads the wiki and writes new knowledge back through a personal MCP link. */
function LinkPanel({ token }: { token: string }) {
  const [links, setLinks] = useState<LinkState>({ state: 'loading' });
  const [created, setCreated] = useState<LinkCreated | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetchPersonaLinks(token);
      setLinks({ state: 'ready', tokens: r.tokens ?? [], syncPrompt: r.syncPrompt ?? '' });
    } catch (e) {
      // The endpoint ships with a later backend: until then the panel stays quiet instead of showing an error.
      if (e instanceof ChatApiError && e.status === 404) setLinks({ state: 'unavailable' });
      else setLinks({ state: 'error', message: friendlyError(e) });
    }
  }, [token]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      setCreated(await createPersonaLink(token));
      await reload();
    } catch (e) {
      if (e instanceof ChatApiError && e.status === 404) setLinks({ state: 'unavailable' });
      else setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await deletePersonaLink(token, id);
      if (created?.token.id === id) setCreated(null);
      await reload();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (links.state === 'loading') return <span className="w-muted">Lade …</span>;
  if (links.state === 'unavailable') return <p className="w-muted pz-p">Die Verbindung mit Claude ist noch nicht verfügbar. Sie kommt mit einem der nächsten Updates.</p>;
  if (links.state === 'error') return <LoadError message={links.message} onRetry={() => void reload()} />;

  const full = links.tokens.length >= MAX_LINKS;
  return (
    <>
      <p className="pz-p">
        Claude (claude.ai, Claude Code oder Claude Desktop) kann dein Ortis-Wiki lesen und neues Wissen aus euren Gesprächen dorthin zurückschreiben. Du
        erstellst dafür eine persönliche Verbindung und fügst sie in Claude ein.
      </p>
      {created ? (
        <div className="pz-link-created" role="status">
          <span className="pz-link-once">Diese Angaben siehst du nur jetzt. Kopiere, was du brauchst, bevor du das Fenster schließt.</span>
          <CopyBlock label="Adresse für claude.ai und Claude Desktop" hint="Unter Einstellungen → Konnektoren als eigenen Konnektor hinzufügen." value={created.connectorUrl} />
          <CopyBlock label="Befehl für Claude Code" hint="Einmal im Terminal ausführen." value={created.claudeCodeCommand} />
          <CopyBlock label="Text für den Abgleich" hint="In Claude einfügen, damit es dein Wiki liest und Neues einträgt." value={created.syncPrompt} />
        </div>
      ) : (
        <button className="w-btn green" disabled={busy || full} onClick={() => void create()}>
          {busy ? 'Erstelle …' : 'Verbindung erstellen'}
        </button>
      )}
      {full && !created && <span className="w-muted">Du hast schon {MAX_LINKS} Verbindungen. Trenne eine, um eine neue zu erstellen.</span>}
      {error && <div className="ws-error">{error}</div>}

      <h3 className="pz-h3">Bestehende Verbindungen</h3>
      {links.tokens.length === 0 ? (
        <div className="w-muted">Noch keine Verbindung.</div>
      ) : (
        <ul className="pz-rows">
          {links.tokens.map((t) => (
            <li key={t.id} className="pz-row">
              <div className="pz-row-text">
                <strong className="w-ellipsis">{t.label || 'Claude'}</strong>
                <span className="w-muted">
                  Erstellt {fmtDate(t.createdAt)} · {t.lastUsedAt ? `zuletzt genutzt ${fmtDate(t.lastUsedAt)}` : 'noch nicht genutzt'}
                </span>
              </div>
              <button className="w-btn" disabled={busy} onClick={() => void remove(t.id)}>
                Trennen
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
