import { apiDataGet, apiDataList, apiDataUserGet, apiDataUserSet, apiGetMuenzenBalance, apiGrantReward, apiSendNotification } from '../miniapp-api';

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

it('the four user-scoped calls send x-roebel-host: expo; app content reads do not', async () => {
  const id = { miniAppId: 'a', slug: 's', wallet: W };
  await apiGetMuenzenBalance(id);
  await apiGrantReward(id, { amount: 1, reason: 'Test', idempotencyKey: 'k' });
  await apiSendNotification(id, { title: 'T', body: 'B' });
  await apiDataUserGet(id, 'k');
  await apiDataUserSet(id, 'k', 1);
  for (let i = 0; i < 5; i++) expect(headersOf(i)['x-roebel-host']).toBe('expo');
  await apiDataGet(id, 'k');
  await apiDataList(id);
  expect(headersOf(5)['x-roebel-host']).toBeUndefined();
  expect(headersOf(6)['x-roebel-host']).toBeUndefined();
});

it('logged out: the balance is zero without a server call', async () => {
  expect(await apiGetMuenzenBalance({ miniAppId: 'a', slug: 's', wallet: null })).toEqual({ balance: '0', decimals: 18, symbol: 'RÖ' });
  expect(fetchMock).not.toHaveBeenCalled();
});

const unauthorized = () => ({ ok: false, status: 401, json: async () => ({ code: 'unauthorized', message: 'Nutzer-Token ungültig oder abgelaufen.' }) });

it('a 401 on a call carrying a token reports the token and is not retried', async () => {
  fetchMock.mockImplementation(async () => unauthorized());
  const onTokenRejected = jest.fn();
  const id = { miniAppId: 'a', slug: 's', wallet: W, token: 'tok', onTokenRejected };
  await expect(apiGrantReward(id, { amount: 1, reason: 'Test', idempotencyKey: 'k' })).rejects.toMatchObject({ code: 'unauthorized' });
  await expect(apiDataUserGet(id, 'k')).rejects.toMatchObject({ code: 'unauthorized' });
  expect(onTokenRejected.mock.calls).toEqual([['tok'], ['tok']]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('a 401 without a token, or another error with one, reports nothing', async () => {
  const onTokenRejected = jest.fn();
  fetchMock.mockImplementationOnce(async () => unauthorized());
  await expect(apiGetMuenzenBalance({ miniAppId: 'a', slug: 's', wallet: W, onTokenRejected })).rejects.toMatchObject({ code: 'unauthorized' });
  fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 500, json: async () => ({}) }));
  await expect(apiGetMuenzenBalance({ miniAppId: 'a', slug: 's', wallet: W, token: 'tok', onTokenRejected })).rejects.toMatchObject({ code: 'internal' });
  expect(onTokenRejected).not.toHaveBeenCalled();
});
