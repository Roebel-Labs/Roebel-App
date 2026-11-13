import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChatApiError, createQuickRoutine, createSkill, deleteRoutine, deleteSkill, fetchRoutineCatalog, fetchRoutines, fetchSkills, fetchSuggestions,
  installRoutineTemplate, listConnectors, startSuggestion, updateRoutine, updateSkill,
  type ChatRoutine, type RoutineTemplate, type Skill, type SkillInput, type Suggestion,
} from '../workspace/api';
import { Connections } from '../ui/shell/Connections';
import {
  IconBell, IconCalendar, IconChart, IconCheck, IconHandshake, IconInbox, IconList, IconLoop, IconMail, IconNews, IconPeople, IconPlug, IconPlus,
  IconRadar, IconScroll, IconSearch, IconSun, IconUpload,
} from '../ui/shell/line-icons';
import { Confirm, Frame, LoadError, Modal, MoreMenu, SearchField, SignedOutHint, Toggle, useGoogleConnect, useLoad, useSessionToken, type NavEntry } from './common';
import { allSuggestions, fmtDate, friendlyError, hueIndex, makeSchedule, matchesQuery, parseSkillFile, scheduleText, suggestionSections, WEEKDAY_OPTIONS } from './format';
import { takeSkillsTab, type SkillsTab } from './intent';
import { Busy, SkCards, SkRows, Skeleton } from '../ui/Skeleton';
import './persona.css';

const NAV: NavEntry[] = [
  { id: 'overview', label: 'Meine Funktionen' },
  { id: 'routines', label: 'Routinen', icon: <IconLoop size={16} /> },
  { id: 'abilities', label: 'Fähigkeiten', icon: <IconScroll size={16} /> },
  { id: 'integrations', label: 'Integrationen', icon: <IconPlug size={16} /> },
  { id: 'discover', label: 'Entdecken', dividerBefore: true },
];

const TEMPLATE_ICONS: Record<string, (p: { size?: number }) => ReactNode> = {
  inbox: IconInbox, mail: IconMail, calendar: IconCalendar, search: IconSearch, list: IconList, sun: IconSun, news: IconNews, radar: IconRadar,
  people: IconPeople, chart: IconChart, handshake: IconHandshake, bell: IconBell,
};
const TILE_COLORS = ['#4f7fe0', '#3e9e6d', '#e08a3c', '#d9a531', '#8a63d2', '#2f9aa8', '#b85a2b'];
const safeColor = (c: string | undefined, key: string) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : TILE_COLORS[hueIndex(key, TILE_COLORS.length)]);

function Tile({ icon, color, size = 40 }: { icon?: string; color: string; size?: number }) {
  const Icon = (icon && TEMPLATE_ICONS[icon]) || IconLoop;
  return (
    <span className="pz-tile" style={{ width: size, height: size, background: color }} aria-hidden="true">
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}

/** Funktionen: routines, skills, integrations and the routine catalog. */
export function SkillsSection() {
  const session = useSessionToken();
  const token = session.token;
  const [tab, setTab] = useState<SkillsTab>(() => takeSkillsTab() ?? 'overview');

  return (
    <Frame title="Funktionen" nav={NAV} active={tab} onSelect={(id) => setTab(id as SkillsTab)} wide>
      {session.state === 'loading' && (
        <Busy>
          <Skeleton h={28} w={260} style={{ marginBottom: 14 }} />
          <Skeleton h={14} w="52%" style={{ marginBottom: 26 }} />
          <SkRows rows={4} tile={32} />
        </Busy>
      )}
      {session.state === 'signed-out' && <SignedOutHint what="deine Routinen und Fähigkeiten" />}
      {token && tab === 'overview' && <Overview token={token} onTab={setTab} onUnauthorized={session.signedOut} />}
      {token && tab === 'routines' && <Routines token={token} onUnauthorized={session.signedOut} onTab={setTab} />}
      {token && tab === 'abilities' && <Abilities token={token} onUnauthorized={session.signedOut} />}
      {token && tab === 'integrations' && (
        <div className="pz-integrations">
          <Connections token={token} title="Integrationen" />
        </div>
      )}
      {token && tab === 'discover' && <Discover token={token} onUnauthorized={session.signedOut} onTab={setTab} />}
    </Frame>
  );
}

// ---- Meine Funktionen ---------------------------------------------------------------

function Overview({ token, onTab, onUnauthorized }: { token: string; onTab: (t: SkillsTab) => void; onUnauthorized: () => void }) {
  const routines = useLoad(() => fetchRoutines(token), onUnauthorized);
  const skills = useLoad(() => fetchSkills(token));
  const suggestions = useLoad(() => fetchSuggestions(token));
  const connectors = useLoad(() => listConnectors(token));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const searching = q.trim().length > 0;

  const ideas = useMemo(
    () => allSuggestions(suggestionSections(suggestions.data)).filter((s) => s.kind === 'routine' && !done.has(s.id) && matchesQuery(q, s.title, s.reason)).slice(0, 12),
    [suggestions.data, done, q],
  );
  const create = async (s: Suggestion) => {
    setBusy(s.id);
    setError(null);
    try {
      await startSuggestion(token, s.id);
      setDone((d) => new Set(d).add(s.id));
      await routines.reload(true);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };
  const google = connectors.data?.connectors.find((c) => c.kind === 'google');
  const mcp = connectors.data?.connectors.filter((c) => c.kind === 'mcp') ?? [];
  // Without a search the overview shows the first few; a search looks through all of them.
  const matchedRoutines = (routines.data?.routines ?? []).filter((r) => matchesQuery(q, r.title, r.prompt));
  const matchedSkills = (skills.data?.skills ?? []).filter((k) => matchesQuery(q, k.name, k.description));
  const firstRoutines = searching ? matchedRoutines : matchedRoutines.slice(0, 4);
  const firstSkills = searching ? matchedSkills : matchedSkills.slice(0, 4);
  const nothing = searching && ideas.length === 0 && matchedRoutines.length === 0 && matchedSkills.length === 0;

  return (
    <>
      <h1 className="pz-title pz-title-lg">Meine Funktionen</h1>
      <p className="pz-lead">Verbinde deine Werkzeuge, automatisiere wiederkehrende Aufgaben und zeig Ortis, wie du arbeitest.</p>
      <div className="pz-toolbar pz-toolbar-search">
        <span className="pz-search-wrap">
          <IconSearch size={17} />
          <SearchField value={q} onChange={setQ} placeholder="Funktionen suchen" />
        </span>
      </div>
      {error && <div className="ws-error">{error}</div>}
      {nothing && <div className="pz-state w-muted">Nichts gefunden für „{q.trim()}“.</div>}

      {suggestions.loading && !suggestions.data && (
        <section className="pz-block">
          <h2>Vorschläge</h2>
          <SkCards row cards={4} />
        </section>
      )}
      {ideas.length > 0 && (
        <section className="pz-block">
          <h2>Vorschläge</h2>
          <div className="pz-hrow" role="list">
            {ideas.map((s) => (
              <article key={s.id} className="pz-idea" role="listitem">
                <Tile color={safeColor(undefined, s.title)} size={44} />
                <strong className="pz-idea-title" title={s.title}>
                  {s.title}
                </strong>
                <span className="pz-idea-caption">Für dich vorgeschlagen</span>
                <span className="pz-idea-text" title={s.reason}>
                  {s.reason}
                </span>
                {s.schedule && <span className="w-tag pz-idea-chip">{scheduleText(s.schedule)}</span>}
                <button className="w-btn pz-idea-btn" disabled={busy === s.id} onClick={() => void create(s)}>
                  {busy === s.id ? 'Erstelle …' : 'Erstellen'}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {!searching && (
        <section className="pz-block">
          <div className="pz-block-head">
            <h2>Integrationen</h2>
            <button className="w-btn ghost" onClick={() => onTab('integrations')}>
              Verwalten
            </button>
          </div>
          {connectors.error && !connectors.data ? (
            <LoadError message={connectors.error} onRetry={() => void connectors.reload()} />
          ) : connectors.loading && !connectors.data ? (
            <SkRows rows={2} />
          ) : (
            <ul className="pz-rows">
              <li className="pz-row">
                <div className="pz-row-text">
                  <strong>Google</strong>
                  <span className="w-muted">Kalender, Gmail, Drive</span>
                </div>
                <span className={`w-tag${google ? ' ok' : ''}`}>{google ? 'Verbunden' : 'Nicht verbunden'}</span>
              </li>
              <li className="pz-row">
                <div className="pz-row-text">
                  <strong>Röbel App</strong>
                  <span className="w-muted">Veranstaltungen, Orte, Kontakte, Röbel Münzen</span>
                </div>
                <span className="w-tag ok">Immer verbunden</span>
              </li>
              {mcp.map((c) => (
                <li className="pz-row" key={c.id}>
                  <div className="pz-row-text">
                    <strong>{c.name}</strong>
                    <span className="w-muted">{c.toolCount} Werkzeuge</span>
                  </div>
                  <span className={`w-tag${c.status === 'active' ? ' ok' : ''}`}>{c.status === 'active' ? 'Verbunden' : 'Fehler'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(!searching || firstRoutines.length > 0) && (
        <section className="pz-block">
          <div className="pz-block-head">
            <h2>Routinen</h2>
            <button className="w-btn ghost" onClick={() => onTab('routines')}>
              Alle anzeigen
            </button>
          </div>
          {routines.loading && !routines.data && <SkRows rows={3} tile={32} />}
          {routines.error && !routines.data && <LoadError message={routines.error} onRetry={() => void routines.reload()} />}
          {routines.data && firstRoutines.length === 0 && (
            <div className="pz-empty">
              <strong>Noch keine Routinen</strong>
              <span className="w-muted">Routinen erledigen wiederkehrende Aufgaben nach Zeitplan.</span>
              <button className="w-btn" onClick={() => onTab('discover')}>
                Routinen entdecken
              </button>
            </div>
          )}
          {firstRoutines.length > 0 && (
            <ul className="pz-rows">
              {firstRoutines.map((r) => (
                <li className="pz-row" key={r.id}>
                  <Tile color={safeColor(undefined, r.title)} size={32} />
                  <div className="pz-row-text">
                    <strong className="w-ellipsis">{r.title}</strong>
                    <span className="w-muted">{scheduleText(r.schedule)}</span>
                  </div>
                  <span className={`w-tag${r.enabled ? ' ok' : ''}`}>{r.enabled ? 'Aktiv' : 'Pausiert'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {skills.loading && !skills.data && !searching && (
        <section className="pz-block">
          <div className="pz-block-head">
            <h2>Fähigkeiten</h2>
          </div>
          <SkRows rows={2} tile={32} />
        </section>
      )}
      {firstSkills.length > 0 && (
        <section className="pz-block">
          <div className="pz-block-head">
            <h2>Fähigkeiten</h2>
            <button className="w-btn ghost" onClick={() => onTab('abilities')}>
              Alle anzeigen
            </button>
          </div>
          <ul className="pz-rows">
            {firstSkills.map((k) => (
              <li className="pz-row" key={k.id}>
                <span className="pz-tile plain" style={{ width: 32, height: 32 }} aria-hidden="true">
                  <IconScroll size={17} />
                </span>
                <div className="pz-row-text">
                  <strong className="w-ellipsis">{k.name}</strong>
                  <span className="w-muted w-ellipsis">{k.description || 'Ohne Beschreibung'}</span>
                </div>
                <span className={`w-tag${k.enabled ? ' ok' : ''}`}>{k.enabled ? 'Aktiv' : 'Aus'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ---- Routinen -----------------------------------------------------------------------

function Routines({ token, onUnauthorized, onTab }: { token: string; onUnauthorized: () => void; onTab: (t: SkillsTab) => void }) {
  const load = useLoad(() => fetchRoutines(token), onUnauthorized);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<ChatRoutine | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patchLocal = (r: ChatRoutine) => load.setData((d) => (d ? { routines: d.routines.map((x) => (x.id === r.id ? r : x)) } : d));
  const toggle = async (r: ChatRoutine, enabled: boolean) => {
    setBusy(r.id);
    setError(null);
    patchLocal({ ...r, enabled });
    try {
      patchLocal((await updateRoutine(token, r.id, { enabled })).routine);
    } catch (e) {
      patchLocal(r);
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(removing.id);
    try {
      await deleteRoutine(token, removing.id);
      load.setData((d) => (d ? { routines: d.routines.filter((x) => x.id !== removing.id) } : d));
      setRemoving(null);
    } catch (e) {
      setError(friendlyError(e));
      setRemoving(null);
    } finally {
      setBusy(null);
    }
  };

  const needle = q.trim().toLowerCase();
  const rows = (load.data?.routines ?? []).filter((r) => !needle || `${r.title} ${r.prompt}`.toLowerCase().includes(needle));

  return (
    <>
      <h1 className="pz-title">Routinen</h1>
      <p className="pz-lead">Automatisiere wiederkehrende Aufgaben nach Zeitplan.</p>
      <div className="pz-toolbar">
        <SearchField value={q} onChange={setQ} placeholder="Routinen suchen" />
        <button className="w-btn green" onClick={() => setCreating(true)}>
          <IconPlus size={16} /> Erstellen
        </button>
      </div>
      {error && <div className="ws-error">{error}</div>}
      {load.loading && !load.data && <SkRows rows={4} tile={40} trailing={34} joined />}
      {load.error && !load.data && <LoadError message={load.error} onRetry={() => void load.reload()} />}
      {load.data && load.data.routines.length === 0 && (
        <div className="pz-empty">
          <strong>Noch keine Routinen</strong>
          <span className="w-muted">Erstelle eine eigene Routine oder installiere eine fertige aus dem Katalog.</span>
          <button className="w-btn" onClick={() => onTab('discover')}>
            Routinen entdecken
          </button>
        </div>
      )}
      {load.data && load.data.routines.length > 0 && rows.length === 0 && <div className="pz-state w-muted">Nichts gefunden.</div>}
      {rows.length > 0 && (
        <ul className="pz-list">
          {rows.map((r) => (
            <li key={r.id} className="pz-list-row">
              <Tile color={safeColor(undefined, r.title)} />
              <div className="pz-row-text">
                <strong className="w-ellipsis">{r.title}</strong>
                <span className="w-muted w-ellipsis">{r.prompt}</span>
                <span className="pz-meta">
                  {scheduleText(r.schedule)}
                  {r.lastRunAt ? ` · Zuletzt ${fmtDate(r.lastRunAt)}` : ''}
                </span>
              </div>
              <Toggle checked={r.enabled} disabled={busy === r.id} label={r.enabled ? 'Routine pausieren' : 'Routine einschalten'} onChange={(v) => void toggle(r, v)} />
              <MoreMenu items={[{ label: 'Löschen', danger: true, onSelect: () => setRemoving(r) }]} />
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <RoutineDialog
          token={token}
          onClose={() => setCreating(false)}
          onCreated={(r) => {
            load.setData((d) => ({ routines: [r, ...(d?.routines ?? [])] }));
            setCreating(false);
          }}
        />
      )}
      {removing && (
        <Confirm
          title="Routine löschen?"
          body={<>„{removing.title}“ läuft danach nicht mehr. Die bisherigen Ergebnisse bleiben in der Unterhaltung.</>}
          confirmLabel="Löschen"
          busy={busy === removing.id}
          onConfirm={() => void remove()}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  );
}

function RoutineDialog({ token, onClose, onCreated }: { token: string; onClose: () => void; onCreated: (r: ChatRoutine) => void }) {
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [kind, setKind] = useState<'weekly' | 'daily'>('weekly');
  const [weekday, setWeekday] = useState(1);
  const [time, setTime] = useState('08:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await createQuickRoutine(token, { title: title.trim(), prompt: prompt.trim(), schedule: makeSchedule(kind, weekday, time) });
      onCreated(r.routine);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Routine erstellen"
      onClose={onClose}
      footer={
        <>
          <button className="w-btn" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button className="w-btn green" disabled={busy || !title.trim() || !prompt.trim()} onClick={() => void save()}>
            {busy ? 'Erstelle …' : 'Erstellen'}
          </button>
        </>
      }
    >
      <label className="pz-field">
        <span>Titel</span>
        <input value={title} maxLength={80} autoFocus onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Wochenüberblick" />
      </label>
      <label className="pz-field">
        <span>Was soll Ortis tun?</span>
        <textarea rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Beschreib die Aufgabe so, wie du sie einem Kollegen erklären würdest." />
      </label>
      <div className="pz-field-row">
        <label className="pz-field">
          <span>Rhythmus</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as 'weekly' | 'daily')}>
            <option value="weekly">Wöchentlich</option>
            <option value="daily">Täglich</option>
          </select>
        </label>
        {kind === 'weekly' && (
          <label className="pz-field">
            <span>Wochentag</span>
            <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {WEEKDAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="pz-field">
          <span>Uhrzeit</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <span className="w-muted">{scheduleText(makeSchedule(kind, weekday, time))} (deutsche Zeit)</span>
      {error && <div className="ws-error">{error}</div>}
    </Modal>
  );
}

// ---- Fähigkeiten --------------------------------------------------------------------

function Abilities({ token, onUnauthorized }: { token: string; onUnauthorized: () => void }) {
  const load = useLoad(() => fetchSkills(token), onUnauthorized);
  const [editing, setEditing] = useState<{ skill: Skill | null; draft: SkillInput } | null>(null);
  const [removing, setRemoving] = useState<Skill | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const put = (s: Skill) => load.setData((d) => ({ skills: d?.skills.some((x) => x.id === s.id) ? d.skills.map((x) => (x.id === s.id ? s : x)) : [s, ...(d?.skills ?? [])] }));
  const toggle = async (s: Skill, enabled: boolean) => {
    setBusy(s.id);
    setError(null);
    put({ ...s, enabled });
    try {
      put((await updateSkill(token, s.id, { enabled })).skill);
    } catch (e) {
      put(s);
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(removing.id);
    try {
      await deleteSkill(token, removing.id);
      load.setData((d) => (d ? { skills: d.skills.filter((x) => x.id !== removing.id) } : d));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
      setRemoving(null);
    }
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (f.size > 200_000) return setError('Die Datei ist zu groß. Eine SKILL.md darf höchstens 20.000 Zeichen haben.');
    try {
      setEditing({ skill: null, draft: parseSkillFile(await f.text(), f.name) });
    } catch {
      setError('Die Datei konnte nicht gelesen werden.');
    }
  };

  const skills = load.data?.skills ?? [];
  return (
    <>
      <h1 className="pz-title">Fähigkeiten</h1>
      <p className="pz-lead">Bring Ortis bei, wie du bestimmte Aufgaben erledigt haben möchtest. Eingeschaltete Fähigkeiten nutzt es von selbst, wenn sie passen.</p>
      <div className="pz-toolbar end">
        <input ref={file} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
        <button className="w-btn" onClick={() => file.current?.click()}>
          <IconUpload size={16} /> Hochladen
        </button>
        <button className="w-btn green" onClick={() => setEditing({ skill: null, draft: { name: '', description: '', body: '' } })}>
          <IconPlus size={16} /> Erstellen
        </button>
      </div>
      {error && <div className="ws-error">{error}</div>}
      {load.loading && !load.data && <SkRows rows={3} tile={40} trailing={34} joined />}
      {load.error && !load.data && <LoadError message={load.error} onRetry={() => void load.reload()} />}
      {load.data && skills.length === 0 && (
        <div className="pz-empty">
          <strong>Noch keine Fähigkeiten</strong>
          <span className="w-muted">Erstelle eine oder lade eine SKILL.md hoch.</span>
        </div>
      )}
      {skills.length > 0 && (
        <ul className="pz-list">
          {skills.map((s) => (
            <li key={s.id} className="pz-list-row">
              <span className="pz-tile plain" aria-hidden="true">
                <IconScroll size={20} />
              </span>
              <button className="pz-row-text pz-row-button" onClick={() => setEditing({ skill: s, draft: { name: s.name, description: s.description, body: s.body } })}>
                <strong className="w-ellipsis">{s.name}</strong>
                <span className="w-muted w-ellipsis">{s.description || 'Ohne Beschreibung'}</span>
                <span className="pz-meta">Geändert {fmtDate(s.updatedAt)}</span>
              </button>
              <Toggle checked={s.enabled} disabled={busy === s.id} label={s.enabled ? 'Fähigkeit ausschalten' : 'Fähigkeit einschalten'} onChange={(v) => void toggle(s, v)} />
              <MoreMenu
                items={[
                  { label: 'Bearbeiten', onSelect: () => setEditing({ skill: s, draft: { name: s.name, description: s.description, body: s.body } }) },
                  { label: 'Löschen', danger: true, onSelect: () => setRemoving(s) },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <SkillDialog
          token={token}
          skill={editing.skill}
          initial={editing.draft}
          onClose={() => setEditing(null)}
          onSaved={(s) => {
            put(s);
            setEditing(null);
          }}
        />
      )}
      {removing && (
        <Confirm
          title="Fähigkeit löschen?"
          body={<>„{removing.name}“ wird endgültig entfernt.</>}
          confirmLabel="Löschen"
          busy={busy === removing.id}
          onConfirm={() => void remove()}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  );
}

function SkillDialog({ token, skill, initial, onClose, onSaved }: { token: string; skill: Skill | null; initial: SkillInput; onClose: () => void; onSaved: (s: Skill) => void }) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof SkillInput) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    setError(null);
    const body = { name: draft.name.trim(), description: draft.description.trim(), body: draft.body.trim() };
    try {
      onSaved(skill ? (await updateSkill(token, skill.id, body)).skill : (await createSkill(token, body)).skill);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={skill ? 'Fähigkeit bearbeiten' : 'Fähigkeit erstellen'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="w-btn" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button className="w-btn green" disabled={busy || !draft.name.trim() || !draft.body.trim()} onClick={() => void save()}>
            {busy ? 'Speichere …' : 'Speichern'}
          </button>
        </>
      }
    >
      <label className="pz-field">
        <span>Name</span>
        <input value={draft.name} maxLength={60} autoFocus onChange={set('name')} placeholder="z. B. Sitzungsprotokoll" />
      </label>
      <label className="pz-field">
        <span>Beschreibung</span>
        <input value={draft.description} maxLength={300} onChange={set('description')} placeholder="Wann soll Ortis diese Fähigkeit nutzen?" />
      </label>
      <label className="pz-field">
        <span>Anweisungen</span>
        <textarea rows={12} className="mono" value={draft.body} maxLength={20_000} onChange={set('body')} placeholder="Schritt für Schritt, in Markdown." />
      </label>
      <div className="pz-count">{draft.body.length.toLocaleString('de-DE')} / 20.000 Zeichen</div>
      {error && <div className="ws-error">{error}</div>}
    </Modal>
  );
}

// ---- Entdecken ----------------------------------------------------------------------

function Discover({ token, onUnauthorized, onTab }: { token: string; onUnauthorized: () => void; onTab: (t: SkillsTab) => void }) {
  const load = useLoad(() => fetchRoutineCatalog(token), onUnauthorized);
  const connectors = useLoad(() => listConnectors(token));
  const [category, setCategory] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const google = useGoogleConnect(token, () => void connectors.reload(true));
  // Unknown connector state (still loading, endpoint down) never blocks installing.
  const googleMissing = !!connectors.data && !connectors.data.connectors.some((c) => c.kind === 'google');

  const mark = (id: string) => load.setData((d) => (d ? { ...d, templates: d.templates.map((t) => (t.id === id ? { ...t, installed: true } : t)) } : d));
  const install = async (t: RoutineTemplate) => {
    setBusy(t.id);
    setError(null);
    try {
      await installRoutineTemplate(token, t.id);
      mark(t.id);
    } catch (e) {
      if (e instanceof ChatApiError && e.status === 409) mark(t.id);
      else setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const templates = (load.data?.templates ?? []).filter((t) => category === 'all' || t.category === category);
  const anyInstalled = (load.data?.templates ?? []).some((t) => t.installed);

  return (
    <>
      <h1 className="pz-title">Entdecken</h1>
      <div className="pz-block-head">
        <div>
          <h2>Routinen von Ortis</h2>
          <p className="pz-lead">Vorgefertigte Routinen für einen einfachen Einstieg.</p>
        </div>
        {anyInstalled && (
          <button className="w-btn ghost" onClick={() => onTab('routines')}>
            Zu meinen Routinen
          </button>
        )}
      </div>
      {load.loading && !load.data && (
        <>
          <Busy className="pz-tabs">
            {[52, 96, 84, 110].map((w) => (
              <Skeleton key={w} h={32} w={w} />
            ))}
          </Busy>
          <SkCards cards={6} height={150} />
        </>
      )}
      {load.error && !load.data && <LoadError message={load.error} onRetry={() => void load.reload()} />}
      {(error || google.error) && <div className="ws-error">{error || google.error}</div>}
      {google.waiting && <div className="conn-notice">Warte auf Google im Browser …</div>}
      {load.data && (
        <>
          <div className="pz-tabs" role="tablist">
            {[{ id: 'all', label: 'Alle' }, ...load.data.categories].map((c) => (
              <button key={c.id} role="tab" className="pz-chip" aria-selected={category === c.id} onClick={() => setCategory(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          {templates.length === 0 && <div className="pz-state w-muted">In dieser Kategorie gibt es noch keine Routinen.</div>}
          <div className="pz-cards">
            {templates.map((t) => {
              const needsGoogle = !t.installed && googleMissing && t.requires.includes('google');
              return (
                <article key={t.id} className="pz-card" title={t.description}>
                  <div className="pz-card-top">
                    <Tile icon={t.icon} color={safeColor(t.color, t.id)} />
                    {t.installed ? (
                      <span className="pz-installed">
                        <IconCheck size={15} /> Installiert
                      </span>
                    ) : needsGoogle ? (
                      <button className="w-btn" disabled={google.busy || google.waiting} onClick={() => void google.start()}>
                        Google verbinden
                      </button>
                    ) : (
                      <button className="w-btn" disabled={busy === t.id} onClick={() => void install(t)}>
                        {busy === t.id ? '…' : 'Installieren'}
                      </button>
                    )}
                  </div>
                  <strong>{t.title}</strong>
                  <span className="w-muted pz-clamp">{t.tagline}</span>
                  <span className="pz-meta">{scheduleText(t.schedule)}</span>
                </article>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
