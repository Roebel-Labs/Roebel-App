// NSP-13 Stage 2 on the device: Vorhaben actions signed with the person's own Nostr key.
// The builder output is checked against the protocol (safeParseAction, isTrustedAction) AND the web route's own
// validator (apps/web/src/lib/vorhaben/person-events.ts) with fake deps.
import { getPublicKeyHex } from '@netizen-labs/nostr';
import { isTrustedAction, safeParseAction } from '@netizen-labs/protocol';
import {
  handlePersonEvent, type OutboxMatch, type PersonEventDeps, type PersonTaskInfo,
} from '../../../web/src/lib/vorhaben/person-events';

const mockIdentity = { current: null as null | { secretKey: Uint8Array; publicKey: string; npub: string } };
const mockRegistered = { current: null as string | null };
jest.mock('../nostr/identity', () => ({
  loadStoredIdentity: jest.fn(async () => mockIdentity.current),
  getRegisteredAt: jest.fn(async () => mockRegistered.current),
}));
const mockPostSigned = jest.fn(async (..._args: unknown[]) => ({ ok: true, data: { status: 'legacy' } }));
const mockSignQueued = jest.fn(async (..._args: unknown[]) => '0x' + 'ab'.repeat(65));
jest.mock('../signed-request', () => ({
  getApiBaseUrl: () => 'https://api.test',
  postSigned: (...args: unknown[]) => mockPostSigned(...args),
  signQueued: (...args: unknown[]) => mockSignQueued(...args),
  VORHABEN_SCOPE: 'roebel-vorhaben-v1',
}));
jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '44444444-4444-4444-8444-444444444444' }));

// eslint-disable-next-line import/first
import {
  buildTallyConfirmEvent, buildTaskActionEvent, personRoleFor, resetVorhabenEventCache, sendTaskActionEvent,
} from '../nostr/vorhaben-events';
// eslint-disable-next-line import/first
import { submitTally, vorhabenAction } from '../vorhaben';

const TOWN = '4ab27595540add57cdef3b8db40e96d60d56d121427b7bdf524c51ccad0325d7';
const sk = (b: number) => new Uint8Array(32).fill(b);
const ASSIGNEE_SK = sk(1), ATTESTER_SK = sk(2), PROPOSER_SK = sk(3);
const ASSIGNEE = '0x' + '1'.repeat(40), ATTESTER = '0x' + '2'.repeat(40), PROPOSER = '0x' + '3'.repeat(40);
const T_ID = '22222222-2222-4222-8222-222222222222';
const NEW_T_ID = '44444444-4444-4444-8444-444444444444';
const P_ID = '11111111-1111-4111-8111-111111111111';
const P_KEY = '0xkey';
const SIG = '0x' + 'ab'.repeat(65);
const RESULT_HASH = '0x' + 'cd'.repeat(32);
const TALLY_MSG = `Ich bestätige das Auszählungsergebnis von Vorschlag #7 „Bank“: Ja 3, Nein 1, Enthaltung 0. Auszählungsvertrag 0x${'9'.repeat(40)} auf Gnosis. Ergebnis-Hash ${RESULT_HASH}.`;
const pk = (s: Uint8Array) => getPublicKeyHex(s);
const BOUND = new Map<string, string>([[pk(ASSIGNEE_SK), ASSIGNEE], [pk(ATTESTER_SK), ATTESTER], [pk(PROPOSER_SK), PROPOSER]]);
const nowSec = () => Math.floor(Date.now() / 1000);

function serverDeps(over: { task?: Partial<PersonTaskInfo>; next?: number; row?: Partial<OutboxMatch> } = {}) {
  const calls: Array<[string, string, Record<string, unknown>]> = [];
  const task: PersonTaskInfo = { proposalUuid: P_ID, proposalKey: P_KEY, proposer: PROPOSER, status: 'eingereicht', assignee: ASSIGNEE, ...over.task };
  const deps: PersonEventDeps = {
    townPubkey: TOWN,
    nowSec,
    walletForPubkey: async (p) => BOUND.get(p) ?? null,
    pubkeyForWallet: async (w) => [...BOUND].find(([, x]) => x === w)?.[0] ?? null,
    getTask: async (id) => (id === T_ID ? task : null),
    getProposal: async (id) => (id === P_ID ? { proposalKey: P_KEY, proposer: PROPOSER } : null),
    isAttester: async (w) => w === ATTESTER,
    eventKnown: async () => false,
    nextSeq: async () => over.next ?? 3,
    runTaskAction: async (w, a, p) => { calls.push([w, a, p]); return { ok: true, data: {} }; },
    runTallyConfirm: async () => ({ ok: true, lineIds: ['l1'] }),
    findOutboxRow: async () => null,
    attachEvent: async () => true,
    log: () => {},
  };
  return { deps, calls };
}

/** Builds with the device builder, then runs protocol + server validation on a JSON round trip. */
async function roundTrip(s: Uint8Array, action: Parameters<typeof buildTaskActionEvent>[0]['action'], payload: Record<string, unknown>,
  status: string | null, isProposer: boolean, server = serverDeps({ task: { status: status ?? 'offen' } }), seq = 3) {
  const role = personRoleFor(action, isProposer)!;
  const event = buildTaskActionEvent({ secretKey: s, pubkey: pk(s), town: TOWN, seq, action, payload, ctx: { proposalKey: P_KEY, role, status } });
  expect(safeParseAction(event).ok).toBe(true);
  expect(isTrustedAction(event, TOWN)).toBe(true);
  const body = JSON.parse(JSON.stringify({ event, action, payload, wallet: BOUND.get(pk(s)) }));
  const r = await handlePersonEvent(server.deps, body);
  return { event, r, calls: server.calls };
}

describe('builder output passes the protocol and the web validator', () => {
  test('task_approve by an attester', async () => {
    const { r, calls } = await roundTrip(ATTESTER_SK, 'task_approve', { taskId: T_ID }, 'eingereicht', false);
    expect(r).toMatchObject({ ok: true });
    expect(calls).toEqual([[ATTESTER, 'task_approve', { taskId: T_ID }]]);
  });

  test('task_start / task_submit by the assignee', async () => {
    expect((await roundTrip(ASSIGNEE_SK, 'task_start', { taskId: T_ID }, 'vergeben', false)).r).toMatchObject({ ok: true });
    expect((await roundTrip(ASSIGNEE_SK, 'task_submit', { taskId: T_ID }, 'in_arbeit', false)).r).toMatchObject({ ok: true });
  });

  test('task_proof carries url/tx tags mirroring the attachments; from only when vergeben', async () => {
    const payload = { taskId: T_ID, body: 'Erledigt', attachments: [
      { type: 'image', url: 'https://x.test/a.jpg' }, { type: 'tx', hash: '0x' + 'AB'.repeat(32) },
    ] };
    const inArbeit = await roundTrip(ASSIGNEE_SK, 'task_proof', payload, 'in_arbeit', false);
    expect(inArbeit.r).toMatchObject({ ok: true });
    expect(inArbeit.event.tags.find((t) => t[0] === 'from')).toBeUndefined();
    expect(inArbeit.event.tags.filter((t) => t[0] === 'url' || t[0] === 'tx')).toEqual([
      ['url', 'https://x.test/a.jpg', 'image'], ['tx', '0x' + 'ab'.repeat(32)],
    ]);
    const vergeben = await roundTrip(ASSIGNEE_SK, 'task_proof', payload, 'vergeben', false);
    expect(vergeben.r).toMatchObject({ ok: true });
    expect(vergeben.event.tags.find((t) => t[0] === 'from')).toEqual(['from', 'vergeben']);
  });

  test('task_cancel by the proposer (role proposer) uses the public reason as content', async () => {
    const { event, r } = await roundTrip(PROPOSER_SK, 'task_cancel', { taskId: T_ID, body: '  Nicht mehr nötig  ' }, 'offen', true);
    expect(r).toMatchObject({ ok: true });
    expect(event.content).toBe('Nicht mehr nötig');
    expect(event.tags.find((t) => t[0] === 'role')).toEqual(['role', 'proposer']);
  });

  test('task_request_changes without a reason uses the fixed German default', async () => {
    const { event, r } = await roundTrip(ATTESTER_SK, 'task_request_changes', { taskId: T_ID, body: '' }, 'eingereicht', false);
    expect(r).toMatchObject({ ok: true });
    expect(event.content).toBe('Änderungen angefordert.');
  });

  test('task_assign by an attester (proposer inactive)', async () => {
    const { r } = await roundTrip(ATTESTER_SK, 'task_assign', { taskId: T_ID, applicant: ASSIGNEE }, 'offen', false);
    expect(r).toMatchObject({ ok: true });
  });

  test('task_create with a client-chosen task id at seq 1', async () => {
    const payload = { taskId: NEW_T_ID, proposalId: P_ID, title: 'Bank streichen' };
    const { event, r } = await roundTrip(PROPOSER_SK, 'task_create', payload, null, true, serverDeps({ next: 1 }), 1);
    expect(r).toMatchObject({ ok: true });
    expect(event.tags.find((t) => t[0] === 'from')).toBeUndefined();
    expect(event.tags[0]).toEqual(['a', `32108:${TOWN}:task:${NEW_T_ID}`, '', 'object']);
  });

  test('only allow-listed tags, lowercase hex, two a-tags, self p tag first', async () => {
    const { event } = await roundTrip(ATTESTER_SK, 'task_approve', { taskId: T_ID }, 'eingereicht', false);
    const names = new Set(event.tags.map((t) => t[0]));
    expect([...names].every((n) => ['a', 'action', 'from', 'to', 'p', 'role', 'seq', 'occurred_at', 'payload_hash'].includes(n))).toBe(true);
    expect(event.tags.filter((t) => t[0] === 'a')).toHaveLength(2);
    expect(event.tags.find((t) => t[0] === 'p')).toEqual(['p', pk(ATTESTER_SK), '', 'attester']);
    expect(event.id).toMatch(/^[0-9a-f]{64}$/);
    expect(event.sig).toMatch(/^[0-9a-f]{128}$/);
  });

  test('tally_confirmed by a Wahlhelfer:in', async () => {
    const event = buildTallyConfirmEvent({
      secretKey: ATTESTER_SK, pubkey: pk(ATTESTER_SK), town: TOWN, seq: 3,
      proposalKey: P_KEY, proposalId: P_ID, message: TALLY_MSG, signature: SIG, signerAccount: ATTESTER,
    })!;
    expect(safeParseAction(event).ok).toBe(true);
    expect(isTrustedAction(event, TOWN)).toBe(true);
    expect(event.tags.find((t) => t[0] === 'result_hash')).toEqual(['result_hash', RESULT_HASH]);
    const r = await handlePersonEvent(serverDeps().deps, JSON.parse(JSON.stringify({
      event, kind: 'tally_confirm', proposalId: P_ID, signature: SIG, wallet: ATTESTER,
    })));
    expect(r).toMatchObject({ ok: true, data: { lineIds: ['l1'] } });
  });
});

// ---- Transport -------------------------------------------------------------------------------------------------

type Route = (url: string, init: { method?: string; body?: string }) => { status: number; json: unknown } | 'network';
const fetchMock = jest.fn();
function routes(handler: Route) {
  fetchMock.mockImplementation(async (url: string, init: { method?: string; body?: string } = {}) => {
    const r = handler(url, init);
    if (r === 'network') throw new Error('Network request failed');
    return { status: r.status, json: async () => r.json };
  });
}
const posted = () => fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/api/vorhaben/events')).map(([, init]) => JSON.parse(init.body));
const ctx = { proposalKey: P_KEY, role: 'attester' as const, status: 'eingereicht' };

beforeEach(() => {
  resetVorhabenEventCache();
  fetchMock.mockReset();
  mockPostSigned.mockClear();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  mockIdentity.current = { secretKey: ATTESTER_SK, publicKey: pk(ATTESTER_SK), npub: 'npub1x' };
  mockRegistered.current = '2026-10-01T00:00:00.000Z';
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

const happyConfig: Route = (url) => {
  if (url.endsWith('/api/vorhaben/config')) return { status: 200, json: { ok: true, data: { townPubkey: TOWN } } };
  if (url.includes('/api/vorhaben/seq?')) return { status: 200, json: { ok: true, data: { next: 3 } } };
  return { status: 200, json: { ok: true, data: { status: 'abgenommen', personSigned: true } } };
};

test('happy path: event posted with the claimed wallet, legacy path untouched', async () => {
  routes(happyConfig);
  const account = { address: ATTESTER, signMessage: jest.fn() };
  const r = await vorhabenAction(account, 'task_approve', { taskId: T_ID }, ctx);
  expect(r).toEqual({ ok: true, data: { status: 'abgenommen', personSigned: true } });
  expect(mockPostSigned).not.toHaveBeenCalled();
  expect(account.signMessage).not.toHaveBeenCalled();
  const [body] = posted();
  expect(body).toMatchObject({ action: 'task_approve', payload: { taskId: T_ID }, wallet: ATTESTER });
  const seqUrl = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.includes('/seq?'))!;
  expect(decodeURIComponent(seqUrl.split('object=')[1])).toBe(`32108:${TOWN}:task:${T_ID}`);
});

test('SEQ_CONFLICT: retried once with the returned next', async () => {
  let n = 0;
  routes((url, init) => {
    if (url.endsWith('/api/vorhaben/events')) {
      n++;
      return n === 1 ? { status: 409, json: { ok: false, code: 'SEQ_CONFLICT', message: 'x', next: 5 } } : { status: 200, json: { ok: true, data: {} } };
    }
    return happyConfig(url, init);
  });
  const r = await sendTaskActionEvent(ATTESTER, 'task_approve', { taskId: T_ID }, ctx);
  expect(r).toEqual({ kind: 'done', result: { ok: true, data: {} } });
  const bodies = posted();
  expect(bodies.map((b) => b.event.tags.find((t: string[]) => t[0] === 'seq')[1])).toEqual(['3', '5']);
});

test('SEQ_CONFLICT twice: error returned, no legacy fallback', async () => {
  routes((url, init) => (url.endsWith('/api/vorhaben/events')
    ? { status: 409, json: { ok: false, code: 'SEQ_CONFLICT', message: 'Inzwischen …', next: 6 } } : happyConfig(url, init)));
  const r = await vorhabenAction({ address: ATTESTER, signMessage: jest.fn() }, 'task_approve', { taskId: T_ID }, ctx);
  expect(r).toMatchObject({ ok: false, code: 'SEQ_CONFLICT' });
  expect(posted()).toHaveLength(2);
  expect(mockPostSigned).not.toHaveBeenCalled();
});

test('fallback when there is no identity on the device (no network call at all)', async () => {
  mockIdentity.current = null;
  routes(happyConfig);
  const r = await vorhabenAction({ address: ATTESTER, signMessage: jest.fn() }, 'task_approve', { taskId: T_ID }, ctx);
  expect(r).toEqual({ ok: true, data: { status: 'legacy' } });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(mockPostSigned).toHaveBeenCalledWith('/api/vorhaben/tasks', expect.anything(), 'task_approve', { taskId: T_ID }, 'roebel-vorhaben-v1');
});

test('fallback when the binding was never registered', async () => {
  mockRegistered.current = null;
  routes(happyConfig);
  const r = await sendTaskActionEvent(ATTESTER, 'task_approve', { taskId: T_ID }, ctx);
  expect(r).toEqual({ kind: 'fallback', reason: 'no identity or feature off' });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('fallback when the config route says 503; the answer is cached', async () => {
  routes((url) => (url.endsWith('/api/vorhaben/config')
    ? { status: 503, json: { ok: false, code: 'FEATURE_OFF', message: 'x' } } : { status: 500, json: null }));
  expect((await sendTaskActionEvent(ATTESTER, 'task_approve', { taskId: T_ID }, ctx)).kind).toBe('fallback');
  expect((await sendTaskActionEvent(ATTESTER, 'task_approve', { taskId: T_ID }, ctx)).kind).toBe('fallback');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('fallback on a pre-action refusal (WALLET_MISMATCH after an account switch)', async () => {
  routes((url, init) => (url.endsWith('/api/vorhaben/events')
    ? { status: 409, json: { ok: false, code: 'WALLET_MISMATCH', message: 'x' } } : happyConfig(url, init)));
  const r = await vorhabenAction({ address: PROPOSER, signMessage: jest.fn() }, 'task_cancel', { taskId: T_ID, body: '' },
    { proposalKey: P_KEY, role: 'proposer', status: 'offen' });
  expect(r).toEqual({ ok: true, data: { status: 'legacy' } });
});

test('no fallback after a network failure on the event POST (it may have been applied)', async () => {
  routes((url, init) => (url.endsWith('/api/vorhaben/events') ? 'network' : happyConfig(url, init)));
  const r = await vorhabenAction({ address: ATTESTER, signMessage: jest.fn() }, 'task_approve', { taskId: T_ID }, ctx);
  expect(r).toMatchObject({ ok: false, code: 'NETWORK_ERROR' });
  expect(mockPostSigned).not.toHaveBeenCalled();
});

test('rules errors are returned as-is (no fallback)', async () => {
  routes((url, init) => (url.endsWith('/api/vorhaben/events')
    ? { status: 409, json: { ok: false, code: 'BAD_STATUS', message: 'Status passt nicht.' } } : happyConfig(url, init)));
  const r = await vorhabenAction({ address: ATTESTER, signMessage: jest.fn() }, 'task_approve', { taskId: T_ID }, ctx);
  expect(r).toEqual({ ok: false, code: 'BAD_STATUS', message: 'Status passt nicht.' });
  expect(mockPostSigned).not.toHaveBeenCalled();
});

test('applications are never person-signed', async () => {
  routes(happyConfig);
  await vorhabenAction({ address: ATTESTER, signMessage: jest.fn() }, 'task_apply', { taskId: T_ID, note: '' }, ctx);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(mockPostSigned).toHaveBeenCalled();
});

test('task_create: the app picks the task id and it is part of the signed payload', async () => {
  mockIdentity.current = { secretKey: PROPOSER_SK, publicKey: pk(PROPOSER_SK), npub: 'npub1x' };
  routes(happyConfig);
  await sendTaskActionEvent(PROPOSER, 'task_create', { proposalId: P_ID, title: 'Bank' }, { proposalKey: P_KEY, role: 'proposer' });
  const [body] = posted();
  expect(body.payload).toEqual({ proposalId: P_ID, title: 'Bank', taskId: NEW_T_ID });
  const r = await handlePersonEvent(serverDeps({ next: 3 }).deps, body);
  expect(r).toMatchObject({ ok: true });
});

test('submitTally: one wallet signature, sent inside the event', async () => {
  routes((url, init) => (url.endsWith('/api/vorhaben/events')
    ? { status: 200, json: { ok: true, data: { lineIds: ['l1'], personSigned: true } } } : happyConfig(url, init)));
  const account = { address: ATTESTER, signMessage: jest.fn() };
  const r = await submitTally(account, P_ID, TALLY_MSG, P_KEY);
  expect(r).toMatchObject({ ok: true, data: { lineIds: ['l1'] } });
  expect(mockSignQueued).toHaveBeenCalledTimes(1);
  const [body] = posted();
  expect(body).toMatchObject({ kind: 'tally_confirm', proposalId: P_ID, signature: SIG, wallet: ATTESTER });
  expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/api/vorhaben/tally-confirm'))).toBe(false);
});

test('submitTally without a Nostr identity uses the legacy route with the same signature', async () => {
  mockIdentity.current = null;
  routes((url) => (url.endsWith('/api/vorhaben/tally-confirm') ? { status: 200, json: { ok: true, data: { lineIds: [] } } } : { status: 500, json: null }));
  const r = await submitTally({ address: ATTESTER, signMessage: jest.fn() }, P_ID, TALLY_MSG, P_KEY);
  expect(r).toEqual({ ok: true, data: { lineIds: [] } });
  const legacy = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/api/vorhaben/tally-confirm'))!;
  expect(JSON.parse(legacy[1].body)).toEqual({ proposalId: P_ID, wallet: ATTESTER, signature: SIG });
});
