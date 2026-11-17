import { apiDataUserGet, apiDataUserSet, apiGetMuenzenBalance, apiGrantReward, apiSendNotification } from '../miniapp-api';

const W = '0xc49de63ccfee46c6c5c3e393293f66779799fb28';
const okJson = (data: unknown) => ({ ok: true, status: 200, json: async () => data });

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn(async () => okJson({ granted: true, sent: true, ok: true, value: null, exists: false, balance: 0 }));
  (global as any).fetch = fetchMock;
});

const headersOf = (i = 0) => ((fetchMock.mock.calls[i][1] ?? {}) as { headers?: Record<string, string> }).headers ?? {};

it('sends Authorization when a token is given and still sends the wallet', async () => {
  await apiGrantReward({ miniAppId: 'a', slug: 's', wallet: W, token: 'tok' }, { amount: 1, reason: 'Test', idempotencyKey: 'k' });
  const [, init] = fetchMock.mock.calls[0];
  expect(init.headers.Authorization).toBe('Bearer tok');
  expect(JSON.parse(init.body).wallet).toBe(W);
});

it('sends no Authorization header without a token', async () => {
  await apiGrantReward({ miniAppId: 'a', slug: 's', wallet: W }, { amount: 1, reason: 'Test', idempotencyKey: 'k' });
  expect(headersOf().Authorization).toBeUndefined();
  await apiGrantReward({ miniAppId: 'a', slug: 's', wallet: W, token: null }, { amount: 1, reason: 'Test', idempotencyKey: 'k' });
  expect(headersOf(1).Authorization).toBeUndefined();
});

it('balance, notifications and user data all carry the token and the wallet', async () => {
  const id = { miniAppId: 'a', slug: 's', wallet: W, token: 'tok' };
  await apiGetMuenzenBalance(id);
  await apiSendNotification(id, { title: 'T', body: 'B' });
  await apiDataUserGet(id, 'k');
  await apiDataUserSet(id, 'k', 1);
  for (let i = 0; i < 4; i++) expect(headersOf(i).Authorization).toBe('Bearer tok');
  expect(fetchMock.mock.calls[0][0]).toContain(`wallet=${W}`);
  expect(fetchMock.mock.calls[0][0]).toContain('miniAppId=a');
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).wallet).toBe(W);
  expect(fetchMock.mock.calls[2][0]).toContain(`wallet=${W}`);
  expect(JSON.parse(fetchMock.mock.calls[3][1].body).wallet).toBe(W);
});

it('a GET without a token sends no Authorization header', async () => {
  await apiGetMuenzenBalance({ miniAppId: 'a', slug: 's', wallet: W });
  expect(headersOf().Authorization).toBeUndefined();
});
