// Chat moderation + Publikumsliebling (a Meinungsbild).

import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../../ui/Dialog';
import { displayName, formatEuro } from '../alerts';
import { fetchResults } from '../api';
import { liveRoom } from '../controller';
import type { ChatMessage, VoteResults } from '../types';
import { ErrorLine, Section, Toggle, timeOf, useLiveRoom, useRun } from './common';

const SLOW_MODES = [0, 3, 10, 30, 60];

function Message({ m, featured, run }: { m: ChatMessage; featured: boolean; run: (f: () => Promise<unknown>) => void }) {
  const [askMute, setAskMute] = useState(false);
  const name = displayName(m.display_name);
  return (
    <div className={`lr-msg ${m.kind} ${featured ? 'featured' : ''}`}>
      <div className="lr-msg-head">
        <span className="lr-msg-name">{name}</span>
        {m.kind === 'support' && <span className="lr-tag">Unterstützt {formatEuro(m.amount_cents ?? 0)}</span>}
        {m.kind === 'system' && <span className="lr-tag">Hinweis</span>}
        <span className="hint">{timeOf(m.created_at)}</span>
      </div>
      {m.body && <div className="lr-msg-body">{m.body}</div>}
      {m.kind !== 'system' && (
        <div className="lr-msg-actions">
          <button className="btn ghost" onClick={() => run(() => liveRoom.featureMessage(featured ? null : m.id))}>
            {featured ? 'Von Sendung nehmen' : 'Auf Sendung'}
          </button>
          <button className="btn ghost" onClick={() => run(() => liveRoom.hideMessage(m.id))}>
            Ausblenden
          </button>
          {m.kind === 'chat' && (
            <button className="btn ghost" onClick={() => setAskMute(true)}>
              Stummschalten
            </button>
          )}
        </div>
      )}
      {askMute && (
        <ConfirmDialog
          title={`${name} stummschalten?`}
          body={<p>Diese Person kann in dieser Übertragung nicht mehr schreiben. Alle ihre Nachrichten werden ausgeblendet.</p>}
          confirmLabel="Stummschalten"
          danger
          onCancel={() => setAskMute(false)}
          onConfirm={() => {
            setAskMute(false);
            run(() => liveRoom.muteMessage(m.id));
          }}
        />
      )}
    </div>
  );
}

export function ChatSection() {
  const lr = useLiveRoom();
  const act = useRun();
  const flags = useRun();
  const [sys, setSys] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const featuredId = liveRoom.featuredId();

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lr.chat.length]);

  if (!lr.show) return null;
  const show = lr.show;
  const run = (f: () => Promise<unknown>) => void act.run(f);

  return (
    <Section
      title="Chat"
      aside={
        <>
          <Toggle label="Chat offen" on={show.chat_enabled} disabled={flags.busy} onChange={(v) => void flags.run(() => liveRoom.setFlags({ chat_enabled: v }))} />
          <select
            className="input lr-small"
            aria-label="Langsamer Modus"
            value={show.slow_mode_seconds}
            disabled={flags.busy}
            onChange={(e) => void flags.run(() => liveRoom.setFlags({ slow_mode_seconds: Number(e.target.value) }))}
          >
            {SLOW_MODES.map((s) => (
              <option key={s} value={s}>
                {s === 0 ? 'Kein Tempolimit' : `1 Nachricht / ${s} s`}
              </option>
            ))}
            {!SLOW_MODES.includes(show.slow_mode_seconds) && <option value={show.slow_mode_seconds}>{show.slow_mode_seconds} s</option>}
          </select>
        </>
      }
    >
      {featuredId && !liveRoom.hasChatHighlightTemplate() && (
        <span className="hint">Die hervorgehobene Nachricht erscheint in der App und im Web-Overlay. Eine Studio-Vorlage dafür gibt es noch nicht.</span>
      )}
      <div
        className="lr-chat"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {lr.chat.length === 0 && <div className="hint lr-empty">Noch keine Nachrichten.</div>}
        {lr.chat.map((m) => (
          <Message key={m.id} m={m} featured={m.id === featuredId} run={run} />
        ))}
      </div>
      <ErrorLine text={act.error ?? flags.error} />
      <form
        className="lr-form"
        onSubmit={(e) => {
          e.preventDefault();
          const body = sys.trim();
          if (body) void act.run(() => liveRoom.systemMessage(body)).then((ok) => ok && setSys(''));
        }}
      >
        <input className="input lr-grow" maxLength={280} placeholder="Hinweis an alle (erscheint als „Röbel App“)" value={sys} onChange={(e) => setSys(e.target.value)} />
        <button className="btn" type="submit" disabled={!sys.trim() || act.busy}>
          Senden
        </button>
      </form>
    </Section>
  );
}

export function VotingSection() {
  const lr = useLiveRoom();
  const flags = useRun();
  const [res, setRes] = useState<VoteResults | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const slug = lr.show?.slug;

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    const load = () =>
      fetchResults(slug).then(
        (r) => alive && (setRes(r), setErr(null)),
        () => alive && setErr('Ergebnis gerade nicht abrufbar.'),
      );
    void load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [slug]);

  if (!lr.show) return null;
  const show = lr.show;
  const pollOnAir = show.overlay?.poll === true;
  const max = Math.max(1, ...(res?.items.map((i) => i.votes) ?? [1]));

  return (
    <Section
      title="Publikumsliebling"
      aside={<Toggle label="Abstimmung offen" on={show.voting_open} disabled={flags.busy} onChange={(v) => void flags.run(() => liveRoom.setFlags({ voting_open: v }))} />}
    >
      <span className="hint">Ein Meinungsbild der Zuschauer · {res ? `${res.total} Stimmen` : '…'}</span>
      <div className="lr-results">
        {res?.items.slice(0, 8).map((i, n) => (
          <div key={i.item_id} className="lr-result">
            <span className="lr-result-rank num">{n + 1}</span>
            <span className="lr-grow lr-ellipsis">{i.title}</span>
            <span className="lr-bar">
              <span style={{ width: `${(i.votes / max) * 100}%` }} />
            </span>
            <span className="num">{i.votes}</span>
          </div>
        ))}
        {res && res.items.length === 0 && <span className="hint">Noch keine Stimmen.</span>}
      </div>
      <div className="lr-row">
        <button className="btn" disabled={flags.busy} onClick={() => void flags.run(() => liveRoom.setAppOverlay({ poll: !pollOnAir }))}>
          {pollOnAir ? 'Ergebnis ausblenden (App + Web-Overlay)' : 'Ergebnis zeigen (App + Web-Overlay)'}
        </button>
      </div>
      <ErrorLine text={flags.error ?? err} />
    </Section>
  );
}
