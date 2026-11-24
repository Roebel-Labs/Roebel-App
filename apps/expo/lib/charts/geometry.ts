/** Pure chart math for the svg chart kit (components/charts). Never returns NaN coordinates. */

const r = (n: number) => String(Math.round(n * 100) / 100);

/** Up to `count` evenly spaced round ticks whose top tick is ≥ max. max ≤ 0 → [0]. */
export function niceTicks(max: number, count = 3): number[] {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s * count >= max) ?? 10 * mag;
  return Array.from({ length: count }, (_, i) => Math.round(step * (i + 1) * 100) / 100);
}

function points(values: number[], width: number, height: number, maxY: number): [number, number][] {
  const y = (v: number) => (maxY > 0 ? height - (Math.max(0, v) / maxY) * height : height);
  if (values.length === 1) return [[0, y(values[0])], [width, y(values[0])]];
  const dx = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((v, i) => [i * dx, y(v)]);
}

export function linePath(values: number[], width: number, height: number, maxY: number): string {
  if (values.length === 0) return '';
  return points(values, width, height, maxY)
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${r(x)},${r(y)}`)
    .join(' ');
}

export function areaPath(values: number[], width: number, height: number, maxY: number): string {
  if (values.length === 0) return '';
  const pts = points(values, width, height, maxY);
  const last = pts[pts.length - 1];
  return `${linePath(values, width, height, maxY)} L${r(last[0])},${r(height)} L${r(pts[0][0])},${r(height)} Z`;
}

function groupThousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** German compact numbers: 169 · 1.234 · 12,3 Tsd. · 2,5 Mio. */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const one = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');
  if (abs >= 1_000_000) return `${one(n / 1_000_000)} Mio.`;
  if (abs >= 10_000) return `${one(n / 1000)} Tsd.`;
  return groupThousands(n);
}

/** Daily series longer than a month are summed into buckets of `size` days (weeks). */
export function bucketSeries(values: number[], size: number): number[] {
  if (values.length <= 31) return values;
  const out: number[] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size).reduce((a, b) => a + b, 0));
  return out;
}
