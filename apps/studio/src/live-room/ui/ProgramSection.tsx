// Tabelle → App rundown push and the automatic "Jetzt auf der Fläche" sync.

import { useState } from 'react';
import { t } from '../../i18n';
import { useShow } from '../../state/store';
import { ConfirmDialog } from '../../ui/Dialog';
import { liveRoom } from '../controller';
import type { ColumnMap } from '../rundown';
import { ErrorLine, Section, Toggle, useLiveRoom, useRun } from './common';

function ColumnSelect({ label, value, columns, onChange }: { label: string; value: string | null; columns: string[]; onChange: (v: string | null) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">—</option>
        {columns.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ProgramSection() {
  const lr = useLiveRoom();
  const { state } = useShow();
  const [confirm, setConfirm] = useState(false);
  const [pushed, setPushed] = useState<number | null>(null);
  const push = useRun();
  const manual = useRun();
  if (!lr.show) return null;

  const columns = state.table.columns;
  const map = liveRoom.columnMapFor(columns);
  const setMap = (patch: Partial<ColumnMap>) => liveRoom.setColumnMap({ ...map, ...patch });
  const preview = liveRoom.previewRundown(state.table);
  const onStage = lr.rundown.find((i) => i.id === lr.show?.current_item_id);
  const mapped = Object.keys(lr.rowMaps[lr.show.id] ?? {}).length;

  return (
    <Section title={t('Programm in der App')} aside={<Toggle label={t('Automatisch mitschalten')} on={lr.autoStage} onChange={(v) => liveRoom.setAutoStage(v)} />}>
      <div className="lr-onstage">
        <span className="hint">{t('Jetzt auf der Fläche (App)')}</span>
        <strong>{onStage ? onStage.title : '—'}</strong>
        {onStage?.subtitle && <span className="hint">{onStage.subtitle}</span>}
        {lr.stageSending && <span className="hint">{t('sendet …')}</span>}
      </div>
      {lr.autoStage && (
        <span className="hint">{t('Wechselst du in der Show die aktive Tabellenzeile, springt die App mit (Erinnerungen gehen raus).')}</span>
      )}
      <ErrorLine text={lr.stageError} />
      {lr.stageNote && <div className="lr-warn">{lr.stageNote}</div>}
      <div className="lr-row">
        <button className="btn" disabled={manual.busy} onClick={() => void manual.run(() => liveRoom.syncStageNow())}>
          {t('Aktive Zeile jetzt senden')}
        </button>
        <button className="btn ghost" disabled={manual.busy} onClick={() => void manual.run(() => liveRoom.nextOnStage())}>
          {t('Nächste Gruppe (nur App)')}
        </button>
      </div>
      <ErrorLine text={manual.error} />

      <div className="lr-sub">
        <strong>{t('Spalten zuordnen')}</strong>
        <div className="lr-grid4">
          <ColumnSelect label={t('Titel')} value={map.title} columns={columns} onChange={(v) => setMap({ title: v })} />
          <ColumnSelect label={t('Untertitel')} value={map.subtitle[0] ?? null} columns={columns} onChange={(v) => setMap({ subtitle: [v, map.subtitle[1] ?? null].filter((x): x is string => !!x) })} />
          <ColumnSelect label={t('Untertitel 2')} value={map.subtitle[1] ?? null} columns={columns} onChange={(v) => setMap({ subtitle: [map.subtitle[0] ?? null, v].filter((x): x is string => !!x) })} />
          <ColumnSelect label={t('Detail')} value={map.detail} columns={columns} onChange={(v) => setMap({ detail: v })} />
          <ColumnSelect label={t('Uhrzeit')} value={map.time} columns={columns} onChange={(v) => setMap({ time: v })} />
        </div>
        <div className="lr-row">
          <button className="btn primary" disabled={push.busy || preview.rows.length === 0 || !lr.token} onClick={() => setConfirm(true)}>
            {t('Tabelle → App')}
          </button>
          <span className="hint">
            {t('{n} Programmpunkte · App hat {m}', { n: preview.rows.length, m: lr.rundown.length })}
            {mapped > 0 ? ` · ${t('{n} Zeilen verknüpft', { n: mapped })}` : ''}
            {pushed !== null ? ` · ${t('{n} gesendet', { n: pushed })}` : ''}
          </span>
        </div>
        <ErrorLine text={push.error} />
      </div>
      {confirm && (
        <ConfirmDialog
          title={t('Programm in der App ersetzen?')}
          body={
            <p>
              {t('Die {n} Zeilen der Tabelle ersetzen das komplette Programm in der App. „Jetzt auf der Fläche“ wird zurückgesetzt, Erinnerungen an alte Programmpunkte gehen verloren.', { n: preview.rows.length })}
            </p>
          }
          confirmLabel={t('Ersetzen')}
          busy={push.busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            void push.run(async () => setPushed(await liveRoom.pushRundown(state.table)));
          }}
        />
      )}
    </Section>
  );
}
