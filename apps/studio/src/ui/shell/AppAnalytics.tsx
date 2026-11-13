import { useEffect, useMemo, useState } from 'react';
import { fetchMiniAppAnalytics, type AnalyticsRange, type AnalyticsSummary, type MyMiniApp } from '../../workspace/api';
import { SkKpis } from '../Skeleton';

const RANGES: Array<[AnalyticsRange, string]> = [
  ['7d', '7 Tage'],
  ['30d', '30 Tage'],
  ['90d', '90 Tage'],
  ['all', 'Gesamt'],
];

const fmt = (n: number) => n.toLocaleString('de-DE');
const pct = (x: number) => `${Math.round(x * 100)} %`;
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

/** The web dashboard's "Nutzung" panel for one mini app: KPIs, opens per day, top events. */
export function AppAnalytics({ token, app, onBack }: { token: string; app: MyMiniApp; onBack: () => void }) {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    fetchMiniAppAnalytics(token, app.id, range)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [token, app.id, range]);

  const chart = useMemo(() => {
    const series = data?.series ?? [];
    const w = 720;
    const h = 180;
    const padL = 36;
    const padB = 22;
    const padT = 12; // room for the top tick label
    const max = Math.max(1, ...series.map((p) => p.opens));
    const n = Math.max(1, series.length);
    const slot = (w - padL) / n;
    const barW = Math.max(2, Math.min(18, slot - 2));
    const bars = series.map((p, i) => {
      const bh = ((h - padB - padT) * p.opens) / max;
      return { x: padL + i * slot + (slot - barW) / 2, y: h - padB - bh, w: barW, h: bh, p };
    });
    const ticks = [0, Math.ceil(max / 2), max];
    return { w, h, padL, padB, padT, bars, ticks, slot };
  }, [data]);

  return (
    <div className="apps-detail">
      <div className="apps-detail-head">
        <button className="w-icon" onClick={onBack} aria-label="Zurück">
          ←
        </button>
        <strong className="w-ellipsis">{app.name}</strong>
        <span className="ws-tools-spacer" />
        <div className="ws-chips">
          {RANGES.map(([id, label]) => (
            <button key={id} className={`ws-chip${range === id ? ' on' : ''}`} onClick={() => setRange(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="ws-error">{error}</div>}
      {!data && !error && <SkKpis />}
      {data && (
        <>
          <div className="kpis">
            <Kpi label="Öffnungen" value={fmt(data.opens)} />
            <Kpi label="Aktive Nutzer" value={fmt(data.uniqueWallets)} sub={`${fmt(data.sessions)} Sitzungen`} />
            <Kpi label="Wiederkehrer" value={pct(data.retentionRate)} sub={`${fmt(data.returningWallets)} Personen`} />
            <Kpi label="Röbel Münzen" value={fmt(data.rewardsAmount)} sub={`${fmt(data.rewardsGranted)} Belohnungen${data.budget !== null ? ` · Budget ${fmt(data.spent ?? 0)} / ${fmt(data.budget)}` : ''}`} />
          </div>

          <div className="chart-card">
            <div className="chart-title">Öffnungen pro Tag</div>
            {chart.bars.length === 0 ? (
              <div className="w-muted">Noch keine Daten in diesem Zeitraum.</div>
            ) : (
              <div className="chart-wrap">
                <svg viewBox={`0 0 ${chart.w} ${chart.h}`} className="chart" role="img" aria-label="Öffnungen pro Tag">
                  {chart.ticks.map((t) => {
                    const y = chart.h - chart.padB - ((chart.h - chart.padB - chart.padT) * t) / Math.max(1, chart.ticks[2]);
                    return (
                      <g key={t}>
                        <line x1={chart.padL} x2={chart.w} y1={y} y2={y} className="chart-grid" />
                        <text x={chart.padL - 6} y={y + 4} className="chart-tick" textAnchor="end">
                          {fmt(t)}
                        </text>
                      </g>
                    );
                  })}
                  {chart.bars.map((b, i) => (
                    <g key={b.p.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                      <rect x={b.x - 1} y={0} width={b.w + 2} height={chart.h - chart.padB} fill="transparent" />
                      <rect x={b.x} y={b.y} width={b.w} height={Math.max(0, b.h)} rx={Math.min(4, b.w / 2)} className={`chart-bar${hover === i ? ' hot' : ''}`} />
                      {(i === 0 || i === chart.bars.length - 1 || i % Math.ceil(chart.bars.length / 6) === 0) && (
                        <text x={b.x + b.w / 2} y={chart.h - 6} className="chart-tick" textAnchor="middle">
                          {day(b.p.date)}
                        </text>
                      )}
                    </g>
                  ))}
                </svg>
                {hover !== null && chart.bars[hover] && (
                  <div className="chart-tip" style={{ left: `${((chart.bars[hover].x + chart.bars[hover].w / 2) / chart.w) * 100}%` }}>
                    <strong>{day(chart.bars[hover].p.date)}</strong>
                    <span>{fmt(chart.bars[hover].p.opens)} Öffnungen</span>
                    <span className="w-muted">{fmt(chart.bars[hover].p.uniqueWallets)} Nutzer · {fmt(chart.bars[hover].p.rewards)} Belohnungen</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="chart-card">
            <div className="chart-title">Häufigste Ereignisse</div>
            {data.topEvents.length === 0 ? (
              <div className="w-muted">Noch keine Ereignisse.</div>
            ) : (
              <table className="events-table">
                <tbody>
                  {data.topEvents.slice(0, 8).map((e) => (
                    <tr key={e.event}>
                      <td className="w-ellipsis">{e.event}</td>
                      <td className="num">{fmt(e.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value num">{value}</strong>
      {sub && <span className="w-muted kpi-sub">{sub}</span>}
    </div>
  );
}
