import { useState } from 'react';
import { dismissSuggestion, fetchSuggestions, startSuggestion, type Suggestion } from '../workspace/api';
import { emitCommand } from '../workspace/desktop';
import { IconLoop, IconPencil } from '../ui/shell/line-icons';
import type { Section } from '../ui/shell/nav';
import { BuildProgress, Frame, Initial, LoadError, PersonaOnboarding, SignedOutHint, useLoad, usePoll, useSessionToken } from './common';
import { friendlyError, scheduleText } from './format';
import { ImportDialog } from './ImportDialog';
import { hintSkillsTab, hintWikiSlug } from './intent';
import './persona.css';

type Filter = 'all' | 'task' | 'routine';
const NAV = [
  { id: 'all', label: 'Alle' },
  { id: 'task', label: 'Aufgaben' },
  { id: 'routine', label: 'Routinen' },
];

/** Für dich: suggested tasks and routines derived from the personal wiki. */
export function ForYouSection({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const session = useSessionToken();
  const token = session.token;
  const [filter, setFilter] = useState<Filter>('all');
  const [importing, setImporting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const load = useLoad(token ? () => fetchSuggestions(token) : null, session.signedOut);
  const status = load.data?.status;
  usePoll(status?.state === 'building', () => void load.reload(true));

  const hide = (id: string) => setHidden((h) => new Set(h).add(id));

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
        hide(s.id);
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
      hide(s.id);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  };

  const groups = (load.data?.groups ?? [])
    .map((g) => ({ ...g, items: g.items.filter((i) => !hidden.has(i.id) && (filter === 'all' || i.kind === filter)) }))
    .filter((g) => g.items.length > 0);
  const total = (load.data?.groups ?? []).reduce((n, g) => n + g.items.filter((i) => !hidden.has(i.id)).length, 0);

  return (
    <Frame title="Für dich" nav={NAV} active={filter} onSelect={(id) => setFilter(id as Filter)}>
      <h1 className="pz-title">Vorschläge für deine Aufgaben und Routinen</h1>
      {session.state === 'loading' && <div className="pz-state w-muted">Lade …</div>}
      {session.state === 'signed-out' && <SignedOutHint what="deine Vorschläge" />}
      {token && load.loading && !load.data && <div className="pz-state w-muted">Lade …</div>}
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
      {total > 0 && groups.length === 0 && <div className="pz-state w-muted">{filter === 'task' ? 'Keine Aufgaben in den Vorschlägen.' : 'Keine Routinen in den Vorschlägen.'}</div>}

      {groups.map((g) => (
        <section key={g.title} className="pz-group">
          <h2>{g.title}</h2>
          <ul className="pz-sugs">
            {g.items.map((s) => (
              <li key={s.id} className="pz-sug">
                <span className="pz-sug-icon">{s.kind === 'routine' ? <IconLoop size={17} /> : <IconPencil size={17} />}</span>
                <div className="pz-sug-text">
                  <span className="pz-sug-title">{s.title}</span>
                  <span className="w-muted">
                    {s.reason}
                    {s.kind === 'routine' && s.schedule ? ` · ${scheduleText(s.schedule)}` : ''}
                  </span>
                </div>
                {s.people.length > 0 && (
                  <span className="pz-sug-people">
                    {s.people.slice(0, 4).map((p) => (
                      <button
                        key={p.slug}
                        className="pz-person-chip"
                        title={p.name}
                        aria-label={p.name}
                        onClick={() => {
                          hintWikiSlug(p.slug);
                          onNavigate('wiki');
                        }}
                      >
                        <Initial name={p.name} size={22} />
                      </button>
                    ))}
                  </span>
                )}
                <span className="pz-sug-actions">
                  <button className="w-btn" disabled={busyId === s.id} onClick={() => void start(s)}>
                    {busyId === s.id ? '…' : s.kind === 'routine' ? 'Einrichten' : 'Starten'}
                  </button>
                  <button className="w-btn ghost" disabled={busyId === s.id} onClick={() => void dismiss(s)}>
                    Ausblenden
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {importing && token && <ImportDialog token={token} mode={status?.builtAt ? 'refresh' : 'full'} onClose={() => setImporting(false)} onBuildStarted={() => void load.reload(true)} />}
    </Frame>
  );
}
