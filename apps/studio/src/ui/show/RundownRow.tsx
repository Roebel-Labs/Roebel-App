// Show tab: step through the Tabelle (start list) without leaving the Show tab. The lower thirds read
// {{row.X}} / {{next.X}} from the active row; with "Automatisch mitschalten" the Röbel App follows.

import { liveRoom } from '../../live-room/controller';
import { useLiveRoom } from '../../live-room/ui/common';
import { useShow } from '../../state/store';
import type { TableRow } from '../../state/types';

function rowText(row: TableRow | undefined, columns: string[], titleCol: string | null): { title: string; rest: string } {
  if (!row) return { title: '—', rest: '' };
  const title = (titleCol && row.values[titleCol]?.trim()) || columns.map((c) => row.values[c]?.trim()).find(Boolean) || '—';
  const rest = columns
    .filter((c) => c !== titleCol)
    .map((c) => row.values[c]?.trim())
    .filter(Boolean)
    .join(' · ');
  return { title, rest };
}

function AppState() {
  const lr = useLiveRoom();
  if (!lr.show || !lr.token) return <span className="rd-app off">App: nicht verbunden (Live-Raum)</span>;
  if (!lr.autoStage) return <span className="rd-app off">App folgt nicht (Live-Raum → Automatisch mitschalten)</span>;
  if (lr.stageError) return <span className="rd-app warn">App: {lr.stageError}</span>;
  if (lr.stageNote) return <span className="rd-app warn">{lr.stageNote}</span>;
  const onStage = lr.rundown.find((i) => i.id === lr.show?.current_item_id);
  return <span className="rd-app on">{lr.stageSending ? 'App: sendet …' : `App: ${onStage?.title ?? '—'}`}</span>;
}

export function RundownRow() {
  const { state, dispatch } = useShow();
  const { columns, rows, currentRowId } = state.table;
  if (rows.length === 0) return null;
  const idx = rows.findIndex((r) => r.id === currentRowId);
  const titleCol = liveRoom.columnMapFor(columns).title;
  const cur = rowText(rows[idx], columns, titleCol);
  const next = idx + 1 < rows.length ? rowText(rows[idx + 1], columns, titleCol) : null;

  return (
    <section>
      <div className="row-head">
        <span className="row-title">Startliste</span>
        <span className="row-hint">
          {idx >= 0 ? `Zeile ${idx + 1} von ${rows.length}` : 'Keine Zeile aktiv'} · Tasten V zurück, N weiter
        </span>
        <AppState />
      </div>
      <div className="rd">
        <button
          className="rd-btn"
          disabled={idx <= 0}
          onClick={(e) => {
            e.currentTarget.blur();
            dispatch({ type: 'prevRow' });
          }}
        >
          ◂ Zurück
        </button>
        <div className="rd-main">
          <strong className="rd-title">{cur.title}</strong>
          {cur.rest && <span className="rd-rest">{cur.rest}</span>}
          {next && <span className="rd-next">Als Nächstes: {next.title}</span>}
        </div>
        <button
          className="rd-btn primary"
          disabled={idx >= rows.length - 1}
          onClick={(e) => {
            e.currentTarget.blur();
            dispatch({ type: 'nextRow' });
          }}
        >
          Weiter ▸
        </button>
      </div>
    </section>
  );
}
