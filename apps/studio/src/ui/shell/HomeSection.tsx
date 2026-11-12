import { hms, useOnAir, useTick } from '../studio';
import { UpdateButton } from '../UpdateButton';
import type { Section } from './nav';

/** Start: what runs right now and what is coming. The workspace assistant lands here next. */
export function HomeSection({ onOpen }: { onOpen: (s: Section) => void }) {
  const air = useOnAir();
  const now = useTick(1000);
  const live = air.phase !== 'off';
  return (
    <div className="section">
      <header className="section-head">
        <h1>Start</h1>
        <div className="topbar-end">
          <UpdateButton />
        </div>
      </header>
      <div className="home">
        <button className="home-card" onClick={() => onOpen('live')}>
          <span className="home-card-kicker">Livestream</span>
          <strong>{live ? `Auf Sendung seit ${hms(now - (air.startedAt ?? now))}` : 'Keine Sendung'}</strong>
          <span className="home-card-text">
            {live ? 'Zum Regiepult wechseln.' : 'Show vorbereiten, Kameras einrichten, auf Sendung gehen.'}
          </span>
        </button>
        <div className="home-card soon">
          <span className="home-card-kicker">Arbeitsbereich · bald</span>
          <strong>Dein Assistent für Termine, Mails und Aufgaben</strong>
          <span className="home-card-text">
            Kalender und Postfach verbinden, Entwürfe und Routinen bekommen, Veranstaltungen direkt in die Röbel App
            einreichen. Anmeldung mit der Röbel App.
          </span>
        </div>
        <button className="home-card soon" onClick={() => onOpen('apps')}>
          <span className="home-card-kicker">Mini-Apps · bald</span>
          <strong>Eigene Mini-Apps bauen</strong>
          <span className="home-card-text">Für Verein oder Betrieb, verteilt über die Röbel App.</span>
        </button>
      </div>
    </div>
  );
}
