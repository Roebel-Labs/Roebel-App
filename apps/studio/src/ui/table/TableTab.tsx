import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { parseCsv, type ParsedCsv } from '../../csv';
import type { Action } from '../../state/reducer';
import { useShow } from '../../state/store';
import type { Table } from '../../state/types';
import './table.css';

type Dispatch = (a: Action) => void;
type Row = Table['rows'][number];

/** Moves focus to the same column one row down (Enter) or up (Shift+Enter). */
function focusNeighbour(el: HTMLElement, dir: 1 | -1) {
  const tr = el.closest('tr');
  const col = el.getAttribute('data-col');
  const next = dir === 1 ? tr?.nextElementSibling : tr?.previousElementSibling;
  const target = next?.querySelector<HTMLInputElement>(`input[data-col="${CSS.escape(col ?? '')}"]`);
  target?.focus();
  target?.select();
}

/** Local edit state; the store is only touched on blur/Enter so typing never re-renders the grid. */
const Cell = memo(function Cell({ rowId, column, value, dispatch }: { rowId: string; column: string; value: string; dispatch: Dispatch }) {
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);
  const commit = (v: string) => {
    if (v !== value) dispatch({ type: 'updateCell', rowId, column, value: v });
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit(draft);
      focusNeighbour(e.currentTarget, e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      setDraft(value);
      e.currentTarget.blur();
    }
  };
  return (
    <input
      className="cell"
      data-col={column}
      value={draft}
      onFocus={(e) => {
        editing.current = true;
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        editing.current = false;
        commit(draft);
      }}
      onKeyDown={onKey}
    />
  );
});

const DataRow = memo(function DataRow({
  row,
  index,
  count,
  columns,
  current,
  dispatch,
}: {
  row: Row;
  index: number;
  count: number;
  columns: string[];
  current: boolean;
  dispatch: Dispatch;
}) {
  return (
    <tr className={current ? 'current' : undefined}>
      <td className="num">{index + 1}</td>
      {columns.map((c) => (
        <td key={c}>
          <Cell rowId={row.id} column={c} value={row.values[c] ?? ''} dispatch={dispatch} />
        </td>
      ))}
      <td className="act">
        <button className={current ? undefined : 'primary'} disabled={current} onClick={() => dispatch({ type: 'selectRow', rowId: row.id })}>
          {current ? 'Auf Sendung' : 'Auf Sendung: Zeile setzen'}
        </button>
        <button className="icon" title="Nach oben" disabled={index === 0} onClick={() => dispatch({ type: 'moveRow', rowId: row.id, delta: -1 })}>
          ↑
        </button>
        <button className="icon" title="Nach unten" disabled={index === count - 1} onClick={() => dispatch({ type: 'moveRow', rowId: row.id, delta: 1 })}>
          ↓
        </button>
        <button className="icon" title="Zeile löschen" onClick={() => dispatch({ type: 'removeRow', rowId: row.id })}>
          ✕
        </button>
      </td>
    </tr>
  );
});

function ColumnHeader({ name, dispatch }: { name: string; dispatch: Dispatch }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = () => {
    const v = draft.trim();
    if (v !== name) dispatch({ type: 'renameColumn', from: name, to: v });
    setDraft(name); // reducer rejects blanks/collisions; the effect re-syncs on success
  };
  return (
    <div className="hd">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(name);
            e.currentTarget.blur();
          }
        }}
      />
      <button title="Spalte löschen" onClick={() => dispatch({ type: 'removeColumn', name })}>
        ✕
      </button>
    </div>
  );
}

function ImportPanel({ table, dispatch, onClose }: { table: Table; dispatch: Dispatch; onClose: () => void }) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const analyse = (t: string) => setParsed(t.trim() === '' ? null : parseCsv(t));
  const onFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const t = String(reader.result ?? '');
      setText(t);
      analyse(t);
    };
    reader.readAsText(f);
    if (fileRef.current) fileRef.current.value = '';
  };

  const toRows = (p: ParsedCsv): Row[] => p.rows.map((values) => ({ id: crypto.randomUUID(), values }));
  const replace = () => {
    if (!parsed) return;
    const rows = toRows(parsed);
    dispatch({ type: 'setTable', table: { columns: parsed.columns, rows, currentRowId: rows[0]?.id ?? null } });
    onClose();
  };
  const append = () => {
    if (!parsed) return;
    const rows = toRows(parsed);
    const columns = [...table.columns, ...parsed.columns.filter((c) => !table.columns.includes(c))];
    const all = [...table.rows, ...rows];
    dispatch({ type: 'setTable', table: { columns, rows: all, currentRowId: table.currentRowId ?? rows[0]?.id ?? null } });
    onClose();
  };

  const empty = !parsed || parsed.columns.length === 0;
  return (
    <div className="tbl-import">
      <textarea
        placeholder="Tabelle aus Google Sheets oder Excel hier einfügen (Tab-, Semikolon- oder Komma-getrennt)"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          analyse(e.target.value);
        }}
      />
      <div className="tbl-bar">
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button onClick={() => fileRef.current?.click()}>Datei laden…</button>
        {parsed && !empty && (
          <span className="tbl-hint">
            {parsed.rows.length} Zeilen, {parsed.columns.length} Spalten
          </span>
        )}
        <span className="spacer" />
        <button disabled={empty} onClick={append}>
          Anhängen
        </button>
        <button className="primary" disabled={empty} onClick={replace}>
          Ersetzen
        </button>
        <button onClick={onClose}>Abbrechen</button>
      </div>
      {parsed && !empty && (
        <div className="tbl-preview">
          <table>
            <thead>
              <tr>
                {parsed.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.rows.slice(0, 5).map((r, i) => (
                <tr key={i}>
                  {parsed.columns.map((c) => (
                    <td key={c}>{r[c]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function TableTab() {
  const { state, dispatch } = useShow();
  const stable = useCallback((a: Action) => dispatch(a), [dispatch]);
  const { columns, rows, currentRowId } = state.table;
  const [importing, setImporting] = useState(false);
  const [newCol, setNewCol] = useState('');
  const idx = rows.findIndex((r) => r.id === currentRowId);

  const addColumn = () => {
    stable({ type: 'addColumn', name: newCol });
    setNewCol('');
  };

  return (
    <div className="tbl">
      <div className="tbl-bar">
        <button onClick={() => setImporting((v) => !v)}>CSV einfügen / Datei laden</button>
        <button onClick={() => stable({ type: 'addRow' })}>Zeile hinzufügen</button>
        <input
          value={newCol}
          placeholder="Neue Spalte"
          onChange={(e) => setNewCol(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addColumn()}
          style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line-strong)', borderRadius: 4, padding: '6px 8px', font: 'inherit', fontSize: 13, width: 140 }}
        />
        <button disabled={newCol.trim() === ''} onClick={addColumn}>
          Spalte hinzufügen
        </button>
        <span className="spacer" />
        <span className="tbl-hint">
          {rows.length === 0 ? 'Keine Zeilen' : idx >= 0 ? `Auf Sendung: Zeile ${idx + 1} von ${rows.length}` : 'Keine Zeile auf Sendung'}
        </span>
        <button className="primary" disabled={idx < 0 || idx >= rows.length - 1} onClick={() => stable({ type: 'nextRow' })}>
          Weiter ▸
        </button>
      </div>
      {importing && <ImportPanel table={state.table} dispatch={stable} onClose={() => setImporting(false)} />}
      {columns.length === 0 ? (
        <div className="tbl-hint">Noch keine Tabelle. Füge Daten aus Google Sheets ein oder lege eine Spalte an. Lower Thirds nutzen {'{{row.Spalte}}'} und {'{{next.Spalte}}'}.</div>
      ) : (
        <div className="tbl-scroll">
          <table className="tbl-grid">
            <thead>
              <tr>
                <th />
                {columns.map((c) => (
                  <th key={c}>
                    <ColumnHeader name={c} dispatch={stable} />
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <DataRow key={r.id} row={r} index={i} count={rows.length} columns={columns} current={r.id === currentRowId} dispatch={stable} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
