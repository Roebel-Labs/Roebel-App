// Phone guests: doorbell (guest_list every 2 s), accept → LiveKit room, local preview tile.

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { t } from '../../i18n';
import { displayName } from '../alerts';
import { liveRoom } from '../controller';
import { liveRoomGuests, liveRoomSeams, type LiveGuest } from '../seams';
import type { GuestRequest } from '../types';
import { ErrorLine, Section, timeOf, useLiveRoom, useRun } from './common';

function Preview({ guest }: { guest: LiveGuest | undefined }) {
  const ref = useRef<HTMLVideoElement>(null);
  const tracks = guest?.stream.getTracks().map((tr) => tr.id).join('|') ?? '';
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
          {!guest ? t('Nicht verbunden') : guest.state === 'connecting' ? t('Verbindet …') : guest.state === 'waiting' ? t('Warte auf Kamera …') : t('Verbindung verloren')}
        </span>
      )}
    </div>
  );
}

function Guest({ g, live }: { g: GuestRequest; live: LiveGuest | undefined }) {
  const r = useRun();
  const name = displayName(g.display_name, t('Gast'));
  const accepted = g.status === 'accepted';
  return (
    <div className={`lr-guest ${accepted ? 'accepted' : ''}`}>
      <div className="lr-row">
        <span className="lr-grow">
          📱 <strong>{name}</strong> {accepted ? t('ist zugeschaltet') : t('möchte beitreten')}
        </span>
        <span className="hint">{timeOf(g.created_at)}</span>
      </div>
      {g.note && <div className="lr-msg-body">„{g.note}“</div>}
      {accepted && <Preview guest={live} />}
      <div className="lr-row">
        {!accepted && (
          <>
            <button className="btn" disabled={r.busy} onClick={() => void r.run(() => liveRoom.acceptGuest(g))}>
              {t('Annehmen')}
            </button>
            <button className="btn ghost" disabled={r.busy} onClick={() => void r.run(() => liveRoom.declineGuest(g))}>
              {t('Ablehnen')}
            </button>
          </>
        )}
        {accepted && (!live || live.state === 'lost') && (
          <button className="btn" disabled={r.busy} onClick={() => void r.run(() => liveRoom.acceptGuest(g))}>
            {t('Neu verbinden')}
          </button>
        )}
        {accepted && (
          <button className="btn danger" disabled={r.busy} onClick={() => void r.run(() => liveRoom.endGuest(g))}>
            {t('Beenden')}
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
    <Section title={t('Gäste per Handy')}>
      {lr.livekit === false && <div className="lr-warn">{t('LiveKit ist auf dem Server nicht eingerichtet. Gäste können nicht zugeschaltet werden.')}</div>}
      {lr.guests.length === 0 && <span className="hint">{t('Niemand klingelt gerade. Anfragen aus der App erscheinen hier.')}</span>}
      {lr.guests.map((g) => (
        <Guest key={g.id} g={g} live={byId.get(g.id)} />
      ))}
      {guests.length > 0 && !seams.registerExternalSource && (
        <span className="hint">{t('Das Gastbild ist hier zu sehen, als Studio-Quelle aber noch nicht verfügbar.')}</span>
      )}
      <ErrorLine text={lr.guestError} />
    </Section>
  );
}
