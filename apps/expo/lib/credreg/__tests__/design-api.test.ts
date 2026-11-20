jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, s: string) => require('node:crypto').createHash('sha256').update(s).digest('hex'),
  digest: jest.fn(),
}));
jest.mock('expo-file-system/legacy', () => ({ EncodingType: { Base64: 'base64' }, readAsStringAsync: jest.fn() }));

import { TEMPLATES } from '@roebel/card-design';
import {
  DRAFT_ADMIN_ONLY,
  __resetCredentialStatus,
  deleteDraft,
  designErrorMessage,
  fetchCredentialStatus,
  fetchDesignAssets,
  fetchDesignOrgs,
  fetchDraft,
  fetchDrafts,
  publishDraft,
  saveDraft,
  sendDraftTest,
  uploadDesignAsset,
} from '../designs';

const account = () => ({ address: '0xABC', signMessage: jest.fn(async () => '0x' + 'ab'.repeat(65)) });
const design = TEMPLATES[0].design;
const okFetch = (data: unknown = null, status = 200) =>
  jest.fn(async (..._a: unknown[]) => ({ status, json: async () => (status === 200 ? { ok: true, data } : data) }));

afterEach(() => {
  delete (global as any).fetch;
  __resetCredentialStatus();
});

describe('card designer api', () => {
  it.each([
    ['design_orgs', (a: any) => fetchDesignOrgs(a), {}],
    ['design_drafts_list', (a: any) => fetchDrafts(a, 'org1'), { accountId: 'org1' }],
    ['design_draft_get', (a: any) => fetchDraft(a, 'd1'), { draftId: 'd1' }],
    ['design_draft_delete', (a: any) => deleteDraft(a, 'd1'), { draftId: 'd1' }],
    ['design_assets_list', (a: any) => fetchDesignAssets(a, 'org1'), { accountId: 'org1' }],
    ['design_test_send', (a: any) => sendDraftTest(a, 'd1'), { draftId: 'd1' }],
    ['design_publish', (a: any) => publishDraft(a, 'd1'), { draftId: 'd1' }],
    [
      'design_draft_save',
      (a: any) => saveDraft(a, { accountId: 'org1', draftId: 'd1', baseRevision: 4, name: 'Mitglied', kind: 'membership', design }),
      { accountId: 'org1', draftId: 'd1', baseRevision: 4, name: 'Mitglied', kind: 'membership', design },
    ],
  ])('%s is signed with its action name and payload', async (action, call, payload) => {
    const fetchMock = okFetch({});
    (global as any).fetch = fetchMock;
    const acc = account();
    const res = await call(acc);
    expect(res.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toMatch(/\/api\/credentials\/designs$/);
    expect(JSON.parse(init.body)).toMatchObject({ scope: 'roebel-credentials-v1', action, payload });
    const signed = (acc.signMessage.mock.calls[0] as any)[0].message as string;
    expect(signed.startsWith(`roebel-credentials-v1:${action}:0xabc:`)).toBe(true);
  });

  it('a new draft is saved without draftId and baseRevision', async () => {
    const fetchMock = okFetch({});
    (global as any).fetch = fetchMock;
    await saveDraft(account(), { accountId: 'org1', name: 'Neu', kind: 'role', template: 'gast', design });
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(body.payload).toEqual({ accountId: 'org1', name: 'Neu', kind: 'role', template: 'gast', design });
  });

  it('a 409 DRAFT_CONFLICT carries the newer server draft', async () => {
    const server = { id: 'd1', revision: 7, design };
    (global as any).fetch = okFetch({ ok: false, code: 'DRAFT_CONFLICT', message: 'geändert', data: server }, 409);
    const res = await saveDraft(account(), { accountId: 'o', draftId: 'd1', baseRevision: 6, name: 'x', kind: 'role', design });
    expect(res).toEqual({ ok: false, code: 'DRAFT_CONFLICT', message: 'geändert', data: server });
  });

  it('403 on a draft maps to the German admin-only message', async () => {
    (global as any).fetch = okFetch({ ok: false, code: 'FORBIDDEN', message: 'Dafür brauchst du …' }, 403);
    const res = await fetchDraft(account(), 'd1');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(designErrorMessage(res, 'draft')).toBe(DRAFT_ADMIN_ONLY);
    expect(DRAFT_ADMIN_ONLY).toBe('Dieser Entwurf ist nur für die Verwaltung der Organisation sichtbar.');
  });

  it('status: designer flag, fail closed when unreadable', async () => {
    (global as any).fetch = jest.fn(async () => ({ status: 200, json: async () => ({ enabled: false, configured: true, designer: true }) }));
    expect(await fetchCredentialStatus()).toEqual({ enabled: false, configured: true, designer: true });
    __resetCredentialStatus();
    (global as any).fetch = jest.fn(async () => { throw new Error('offline'); });
    expect(await fetchCredentialStatus()).toEqual({ enabled: false, configured: false, designer: false });
  });

  it('asset upload signs design_asset_upload over the file sha256 and sends multipart', async () => {
    // React Native's FormData keeps [name, value] pairs (file values are { uri, name, type }).
    const RealFormData = global.FormData;
    (global as any).FormData = class { _parts: [string, unknown][] = []; append(k: string, v: unknown) { this._parts.push([k, v]); } };
    const posted: { url: string; form: any }[] = [];
    const acc = account();
    const asset = { sha: 'c'.repeat(64), kind: 'logo', url: 'u', width: 10, height: 10, ai: false };
    const res = await uploadDesignAsset(acc, { accountId: 'org1', kind: 'logo', uri: 'file:///x.png', mime: 'image/png' }, {
      readBase64: async () => Buffer.from('PNGDATA').toString('base64'),
      sha256Hex: async (bytes) => require('node:crypto').createHash('sha256').update(Buffer.from(bytes)).digest('hex'),
      post: async (url, form) => { posted.push({ url, form }); return { status: 200, json: { ok: true, data: asset } }; },
    });
    (global as any).FormData = RealFormData;
    expect(res).toEqual({ ok: true, data: asset });
    expect(posted[0].url).toMatch(/\/api\/credentials\/designs\/assets$/);
    const parts = (posted[0].form as any)._parts as [string, any][];
    const request = JSON.parse(parts.find(([k]) => k === 'request')![1]);
    const sha = require('node:crypto').createHash('sha256').update('PNGDATA').digest('hex');
    expect(request).toMatchObject({ action: 'design_asset_upload', payload: { accountId: 'org1', kind: 'logo', sha256: sha } });
    expect(parts.find(([k]) => k === 'file')![1]).toMatchObject({ uri: 'file:///x.png', type: 'image/png' });
    const signed = (acc.signMessage.mock.calls[0] as any)[0].message as string;
    expect(signed.startsWith('roebel-credentials-v1:design_asset_upload:0xabc:')).toBe(true);
  });
});
