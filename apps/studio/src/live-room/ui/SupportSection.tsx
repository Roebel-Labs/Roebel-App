// Unterstützungen for the operator only: queue, notice, running total. Never on air (not in stream or recording).

import { formatEuro } from '../alerts';
import { liveRoom } from '../controller';
import { ErrorLine, Section, Toggle, timeOf, useLiveRoom } from './common';

export function SupportSection() {
  const lr = useLiveRoom();
  if (!lr.show) return null;
  return (
    <Section title="Unterstützen" aside={<Toggle label="Automatisch anzeigen" on={lr.autoAlerts} onChange={(v) => liveRoom.setAutoAlerts(v)} />}>
      <div className="lr-total">
        <strong className="num">{formatEuro(lr.supportTotal.cents)}</strong>
        <span className="hint">
          von {lr.supportTotal.count} {lr.supportTotal.count === 1 ? 'Person' : 'Personen'} in dieser Übertragung
        </span>
      </div>
      <label className="lr-row">
        <span className="hint">Anzeigedauer</span>
        <input
          className="input lr-small"
          type="number"
          min={3}
          max={30}
          value={lr.alertSeconds}
          onChange={(e) => liveRoom.setAlertSeconds(Number(e.target.value))}
        />
        <span className="hint">Sekunden</span>
      </label>
      {lr.currentAlert && (
        <div className="lr-alert on">
          <span className="lr-grow">
            <strong>{lr.currentAlert.name}</strong> · {lr.currentAlert.amount}
            {lr.currentAlert.message && <span className="hint"> · {lr.currentAlert.message}</span>}
          </span>
          <span className="lr-tag">Neu</span>
          <button className="btn ghost" onClick={() => liveRoom.stopAlert()}>
            Erledigt
          </button>
        </div>
      )}
      {lr.pendingAlerts.map((a) => (
        <div key={a.id} className="lr-alert">
          <span className="lr-grow">
            <strong>{a.name}</strong> · {a.amount}
            {a.message && <span className="hint"> · {a.message}</span>}
          </span>
          <span className="hint">{timeOf(a.createdAt)}</span>
          <button className="btn" disabled={!!lr.currentAlert} onClick={() => liveRoom.showAlertNow(a.id)}>
            Hervorheben
          </button>
          <button className="btn ghost" onClick={() => liveRoom.dismissAlert(a.id)}>
            Verwerfen
          </button>
        </div>
      ))}
      {!lr.currentAlert && lr.pendingAlerts.length === 0 && (
        <span className="hint">Neue Unterstützungen erscheinen nur hier, nie im Stream oder in der Aufnahme. Die App zeigt sie selbst an.</span>
      )}
      <ErrorLine text={lr.alertError} />
    </Section>
  );
}
