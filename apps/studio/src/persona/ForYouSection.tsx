import { useMemo, useState } from 'react';
import { dismissSuggestion, fetchSuggestions, startSuggestion, type Suggestion, type SuggestionGroup } from '../workspace/api';
import { emitCommand } from '../workspace/desktop';
import { IconClock, IconPencil } from '../ui/shell/line-icons';
import type { Section } from '../ui/shell/nav';
import { BuildProgress, Frame, Initial, LoadError, MoreMenu, PersonaOnboarding, SignedOutHint, useLoad, usePoll, useSessionToken } from './common';
import { allSuggestions, filterSuggestionSections, friendlyError, scheduleText, suggestionFilters, suggestionSections } from './format';
import { ImportDialog } from './ImportDialog';
import { hintSkillsTab, hintWikiSlug } from './intent';
import { SkSuggestions } from '../ui/Skeleton';
import { Tip } from '../ui/Tooltip';
import './persona.css';

/** Für dich: suggested tasks and routines derived from the personal wiki. */
export function ForYouSection({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const session = useSessionToken();
  const token = session.token;
  const [filter, setFilter] = useState('all');
  const [onlyFresh, setOnlyFresh] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const load = useLoad(token ? () => fetchSuggestions(token) : null, session.signedOut);
  const status = load.data?.status;
  usePoll(status?.state === 'building', () => void load.reload(true));

  // An older backend sends only `groups`: one untitled section, the old three filters, no "Neu".
  const v2 = Array.isArray(load.data?.sections);
  const sections = useMemo(() => suggestionSections(load.data), [load.data]);
  const nav = useMemo(() => suggestionFilters(sections, v2), [sections, v2]);
  const active = nav.some((n) => n.id === filter) ? filter : 'all';
  const everything = useMemo(() => allSuggestions(sections), [sections]);
  const total = everything.filter((i) => !hidden.has(i.id)).length;
  const hasFresh = everything.some((i) => i.fresh && !hidden.has(i.id));
  const fresh = onlyFresh && hasFresh;
  const visible = filterSuggestionSections(sections, active, { hidden, onlyFresh: fresh });

  const hide = (ids: string[]) => setHidden((h) => new Set([...h, ...ids]));

  const start = async (s: Suggestion) => {
    if (!token) return;
    setBusyId(s.id);
    setError(null);
    try {
      const r = await startSuggestion(token, s.id);
      if (s.kind === 'task' && !r.routine) {
        // Handled by App (switches to Start) and by the workspace (opens the thread, sends the first message).
        emitCommand({ kind: 'openThread', threadId: r.threadId, message: r.prompt || s.prompt });
      } else {
        setCreated(r.routine?.title || s.title);
        hide([s.id]);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (s: Suggestion) => {
    if (!token) return;
    setBusyId(s.id);
    setError(null);
    try {
      await dismissSuggestion(token, s.id);
      hide([s.id]);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  };

  /** "Alle ausblenden" of a group: there is no bulk endpoint, so each item is dismissed on its own. */
  const dismissGroup = async (g: SuggestionGroup) => {
    if (!token) return;
    setError(null);
    const results = await Promise.allSettled(g.items.map((i) => dismissSuggestion(token, i.id)));
    hide(g.items.filter((_, i) => results[i].status === 'fulfilled').map((i) => i.id));
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (failed) setError(friendlyError(failed.reason));
  };

  const actions = hasFresh ? (
    <button className={`w-btn ghost pz-fresh-toggle${fresh ? ' on' : ''}`} aria-pressed={fresh} onClick={() => setOnlyFresh((v) => !v)}>
      Nur neue anzeigen
    </button>
  ) : undefined;

  const group = (g: SuggestionGroup, key: string, sub: boolean) => {
    const Heading = sub ? 'h3' : 'h2';
    return (
      <div key={key} className={`pz-group${sub ? ' sub' : ''}`}>
        <div className="pz-group-head">
          <Heading>{g.title}</Heading>
          <MoreMenu label="Mehr zu dieser Gruppe" items={[{ label: 'Alle ausblenden', onSelect: () => void dismissGroup(g) }]} />
        </div>
        <ul className="pz-sugs">
          {g.items.map((s) => (
            <li key={s.id} className="pz-sug">
              <span className="pz-sug-icon">{s.kind === 'routine' ? <IconClock size={17} /> : <IconPencil size={17} />}</span>
              <div className="pz-sug-text">
                <span className="pz-sug-title">
                  {s.title}
                  {s.fresh && <span className="pz-new">Neu</span>}
                </span>
                <span className="pz-sug-reason">
                  {s.reason}
                  {s.kind === 'routine' && s.schedule ? ` · ${scheduleText(s.schedule)}` : ''}
                </span>
              </div>
              <span className="pz-sug-actions">
                <button className="w-btn" disabled={busyId === s.id} onClick={() => void start(s)}>
                  {busyId === s.id ? '…' : s.kind === 'routine' ? 'Einrichten' : 'Starten'}
                </button>
                <button className="w-btn ghost" disabled={busyId === s.id} onClick={() => void dismiss(s)}>
                  Ausblenden
                </button>
              </span>
              {s.people.length > 0 && (
                <span className="pz-sug-people">
                  {s.people.slice(0, 4).map((p) => (
                    <Tip key={p.slug} label={p.name} side="top">
                      <button
                        className="pz-person-chip"
                        aria-label={p.name}
                        onClick={() => {
                          hintWikiSlug(p.slug);
                          onNavigate('wiki');
                        }}
                      >
                        <Initial name={p.name} size={22} />
                      </button>
                    </Tip>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <Frame title="Für dich" nav={nav} active={active} onSelect={setFilter} actions={actions} narrow>
      <h1 className="pz-title pz-title-lg">Vorschläge für deine Aufgaben und Routinen</h1>
      {(session.state === 'loading' || (token && load.loading && !load.data)) && <SkSuggestions />}
      {session.state === 'signed-out' && <SignedOutHint what="deine Vorschläge" />}
      {token && load.error && !load.data && <LoadError message={load.error} onRetry={() => void load.reload()} />}

      {created && (
        <div className="conn-notice pz-notice" role="status">
          <span>Routine eingerichtet: {created}</span>
          <button
            className="w-btn"
            onClick={() => {
              hintSkillsTab('routines');
              onNavigate('skills');
            }}
          >
            Zu den Routinen
          </button>
        </div>
      )}
      {error && <div className="ws-error">{error}</div>}

      {token && status && (status.state === 'empty' || status.state === 'error') && total === 0 && (
        <PersonaOnboarding token={token} status={status} onChanged={() => void load.reload(true)} onImport={() => setImporting(true)} />
      )}
      {status?.state === 'building' && <BuildProgress status={status} compact={total > 0} />}
      {status?.state === 'ready' && total === 0 && (
        <div className="pz-empty">
          <strong>Gerade keine Vorschläge</strong>
          <span className="w-muted">Sobald Ortis in deinen Quellen etwas findet, das sich lohnt, erscheint es hier.</span>
        </div>
      )}
      {total > 0 && visible.length === 0 && <div className="pz-state w-muted">{fresh ? 'Keine neuen Vorschläge in dieser Ansicht.' : 'Keine Vorschläge in dieser Ansicht.'}</div>}

      {visible.map((sec) =>
        sec.title ? (
          <section key={sec.key} className="pz-sec">
            <h2 className="pz-sec-title">{sec.title}</h2>
            {sec.groups.map((g, i) => group(g, `${sec.key}.${i}`, true))}
          </section>
        ) : (
          // The projects section has no title of its own: its groups are the headings.
          sec.groups.map((g, i) => (
            <section key={`${sec.key}.${i}`} className="pz-sec">
              {group(g, `${sec.key}.${i}`, false)}
            </section>
          ))
        ),
      )}

      {importing && token && <ImportDialog token={token} mode={status?.builtAt ? 'refresh' : 'full'} onClose={() => setImporting(false)} onBuildStarted={() => void load.reload(true)} />}
    </Frame>
  );
}
