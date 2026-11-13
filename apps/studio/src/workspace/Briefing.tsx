// Start block of the main conversation: greeting, the day's briefing and up to five suggestions.
import { useEffect, useState } from 'react';
import { Initial } from '../persona/common';
import { hintWikiSlug } from '../persona/intent';
import { MdInline } from '../persona/Md';
import { allSuggestions, friendlyError, suggestionSections } from '../persona/format';
import '../persona/persona.css';
import { Busy, SkLines, Skeleton } from '../ui/Skeleton';
import { Tip } from '../ui/Tooltip';
import { IconClock, IconPencil } from '../ui/shell/line-icons';
import { ChatApiError, fetchBriefing, fetchMe, fetchSuggestions, startSuggestion, type Suggestion } from './api';
import { BotAvatar } from './BotAvatar';
import { emitCommand } from './desktop';
import { firstName, greeting } from './thread-list';
import type { ChatBot } from './types';

interface Data {
  name: string | null;
  items: { label: string; text: string }[];
  suggestions: Suggestion[];
}

const MAX_SUGGESTIONS = 5;

/** The briefing endpoint; without it (404) the greeting plus the existing suggestions; at worst just the greeting. */
async function load(token: string): Promise<Data> {
  try {
    const b = await fetchBriefing(token);
    return { name: firstName(b.name), items: b.items ?? [], suggestions: (b.suggestions ?? []).slice(0, MAX_SUGGESTIONS) };
  } catch (e) {
    if (e instanceof ChatApiError && e.status === 401) throw e;
  }
  const [me, sug] = await Promise.all([fetchMe(token).catch(() => null), fetchSuggestions(token).catch(() => null)]);
  return { name: firstName(me?.displayName), items: [], suggestions: allSuggestions(suggestionSections(sug)).slice(0, MAX_SUGGESTIONS) };
}

export function Briefing({ token, bot, name, now = new Date() }: { token: string; bot?: ChatBot | null; name?: string; now?: Date }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    load(token)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData({ name: null, items: [], suggestions: [] }));
    return () => {
      alive = false;
    };
  }, [token]);

  const start = async (s: Suggestion) => {
    setBusy(s.id);
    setError(null);
    try {
      const r = await startSuggestion(token, s.id);
      setDone((d) => new Set(d).add(s.id));
      if (s.kind === 'task' && !r.routine) emitCommand({ kind: 'openThread', threadId: r.threadId, message: r.prompt || s.prompt });
      else setNotice(`Routine eingerichtet: ${r.routine?.title || s.title}`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const openWiki = (slug: string) => {
    hintWikiSlug(slug);
    emitCommand({ kind: 'navigate', section: 'wiki' });
  };

  const suggestions = (data?.suggestions ?? []).filter((s) => !done.has(s.id));
  return (
    <section className="ws-brief" aria-label="Tagesüberblick">
      <BotAvatar bot={bot} size={32} radius={8} />
      <div className="ws-brief-body">
        <div className="ws-msg-meta">
          <strong className="ws-bot-name">{name ?? bot?.name ?? 'Mecky'}</strong>
          <span className="w-muted">{now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="ws-brief-date">{now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        {data ? (
          <h1 className="ws-brief-title">
            {greeting(now.getHours())}
            {data.name ? `, ${data.name}` : ''}.
          </h1>
        ) : (
          <Busy>
            <Skeleton h={24} w={240} style={{ margin: '14px 0 18px' }} />
            <SkLines lines={3} />
            <Skeleton h={15} w={250} style={{ margin: '26px 0 14px' }} />
            <SkLines lines={4} h={14} gap={22} widths={['62%', '48%', '70%', '54%']} />
          </Busy>
        )}
        {data && data.items.length > 0 && (
          <ul className="ws-brief-items">
            {data.items.map((it, i) => (
              <li key={i}>
                {it.label && <strong>{it.label.replace(/:\s*$/, '')}: </strong>}
                <MdInline source={it.text} onWiki={openWiki} />
              </li>
            ))}
          </ul>
        )}
        {notice && (
          <div className="conn-notice" role="status">
            {notice}
          </div>
        )}
        {error && <div className="ws-error">{error}</div>}
        {suggestions.length > 0 && (
          <>
            <h2 className="ws-brief-sub">Dabei kann ich dir heute helfen:</h2>
            <ul className="ws-brief-sugs">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button className="ws-brief-sug" disabled={busy === s.id} onClick={() => void start(s)}>
                    <span className="ws-brief-sug-icon">{s.kind === 'routine' ? <IconClock size={17} /> : <IconPencil size={17} />}</span>
                    <span className="ws-brief-sug-text">
                      <span>{s.title}</span>
                      {s.reason && <span className="w-muted">{s.reason}</span>}
                    </span>
                  </button>
                  {s.people.length > 0 && (
                    <span className="pz-sug-people">
                      {s.people.slice(0, 3).map((p) => (
                        <Tip key={p.slug} label={p.name} side="top">
                          <button className="pz-person-chip" aria-label={p.name} onClick={() => openWiki(p.slug)}>
                            <Initial name={p.name} size={22} />
                          </button>
                        </Tip>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
