import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockRows, resetMockRows } from '../src/rows-mock';
import type { Row } from '../src/types';

test('mock rows: add, unique key conflict, list by prefix, update, remove', async () => {
  resetMockRows();
  const base = { collection: 'buchungen', scope: 'shared' as const };
  const a = (await mockRows({ ...base, op: 'add', key: 'raum1|2026-12-01|14', data: { raum: 'raum1' }, privateData: { name: 'Lea' } })) as Row;
  assert.equal(a.mine, true);
  assert.deepEqual(a.privateData, { name: 'Lea' });
  await assert.rejects(mockRows({ ...base, op: 'add', key: 'raum1|2026-12-01|14', data: {} }), (e: { code: string }) => e.code === 'conflict');
  await mockRows({ ...base, op: 'add', key: 'raum2|2026-12-01|14', data: {} });
  const l = (await mockRows({ ...base, op: 'list', query: { keyPrefix: 'raum1|', order: 'key' } })) as { rows: Row[]; total: number };
  assert.equal(l.total, 1);
  const u = (await mockRows({ ...base, op: 'update', id: a.id, data: { raum: 'raum1', notiz: 'x' } })) as Row;
  assert.equal(u.data.notiz, 'x');
  assert.deepEqual(await mockRows({ ...base, op: 'remove', id: a.id }), { ok: true });
  const after = (await mockRows({ ...base, op: 'list' })) as { total: number };
  assert.equal(after.total, 1);
});

test('mock rows: private and shared collections are separate; bad names are refused', async () => {
  resetMockRows();
  await mockRows({ collection: 'notizen', scope: 'private', op: 'add', data: { t: 1 } });
  const shared = (await mockRows({ collection: 'notizen', scope: 'shared', op: 'list' })) as { total: number };
  assert.equal(shared.total, 0);
  await assert.rejects(mockRows({ collection: 'Bad Name', scope: 'shared', op: 'list' }), (e: { code: string }) => e.code === 'invalid_params');
});
