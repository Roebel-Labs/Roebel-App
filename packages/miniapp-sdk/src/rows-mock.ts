/**
 * In-memory `data.rows` for mock mode (browser preview, builders without a host). Same rules
 * as the server: unique key per collection, `private` collections only list your own rows.
 * Everything here belongs to the one mock person, so `mine` is always true.
 */
import type { BridgeError, Row, RowListQuery, RowsCall } from './types';

const store = new Map<string, Row[]>();
let seq = 0;

const err = (code: BridgeError['code'], message: string): BridgeError => ({ code, message });
const bucket = (c: RowsCall) => `${c.scope}:${c.collection}`;

export function resetMockRows(): void {
  store.clear();
  seq = 0;
}

export function mockRows(call: RowsCall): Promise<unknown> {
  if (!call || typeof call.collection !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(call.collection)) {
    return Promise.reject(err('invalid_params', 'Ungültiger Sammlungsname (a-z, 0-9, - und _, bis 40 Zeichen).'));
  }
  const rows = store.get(bucket(call)) ?? [];
  store.set(bucket(call), rows);
  const now = new Date().toISOString();
  switch (call.op) {
    case 'list':
      return Promise.resolve(listRows(rows, call.query));
    case 'add': {
      if (call.key != null && rows.some((r) => r.key === call.key)) {
        return Promise.reject(err('conflict', 'Schon vergeben.'));
      }
      seq += 1;
      const row: Row = {
        id: `mock-${seq}`,
        key: call.key ?? null,
        data: call.data ?? {},
        privateData: call.privateData ?? null,
        mine: true,
        createdAt: now,
        updatedAt: now,
      };
      rows.push(row);
      return Promise.resolve(row);
    }
    case 'update': {
      const row = rows.find((r) => r.id === call.id);
      if (!row) return Promise.reject(err('invalid_params', 'Eintrag nicht gefunden.'));
      if (call.data) row.data = call.data;
      if (call.privateData) row.privateData = call.privateData;
      row.updatedAt = now;
      return Promise.resolve(row);
    }
    case 'remove': {
      const i = rows.findIndex((r) => r.id === call.id);
      if (i >= 0) rows.splice(i, 1);
      return Promise.resolve({ ok: i >= 0 });
    }
    default:
      return Promise.reject(err('invalid_params', 'Unbekannte Operation.'));
  }
}

function listRows(rows: Row[], q: RowListQuery = {}): { rows: Row[]; total: number } {
  let out = rows.filter((r) => (q.keyPrefix ? (r.key ?? '').startsWith(q.keyPrefix) : true));
  const total = out.length;
  const order = q.order ?? 'newest';
  out = [...out].sort((a, b) =>
    order === 'key' ? (a.key ?? '').localeCompare(b.key ?? '') : order === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt),
  );
  const limit = Math.min(Math.max(q.limit ?? 100, 1), 200);
  return { rows: out.slice(0, limit), total };
}
