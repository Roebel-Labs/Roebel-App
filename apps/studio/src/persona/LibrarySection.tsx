import { useEffect, useMemo, useState } from 'react';
import { fetchFile, fetchLibrary, type LibraryCollection, type LibraryFile } from '../workspace/api';
import { IconClock, IconFile, IconFolder, IconImage, IconLoop } from '../ui/shell/line-icons';
import { Frame, LoadError, Modal, openExternal, SearchField, SignedOutHint, useLoad, useSessionToken, type NavEntry } from './common';
import { filterLibrary, fmtDate, friendlyError } from './format';
import { Md } from './Md';
import './persona.css';

type Kind = 'all' | 'document' | 'image';
const KIND_LABEL: Record<LibraryFile['kind'], string> = { document: 'Dokument', image: 'Bild' };
const RECENT = 'recent';

function CollectionIcon({ kind, size = 18 }: { kind: LibraryCollection['kind']; size?: number }) {
  return kind === 'recent' ? <IconClock size={size} /> : kind === 'routine' ? <IconLoop size={size} /> : <IconFolder size={size} />;
}

/** Bibliothek: every document and image the assistants produced, across all conversations. */
export function LibrarySection() {
  const session = useSessionToken();
  const token = session.token;
  const load = useLoad(token ? () => fetchLibrary(token) : null, session.signedOut);
  const [collection, setCollection] = useState(RECENT);
  const [kind, setKind] = useState<Kind>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<LibraryFile | null>(null);

  const collections = load.data?.collections ?? [];
  const others = collections.filter((c) => c.kind !== 'recent');
  const nav: NavEntry[] = [
    { id: RECENT, label: 'Meine Dateien' },
    ...others.map((c) => ({ id: c.id, label: c.label, indent: true, icon: <CollectionIcon kind={c.kind} size={16} /> })),
  ];
  const files = useMemo(() => filterLibrary(load.data?.files ?? [], collection, kind, q), [load.data, collection, kind, q]);
  const current = collections.find((c) => c.id === collection);
  const total = load.data?.files.length ?? 0;

  return (
    <Frame title="Bibliothek" nav={nav} active={collection} onSelect={setCollection} wide>
      <h1 className="pz-title">{collection === RECENT ? 'Meine Dateien' : current?.label ?? 'Sammlung'}</h1>
      {session.state === 'loading' && <div className="pz-state w-muted">Lade …</div>}
      {session.state === 'signed-out' && <SignedOutHint what="deine Dateien" />}
      {token && load.loading && !load.data && <div className="pz-state w-muted">Lade …</div>}
      {token && load.error && !load.data && <LoadError message={load.error} onRetry={() => void load.reload()} />}

      {load.data && (
        <>
          <div className="pz-toolbar">
            <SearchField value={q} onChange={setQ} placeholder="Dateien suchen" />
            <select className="pz-select" aria-label="Art" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              <option value="all">Alle Arten</option>
              <option value="document">Dokument</option>
              <option value="image">Bild</option>
            </select>
          </div>

          {collection === RECENT && collections.length > 0 && (
            <section className="pz-block">
              <h2>Sammlungen</h2>
              <p className="pz-lead">Inhalte aus deinen Unterhaltungen und Routinen, nach Herkunft gruppiert.</p>
              <div className="pz-collections">
                {collections.map((c) => (
                  <button key={c.id} className="pz-collection" onClick={() => setCollection(c.id)}>
                    <span className={`pz-tile plain ${c.kind}`} aria-hidden="true">
                      <CollectionIcon kind={c.kind} size={20} />
                    </span>
                    <span className="pz-row-text">
                      <strong className="w-ellipsis">{c.label}</strong>
                      <span className="w-muted">{c.count === 1 ? '1 Datei' : `${c.count} Dateien`}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="pz-block">
            <h2>{collection === RECENT ? 'Alle Dateien' : 'Dateien'}</h2>
            {total === 0 ? (
              <div className="pz-empty">
                <strong>Noch keine Dateien</strong>
                <span className="w-muted">Dokumente und Bilder, die deine Assistenten erstellen, erscheinen hier.</span>
              </div>
            ) : files.length === 0 ? (
              <div className="pz-state w-muted">Nichts gefunden.</div>
            ) : (
              <ul className="pz-files">
                {files.map((f) => (
                  <li key={f.id}>
                    <button className="pz-file" onClick={() => setOpen(f)}>
                      {f.kind === 'image' && f.url ? (
                        <img className="pz-file-thumb" src={f.url} alt="" loading="lazy" />
                      ) : (
                        <span className="pz-file-thumb icon" aria-hidden="true">
                          {f.kind === 'image' ? <IconImage size={18} /> : <IconFile size={18} />}
                        </span>
                      )}
                      <span className="pz-row-text">
                        <span className="pz-file-name w-ellipsis">{f.name}</span>
                        <span className="w-muted w-ellipsis">{f.routineTitle || f.threadTitle}</span>
                      </span>
                      <span className="w-tag">{KIND_LABEL[f.kind] ?? f.kind}</span>
                      <span className="w-muted pz-file-date">{fmtDate(f.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {open && token && (open.kind === 'image' ? <Lightbox file={open} onClose={() => setOpen(null)} /> : <Reader token={token} file={open} onClose={() => setOpen(null)} />)}
    </Frame>
  );
}

function Reader({ token, file, onClose }: { token: string; file: LibraryFile; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchFile(token, file.id)
      .then((r) => alive && setContent(r.file.content ?? ''))
      .catch((e) => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [token, file.id]);
  const markdown = /^(md|markdown|txt|)$/i.test(file.ext);
  return (
    <Modal title={file.name} size="lg" onClose={onClose}>
      {error ? (
        <div className="ws-error">{error}</div>
      ) : content === null ? (
        <div className="w-muted">Lade …</div>
      ) : markdown ? (
        <Md source={content} />
      ) : (
        <pre className="pz-raw">{content}</pre>
      )}
    </Modal>
  );
}

function Lightbox({ file, onClose }: { file: LibraryFile; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="dlg-backdrop pz-lightbox" role="dialog" aria-label={file.name} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {file.url ? <img src={file.url} alt={file.name} /> : <div className="ws-error">Dieses Bild ist nicht mehr verfügbar.</div>}
      <div className="pz-lightbox-bar">
        <span className="w-ellipsis">{file.name}</span>
        {file.url && (
          <button className="w-btn" onClick={() => openExternal(file.url ?? '')}>
            Im Browser öffnen
          </button>
        )}
        <button className="w-btn" onClick={onClose}>
          Schließen
        </button>
      </div>
    </div>
  );
}
