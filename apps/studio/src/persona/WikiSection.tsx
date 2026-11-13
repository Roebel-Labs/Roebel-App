import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  buildPersona, ChatApiError, createPerson, deletePersona, deletePersonaPage, fetchPersona, fetchPersonaPage, savePersonaPage,
  type Page, type PageLink, type Persona, type PersonaUpdate,
} from '../workspace/api';
import { emitCommand } from '../workspace/desktop';
import { IconChat, IconChevronDown, IconClock, IconLink, IconLoop, IconPencil, IconPlus, IconRefresh, IconUpload } from '../ui/shell/line-icons';
import { BuildProgress, Confirm, Frame, Initial, LoadError, Modal, MoreMenu, PersonaOnboarding, SearchField, SignedOutHint, useLoad, usePoll, useSessionToken, type NavEntry } from './common';
import { fmtDate, fmtDay, friendlyError } from './format';
import { ImportDialog } from './ImportDialog';
import { takeWikiSlug } from './intent';
import { Md, MdInline } from './Md';
import { SkPage } from '../ui/Skeleton';
import './persona.css';

const UPDATES = '~updates';
const PEOPLE = '~people';
const UPDATES_SHORT = 3;
const UPDATES_MORE = 10;
const SOURCES_SHORT = 8;
const TOP_ORDER = ['overview', 'goals', 'projects', 'profile', 'notes'];
const FALLBACK_TITLES: Record<string, string> = { overview: 'Übersicht', goals: 'Ziele', projects: 'Projekte', profile: 'Profil', notes: 'Notizen' };

function buildNav(p: Persona | null): NavEntry[] {
  const pages = p?.pages ?? [];
  const title = (slug: string) => pages.find((x) => x.slug === slug)?.title || FALLBACK_TITLES[slug] || slug;
  const nav: NavEntry[] = [];
  for (const slug of TOP_ORDER) {
    if (slug !== 'overview' && p && !pages.some((x) => x.slug === slug)) continue;
    nav.push({ id: slug, label: title(slug) });
    if (slug === 'overview') nav.push({ id: UPDATES, label: 'Letzte Aktualisierungen', indent: true });
    for (const child of pages.filter((x) => x.parent === slug)) nav.push({ id: child.slug, label: child.title, indent: true });
  }
  // Pages the client does not know yet still get an entry.
  for (const x of pages) if (!nav.some((n) => n.id === x.slug)) nav.push({ id: x.slug, label: x.title, indent: !!x.parent });
  nav.push({ id: PEOPLE, label: 'Personen' });
  for (const person of [...(p?.people ?? [])].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name, 'de')))
    nav.push({ id: person.slug, label: person.name, indent: true, badge: person.name });
  return nav;
}

/** Wiki: what Ortis knows about the user, as readable and correctable pages. */
export function WikiSection() {
  const session = useSessionToken();
  const token = session.token;
  const [slug, setSlug] = useState<string>(() => takeWikiSlug() ?? 'overview');
  const [importing, setImporting] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // bumps reload the open page
  const load = useLoad(token ? () => fetchPersona(token) : null, session.signedOut);
  const persona = load.data;
  const status = persona?.status;
  const building = status?.state === 'building';
  usePoll(building, () => void load.reload(true));
  // A finished build changes page contents: reload the open page once.
  const builtAt = status?.builtAt ?? null;
  const lastBuilt = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!status) return;
    if (lastBuilt.current !== undefined && lastBuilt.current !== builtAt) setVersion((v) => v + 1);
    lastBuilt.current = builtAt;
  }, [status, builtAt]);

  const firstLoad = session.state === 'loading' || (!!token && load.loading && !persona);
  // While the page list is unknown the sub-navigation shows skeleton rows instead of guessed entries.
  const nav = useMemo(() => (persona ? buildNav(persona) : []), [persona]);
  const hasContent = !!persona && (persona.pages.length > 0 || persona.people.length > 0);

  const refresh = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await buildPersona(token, hasContent ? 'refresh' : 'full');
      await load.reload(true);
    } catch (e) {
      if (e instanceof ChatApiError && e.status === 409) await load.reload(true);
      else setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const wipe = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await deletePersona(token);
      setSlug('overview');
      await load.reload(true);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
      setWiping(false);
    }
  };

  const actions = token && persona && (
    <>
      <button className="w-btn ghost" onClick={() => emitCommand({ kind: 'compose' })}>
        <IconChat size={16} /> Im Chat fragen
      </button>
      <button className="w-btn" disabled={busy || building} onClick={() => void refresh()}>
        <IconRefresh size={15} /> Aktualisieren
      </button>
      <button className="w-btn" onClick={() => setImporting(true)}>
        <IconUpload size={15} /> Importieren
      </button>
      <MoreMenu items={[{ label: 'Wiki löschen', danger: true, onSelect: () => setWiping(true) }]} />
    </>
  );

  return (
    <Frame title="Wiki" nav={nav} active={slug} onSelect={setSlug} actions={actions || undefined} wide navLoading={firstLoad}>
      {firstLoad && <SkPage updates={slug === 'overview'} />}
      {session.state === 'signed-out' && <SignedOutHint what="die Seiten deines Wikis" />}
      {token && load.error && !persona && <LoadError message={load.error} onRetry={() => void load.reload()} />}
      {error && <div className="ws-error">{error}</div>}

      {token && persona && status && !hasContent && (
        <>
          <h1 className="pz-title">Wiki</h1>
          <PersonaOnboarding token={token} status={status} onChanged={() => void load.reload(true)} onImport={() => setImporting(true)} />
        </>
      )}

      {token && persona && status && hasContent && (
        <>
          {building && <BuildProgress status={status} compact />}
          {status.state === 'error' && <div className="ws-error">{status.error || 'Die letzte Aktualisierung ist fehlgeschlagen.'}</div>}
          {slug === UPDATES ? (
            <UpdatesPage updates={persona.updates} onWiki={setSlug} />
          ) : slug === PEOPLE ? (
            <PeoplePage token={token} persona={persona} onOpen={setSlug} onChanged={() => void load.reload(true)} />
          ) : (
            <PageView
              key={`${slug}:${version}`}
              token={token}
              slug={slug}
              updates={slug === 'overview' ? persona.updates : null}
              onAllUpdates={() => setSlug(UPDATES)}
              onWiki={setSlug}
              onChanged={() => void load.reload(true)}
              onDeleted={() => {
                setSlug(PEOPLE);
                void load.reload(true);
              }}
            />
          )}
        </>
      )}

      {importing && token && (
        <ImportDialog token={token} mode={hasContent ? 'refresh' : 'full'} onClose={() => setImporting(false)} onBuildStarted={() => void load.reload(true)} />
      )}
      {wiping && (
        <Confirm
          title="Wiki löschen?"
          body={<>Alle Seiten, Importe und Vorschläge werden endgültig gelöscht. Deine Unterhaltungen und Routinen bleiben erhalten.</>}
          confirmLabel="Wiki löschen"
          busy={busy}
          onConfirm={() => void wipe()}
          onCancel={() => setWiping(false)}
        />
      )}
    </Frame>
  );
}

// ---- updates ------------------------------------------------------------------------

function UpdateList({ updates, onWiki }: { updates: PersonaUpdate[]; onWiki: (slug: string) => void }) {
  return (
    <ul className="pz-updates">
      {updates.map((u, i) => (
        <li key={`${u.at}.${i}`}>
          <strong>{fmtDay(u.at)}</strong> <MdInline source={u.text} onWiki={onWiki} />
        </li>
      ))}
    </ul>
  );
}

function UpdatesPage({ updates, onWiki }: { updates: PersonaUpdate[]; onWiki: (slug: string) => void }) {
  return (
    <>
      <h1 className="pz-title">Letzte Aktualisierungen</h1>
      <p className="pz-lead">Was Ortis zuletzt im Wiki ergänzt oder geändert hat.</p>
      {updates.length === 0 ? <div className="pz-state w-muted">Noch keine Aktualisierungen.</div> : <UpdateList updates={updates} onWiki={onWiki} />}
    </>
  );
}

// ---- page ---------------------------------------------------------------------------

function PageView({
  token, slug, updates, onAllUpdates, onWiki, onChanged, onDeleted,
}: {
  token: string;
  slug: string;
  updates: PersonaUpdate[] | null;
  onAllUpdates: () => void;
  onWiki: (slug: string) => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const load = useLoad(useCallback(() => fetchPersonaPage(token, slug), [token, slug]));
  const page = load.data?.page ?? null;
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [moreUpdates, setMoreUpdates] = useState(false);
  const [allSources, setAllSources] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    try {
      await deletePersonaPage(token, slug);
      onDeleted();
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
      setRemoving(false);
    }
  };

  if (load.loading && !page) return <SkPage updates={!!updates && updates.length > 0} box={slug === 'overview' || slug === 'profile' || slug.startsWith('person-')} />;
  if (load.error && !page) return <LoadError message={load.error} onRetry={() => void load.reload()} />;
  if (!page) return null;

  const isPerson = page.kind === 'person';
  const avatarName = isPerson ? page.title : page.facts.find((f) => f.label.toLowerCase() === 'name')?.value || '';
  const showAvatar = (page.kind === 'overview' || page.kind === 'profile' || isPerson) && !!avatarName;
  const hasBox = page.facts.length > 0 || showAvatar;
  const shown = updates ? updates.slice(0, moreUpdates ? UPDATES_MORE : UPDATES_SHORT) : [];
  const sources = allSources ? page.sources : page.sources.slice(0, SOURCES_SHORT);
  // Links to pages that no longer exist or to the page itself are noise.
  const links = (list: PageLink[] | undefined) => (list ?? []).filter((l) => l.slug && l.title && l.slug !== page.slug);
  const backlinks = links(load.data?.backlinks);
  const related = links(load.data?.related);

  if (editing)
    return (
      <PageEditor
        token={token}
        page={page}
        onCancel={() => setEditing(false)}
        onSaved={(p) => {
          load.setData((d) => ({ ...d, page: p }));
          setEditing(false);
          onChanged();
        }}
      />
    );

  return (
    <article className="pz-page">
      <header className="pz-page-head">
        <div className="pz-page-heading">
          <h1 className="pz-title">{page.title}</h1>
          {page.summary && <p className="pz-lead">{page.summary}</p>}
        </div>
        <div className="pz-page-actions">
          <button className="w-btn" onClick={() => setEditing(true)}>
            <IconPencil size={15} /> Bearbeiten
          </button>
          {isPerson && <MoreMenu items={[{ label: 'Kontakt löschen', danger: true, onSelect: () => setRemoving(true) }]} />}
        </div>
      </header>
      {error && <div className="ws-error">{error}</div>}

      {updates && updates.length > 0 && (
        <section className="pz-updates-card">
          <div className="pz-block-head">
            <h2>
              <IconClock size={17} /> Letzte Aktualisierungen
            </h2>
            <button className="pz-textlink" onClick={onAllUpdates}>
              Alle Aktualisierungen anzeigen <span aria-hidden="true">→</span>
            </button>
          </div>
          <UpdateList updates={shown} onWiki={onWiki} />
          {updates.length > UPDATES_SHORT && (
            <button className={`pz-more-toggle${moreUpdates ? ' open' : ''}`} aria-expanded={moreUpdates} onClick={() => setMoreUpdates((m) => !m)}>
              {moreUpdates ? 'Weniger anzeigen' : 'Mehr anzeigen'} <IconChevronDown size={14} />
            </button>
          )}
        </section>
      )}

      <div className={`pz-page-body${hasBox ? ' with-box' : ''}`}>
        <div className="pz-page-text">
          {page.body.trim() ? <Md source={page.body} sources={page.sources} onWiki={onWiki} /> : <div className="w-muted">Diese Seite ist noch leer. Mit „Bearbeiten“ kannst du selbst etwas eintragen.</div>}
        </div>
        {hasBox && (
          <aside className="pz-infobox">
            <strong className="pz-infobox-title">{avatarName || page.title}</strong>
            {showAvatar && (
              <div className="pz-infobox-avatar">
                <Initial name={avatarName} size={120} />
              </div>
            )}
            {page.facts.length > 0 && (
              <dl>
                {page.facts.map((f, i) => (
                  <div key={i} className="pz-fact">
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </aside>
        )}
      </div>

      {(backlinks.length > 0 || related.length > 0) && (
        <nav className="pz-links" aria-label="Verknüpfte Seiten">
          {backlinks.length > 0 && <LinkColumn title="Verweise auf diese Seite" icon={<IconLoop size={16} />} links={backlinks} onWiki={onWiki} />}
          {related.length > 0 && <LinkColumn title="Verwandte Seiten" icon={<IconLink size={16} />} links={related} onWiki={onWiki} />}
        </nav>
      )}

      <footer className="pz-page-foot">
        <span className="w-muted">
          Zuletzt bearbeitet {fmtDate(page.updatedAt)}
          {page.editedByUser ? ' · von dir korrigiert' : ''}
        </span>
        {page.sources.length > 0 && (
          <section className="pz-sources">
            <h2>Quellen</h2>
            <ol>
              {sources.map((s) => (
                <li key={s.n} value={s.n}>
                  {s.label}
                  {s.date ? <span className="w-muted"> · {fmtDate(s.date)}</span> : null}
                </li>
              ))}
            </ol>
            {page.sources.length > SOURCES_SHORT && (
              <button className="pz-textlink" aria-expanded={allSources} onClick={() => setAllSources((a) => !a)}>
                {allSources ? 'Weniger Quellen anzeigen' : `Alle ${page.sources.length} Quellen anzeigen`}
              </button>
            )}
          </section>
        )}
      </footer>

      {removing && (
        <Confirm title="Kontakt löschen?" body={<>„{page.title}“ wird aus deinem Wiki entfernt.</>} confirmLabel="Löschen" busy={busy} onConfirm={() => void remove()} onCancel={() => setRemoving(false)} />
      )}
    </article>
  );
}

function LinkColumn({ title, icon, links, onWiki }: { title: string; icon: ReactNode; links: PageLink[]; onWiki: (slug: string) => void }) {
  return (
    <section className="pz-links-col">
      <h2>
        {icon} {title}
      </h2>
      <ul>
        {links.map((l) => (
          <li key={l.slug}>
            <button onClick={() => onWiki(l.slug)}>{l.title}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PageEditor({ token, page, onCancel, onSaved }: { token: string; page: Page; onCancel: () => void; onSaved: (p: Page) => void }) {
  const isPerson = page.kind === 'person';
  const [body, setBody] = useState(page.body);
  const [title, setTitle] = useState(page.title);
  const [summary, setSummary] = useState(page.summary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await savePersonaPage(token, page.slug, isPerson ? { body, title: title.trim() || page.title, summary: summary.trim() } : { body });
      onSaved(r.page);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <div className="pz-page">
      <header className="pz-page-head">
        <div className="pz-page-heading">
          <h1 className="pz-title">{page.title} bearbeiten</h1>
          <p className="pz-lead">Deine Korrektur gilt: Ortis übernimmt sie bei späteren Aktualisierungen als verbindlich.</p>
        </div>
        <div className="pz-page-actions">
          <button className="w-btn" onClick={onCancel} disabled={busy}>
            Abbrechen
          </button>
          <button className="w-btn green" onClick={() => void save()} disabled={busy}>
            {busy ? 'Speichere …' : 'Speichern'}
          </button>
        </div>
      </header>
      {error && <div className="ws-error">{error}</div>}
      {isPerson && (
        <div className="pz-field-row">
          <label className="pz-field">
            <span>Name</span>
            <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="pz-field grow">
            <span>Beschreibung</span>
            <input value={summary} maxLength={300} onChange={(e) => setSummary(e.target.value)} />
          </label>
        </div>
      )}
      <label className="pz-field">
        <span>Inhalt (Markdown)</span>
        <textarea className="mono pz-editor" value={body} onChange={(e) => setBody(e.target.value)} autoFocus />
      </label>
      <span className="w-muted">Quellenangaben wie [[1]] und Verweise wie [Ziele](wiki:goals) kannst du stehen lassen.</span>
    </div>
  );
}

// ---- people -------------------------------------------------------------------------

function PeoplePage({ token, persona, onOpen, onChanged }: { token: string; persona: Persona; onOpen: (slug: string) => void; onChanged: () => void }) {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const needle = q.trim().toLowerCase();
  const people = [...persona.people]
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name, 'de'))
    .filter((p) => !needle || `${p.name} ${p.email ?? ''} ${p.description}`.toLowerCase().includes(needle));

  return (
    <>
      <h1 className="pz-title">Personen</h1>
      <p className="pz-lead">Menschen, mit denen du zu tun hast. Ortis nutzt diese Seiten, um Nachrichten und Termine einzuordnen.</p>
      <div className="pz-toolbar">
        <SearchField value={q} onChange={setQ} placeholder="Personen suchen" />
        <button className="w-btn green" onClick={() => setCreating(true)}>
          <IconPlus size={16} /> Kontakt erstellen
        </button>
      </div>
      {persona.people.length === 0 ? (
        <div className="pz-empty">
          <strong>Noch keine Personen</strong>
          <span className="w-muted">Ortis legt Kontakte beim Aufbau des Wikis an. Du kannst auch selbst welche erstellen.</span>
        </div>
      ) : people.length === 0 ? (
        <div className="pz-state w-muted">Nichts gefunden.</div>
      ) : (
        <div className="pz-table-wrap">
          <table className="pz-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kontakt</th>
                <th>Beschreibung</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.slug} tabIndex={0} onClick={() => onOpen(p.slug)} onKeyDown={(e) => e.key === 'Enter' && onOpen(p.slug)}>
                  <td>
                    <span className="pz-table-name">
                      <Initial name={p.name} size={22} /> {p.name}
                    </span>
                  </td>
                  <td className="w-muted">{p.email || ''}</td>
                  <td className="w-muted">{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && (
        <PersonDialog
          token={token}
          onClose={() => setCreating(false)}
          onCreated={(slug) => {
            setCreating(false);
            onChanged();
            onOpen(slug);
          }}
        />
      )}
    </>
  );
}

function PersonDialog({ token, onClose, onCreated }: { token: string; onClose: () => void; onCreated: (slug: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await createPerson(token, { name: name.trim(), email: email.trim() || undefined, description: description.trim() || undefined });
      onCreated(r.page.slug);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Kontakt erstellen"
      onClose={onClose}
      footer={
        <>
          <button className="w-btn" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button className="w-btn green" disabled={busy || !name.trim()} onClick={() => void save()}>
            {busy ? 'Erstelle …' : 'Erstellen'}
          </button>
        </>
      }
    >
      <label className="pz-field">
        <span>Name</span>
        <input value={name} maxLength={120} autoFocus onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="pz-field">
        <span>E-Mail (optional)</span>
        <input type="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="pz-field">
        <span>Beschreibung (optional)</span>
        <textarea rows={3} value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder="Woher kennt ihr euch, woran arbeitet ihr zusammen?" />
      </label>
      {error && <div className="ws-error">{error}</div>}
    </Modal>
  );
}
