// Phone guests: doorbell (guest_list every 2 s), accept → LiveKit room, local preview tile.

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { liveRoom } from '../controller';
import { liveRoomGuests, liveRoomSeams, type LiveGuest } from '../seams';
import type { GuestRequest } from '../types';
import { ErrorLine, Section, timeOf, useLiveRoom, useRun } from './common';

function Preview({ guest }: { guest: LiveGuest | undefined }) {
  const ref = useRef<HTMLVideoElement>(null);
  const tracks = guest?.stream.getTracks().map((t) => t.id).join('|') ?? '';
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = guest?.stream ?? null;
    if (guest) void v.play().catch(() => {});
  }, [guest, tracks]);
  return (
    <div className="lr-preview">
      <video ref={ref} muted playsInline />
      {(!guest || guest.state !== 'live') && (
        <span className="lr-preview-state">
          {!guest ? 'Nicht verbunden' : guest.state === 'connecting' ? 'Verbindet …' : guest.state === 'waiting' ? 'Warte auf Kamera …' : 'Verbindung verloren'}
        </span>
      )}
    </div>
  );
}

function Guest({ g, live }: { g: GuestRequest; live: LiveGuest | undefined }) {
  const r = useRun();
  const name = g.display_name?.trim() || 'Gast';
  const accepted = g.status === 'accepted';
  return (
    <div className={`lr-guest ${accepted ? 'accepted' : ''}`}>
      <div className="lr-row">
        <span className="lr-grow">
          📱 <strong>{name}</strong> {accepted ? 'ist zugeschaltet' : 'möchte beitreten'}
        </span>
        <span className="hint">{timeOf(g.created_at)}</span>
      </div>
      {g.note && <div className="lr-msg-body">„{g.note}“</div>}
      {accepted && <Preview guest={live} />}
      <div className="lr-row">
        {!accepted && (
          <>
            <button className="btn" disabled={r.busy} onClick={() => void r.run(() => liveRoom.acceptGuest(g))}>
              Annehmen
            </button>
            <button className="btn ghost" disabled={r.busy} onClick={() => void r.run(() => liveRoom.declineGuest(g))}>
              Ablehnen
            </button>
          </>
        )}
        {accepted && (!live || live.state === 'lost') && (
          <button className="btn" disabled={r.busy} onClick={() => void r.run(() => liveRoom.acceptGuest(g))}>
            Neu verbinden
          </button>
        )}
        {accepted && (
          <button className="btn danger" disabled={r.busy} onClick={() => void r.run(() => liveRoom.endGuest(g))}>
            Beenden
          </button>
        )}
      </div>
      <ErrorLine text={r.error} />
    </div>
  );
}

export function GuestSection() {
  const lr = useLiveRoom();
  const guests = useSyncExternalStore(liveRoomGuests.subscribe, liveRoomGuests.list);
  const seams = useSyncExternalStore(liveRoomSeams.subscribe, liveRoomSeams.get);
  if (!lr.show) return null;
  if (lr.show.guests_enabled === false) return null;
  const byId = new Map(guests.map((g) => [g.requestId, g]));
  return (
    <Section title="Gäste per Handy">
      {lr.livekit === false && <div className="lr-warn">LiveKit ist auf dem Server nicht eingerichtet. Gäste können nicht zugeschaltet werden.</div>}
      {lr.guests.length === 0 && <span className="hint">Niemand klingelt gerade. Anfragen aus der App erscheinen hier.</span>}
      {lr.guests.map((g) => (
        <Guest key={g.id} g={g} live={byId.get(g.id)} />
      ))}
      {guests.length > 0 && !seams.registerExternalSource && (
        <span className="hint">Das Gastbild ist hier zu sehen, als Studio-Quelle aber noch nicht verfügbar.</span>
      )}
      <ErrorLine text={lr.guestError} />
    </Section>
  );
}
