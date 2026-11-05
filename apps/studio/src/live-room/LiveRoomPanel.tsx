// "Live-Raum" tab: connects Röbel Studio to the Röbel App live room (docs/superpowers/specs/2026-11-05-live-room-design.md).

import { useEffect, useRef, useState } from 'react';
import { useShow } from '../state/store';
import { ConfirmDialog } from '../ui/Dialog';
import { broadcasting } from '../ui/live-room-seams';
import { useStudio } from '../ui/studio';
import { liveRoom } from './controller';
import type { LiveShowStatus } from './types';
import { ChatSection, VotingSection } from './ui/ChatSection';
import { ErrorLine, Section, Toggle, useLiveRoom, useRun } from './ui/common';
import { GuestSection } from './ui/GuestSection';
import { ProgramSection } from './ui/ProgramSection';
import { StreamSection } from './ui/StreamSection';
import { SupportSection } from './ui/SupportSection';
import './live-room.css';

/** Feeds the show state, dispatch and on-air state into the live-room controller. */
function useLiveRoomBridge() {
  const { state, dispatch } = useShow();
  const { onAir } = useStudio();
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    liveRoom.start();
    return liveRoom.bind({ dispatch, getState: () => latest.current });
  }, [dispatch]);

  useEffect(() => {
    // Same predicate as the studio's onAir seam: a local-only recording never puts the app on LIVE.
    liveRoom.attachOnAir({ get: () => broadcasting(onAir), subscribe: (cb) => onAir.subscribe(cb) });
  }, [onAir]);

  useEffect(() => {
    liveRoom.onTable(state.table);
  }, [state.table]);
}

/**
 * Optional: mount once next to the tabs (inside StudioProvider) so alerts, the on-stage sync and the
 * on-air follow keep working while another tab is open. Renders nothing.
 */
export function LiveRoomRuntime() {
  useLiveRoomBridge();
  return null;
}

const STATUS_LABEL: Record<LiveShowStatus, string> = { scheduled: 'Geplant', live: 'LIVE', ended: 'Beendet' };

function realtimeText(s: string): string {
  return s === 'connected' ? 'Echtzeit verbunden' : s === 'connecting' ? 'Echtzeit verbindet …' : s === 'error' ? 'Echtzeit gestört' : 'Echtzeit aus';
}

function ConnectionSection() {
  const lr = useLiveRoom();
  const [draft, setDraft] = useState(lr.token);
  const test = useRun();
  useEffect(() => setDraft(lr.token), [lr.token]);
  const tokenDirty = draft.trim() !== lr.token;

  return (
    <Section title="Verbindung">
      <div className="lr-form">
        <label className="field lr-grow">
          <span>Übertragung</span>
          <select className="input" value={lr.showId ?? ''} onChange={(e) => void liveRoom.selectShow(e.target.value || null)}>
            <option value="">Bitte wählen …</option>
            {lr.shows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
                {s.is_test ? ' (Test)' : ''} · {STATUS_LABEL[s.status] ?? s.status}
              </option>
            ))}
          </select>
        </label>
        <button className="btn ghost lr-align-end" onClick={() => void liveRoom.refreshShows()}>
          Neu laden
        </button>
      </div>
      <div className="lr-form">
        <label className="field lr-grow">
          <span>Studio-Schlüssel</span>
          <input
            className="input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Vom Admin erhalten, einmal einfügen"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => tokenDirty && liveRoom.setToken(draft)}
          />
        </label>
        <button
          className="btn lr-align-end"
          disabled={test.busy || !lr.showId || !draft.trim()}
          onClick={() => {
            if (tokenDirty) liveRoom.setToken(draft);
            void test.run(() => liveRoom.testConnection());
          }}
        >
          {lr.conn.state === 'testing' ? 'Teste …' : 'Verbindung testen'}
        </button>
      </div>
      <div className="lr-status">
        <span className={`lr-badge ${lr.conn.state === 'ok' ? 'ok' : lr.conn.state === 'error' ? 'bad' : 'off'}`}>
          <span className="lr-dot" />
          {lr.conn.state === 'ok' ? 'Schlüssel gültig' : lr.conn.state === 'error' ? 'Schlüssel abgelehnt' : lr.token ? 'Schlüssel nicht getestet' : 'Kein Schlüssel'}
        </span>
        {lr.showId && (
          <span className={`lr-badge ${lr.realtime === 'connected' ? 'ok' : lr.realtime === 'error' ? 'bad' : 'off'}`}>
            <span className="lr-dot" />
            {realtimeText(lr.realtime)}
          </span>
        )}
        {lr.show && (
          <>
            <span className="lr-stat">
              <strong className="num">{lr.viewers ?? '–'}</strong> Zuschauer
            </span>
            <span className="lr-stat">
              <strong className="num">{lr.reactionsPerMin}</strong> Reaktionen/min
            </span>
          </>
        )}
      </div>
      <ErrorLine text={lr.conn.message ?? lr.showsError} />
    </Section>
  );
}

function BroadcastSection() {
  const lr = useLiveRoom();
  const [ask, setAsk] = useState<LiveShowStatus | null>(null);
  const r = useRun();
  if (!lr.show) return null;
  const status = lr.show.status;

  const confirmText: Record<LiveShowStatus, { title: string; body: string; label: string }> = {
    live: { title: 'Übertragung in der App starten?', body: 'Die App zeigt die Übertragung als LIVE an.', label: 'LIVE schalten' },
    ended: {
      title: 'Übertragung in der App beenden?',
      body: 'Die App zeigt „Beendet“; die Aufzeichnung wird zur Wiederholung. Der Studio-Stream läuft unabhängig davon weiter.',
      label: 'Beenden',
    },
    scheduled: { title: 'Zurück auf „Geplant“?', body: 'Die App zeigt wieder den Countdown.', label: 'Zurücksetzen' },
  };

  return (
    <Section
      title="Status in der App"
      aside={
        <span className={`lr-badge ${status === 'live' ? 'live' : 'off'}`}>
          <span className="lr-dot" />
          {STATUS_LABEL[status]}
        </span>
      }
    >
      <div className="lr-row">
        <span className="hint">
          Studio: {lr.studioOnAir === null ? 'unbekannt' : lr.studioOnAir ? 'auf Sendung' : 'nicht auf Sendung'}
        </span>
        <span className="lr-push">
          <Toggle label="Folgt dem Studio" on={lr.autoFollowAir} onChange={(v) => liveRoom.setAutoFollowAir(v)} />
        </span>
      </div>
      {lr.autoFollowAir && <span className="hint">Sobald das Studio auf Sendung geht, steht die App auf LIVE. Beim Beenden fragen wir nach.</span>}
      {lr.askEnd && (
        <div className="lr-warn lr-row">
          <span className="lr-grow">Das Studio sendet nicht mehr. Übertragung auch in der App beenden?</span>
          <button className="btn solid-danger" disabled={r.busy} onClick={() => void r.run(() => liveRoom.setStatus('ended'))}>
            In der App beenden
          </button>
          <button className="btn ghost" onClick={() => liveRoom.dismissAskEnd()}>
            Noch nicht
          </button>
        </div>
      )}
      <div className="lr-row">
        <button className="btn" disabled={status === 'live' || r.busy} onClick={() => setAsk('live')}>
          LIVE schalten
        </button>
        <button className="btn danger" disabled={status !== 'live' || r.busy} onClick={() => setAsk('ended')}>
          Beenden
        </button>
        {status === 'ended' && (
          <button className="btn ghost" disabled={r.busy} onClick={() => setAsk('scheduled')}>
            Auf „Geplant“ zurücksetzen
          </button>
        )}
      </div>
      <ErrorLine text={r.error ?? lr.followError} />
      {ask && (
        <ConfirmDialog
          title={confirmText[ask].title}
          body={<p>{confirmText[ask].body}</p>}
          confirmLabel={confirmText[ask].label}
          danger={ask === 'ended'}
          busy={r.busy}
          onCancel={() => setAsk(null)}
          onConfirm={() => {
            const s = ask;
            setAsk(null);
            void r.run(() => liveRoom.setStatus(s));
          }}
        />
      )}
    </Section>
  );
}

export function LiveRoomPanel() {
  useLiveRoomBridge();
  const lr = useLiveRoom();
  return (
    <div className="lr">
      <div className="lr-col">
        <ConnectionSection />
        <BroadcastSection />
        <StreamSection />
        <ProgramSection />
      </div>
      <div className="lr-col">
        {lr.show ? (
          <>
            <SupportSection />
            <GuestSection />
            <ChatSection />
            <VotingSection />
          </>
        ) : (
          <div className="placeholder">Übertragung wählen, um Chat, Unterstützungen und Gäste zu sehen.</div>
        )}
      </div>
    </div>
  );
}
