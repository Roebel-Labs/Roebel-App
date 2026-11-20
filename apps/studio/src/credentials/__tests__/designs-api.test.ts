import { afterEach, describe, expect, it, vi } from 'vitest';
import { CredentialsApiError, designCall, fetchDesignOrgs, fetchStatus, saveDraft, uploadDesignAsset } from '../api';
import { sectionView } from '../CredentialsSection';
import { API_BASE } from '../../live-room/config';
import type { OrgListItem } from '../types';

type Call = { url: string; init: RequestInit };

function mockFetch(respond: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const c = { url, init };
    calls.push(c);
    return respond(c);
  });
  return calls;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

const design = { schema: 1, format: 'card', background: { kind: 'preset', preset: 'navy' }, shine: { enabled: false, intensity: 0 }, layers: [] };

describe('card design API client', () => {
  it('posts { action, payload } with the bearer token to /api/credentials/designs', async () => {
    const calls = mockFetch(() => json(200, { ok: true, data: [{ accountId: 'a1', name: 'Verein', avatarUrl: null, role: 'owner' }] }));
    const orgs = await fetchDesignOrgs('tok-1');
    expect(orgs[0].accountId).toBe('a1');
    expect(calls[0].url).toBe(`${API_BASE}/api/credentials/designs`);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ action: 'design_orgs', payload: { client: 'studio' } });

    await designCall('design_drafts_list', { accountId: 'a1' }, 'tok-2');
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ action: 'design_drafts_list', payload: { accountId: 'a1', client: 'studio' } });
  });

  it('sends draftId and baseRevision with a save of an existing draft', async () => {
    const calls = mockFetch(() => json(200, { ok: true, data: { id: 'd1', revision: 4 } }));
    await saveDraft('t', { accountId: 'a1', draftId: 'd1', baseRevision: 3, name: 'Mitglied', kind: 'membership', template: 'schwarz', design: design as never });
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.action).toBe('design_draft_save');
    expect(body.payload).toMatchObject({ accountId: 'a1', draftId: 'd1', baseRevision: 3, name: 'Mitglied', kind: 'membership', template: 'schwarz' });
  });

  it('maps 409 DRAFT_CONFLICT to a CredentialsApiError carrying the newer draft', async () => {
    const server = { id: 'd1', revision: 7, name: 'Neu', design };
    mockFetch(() => json(409, { ok: false, code: 'DRAFT_CONFLICT', message: 'Auf einem anderen Gerät geändert.', data: server }));
    const e = (await designCall('design_draft_save', {}, 't').catch((x: unknown) => x)) as CredentialsApiError;
    expect(e).toBeInstanceOf(CredentialsApiError);
    expect(e.status).toBe(409);
    expect(e.code).toBe('DRAFT_CONFLICT');
    expect(e.data).toEqual(server);
  });

  it('uploads an image as multipart with accountId and kind', async () => {
    const asset = { sha: 'a'.repeat(64), kind: 'logo', url: 'https://x/a', width: 400, height: 200, ai: false };
    const calls = mockFetch(() => json(200, { ok: true, data: asset }));
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' });
    const r = await uploadDesignAsset('tok', 'acc-1', 'logo', file);
    expect(r).toEqual(asset);
    expect(calls[0].url).toBe(`${API_BASE}/api/credentials/designs/assets`);
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const form = calls[0].init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('accountId')).toBe('acc-1');
    expect(form.get('kind')).toBe('logo');
    expect((form.get('file') as File).name).toBe('logo.png');
  });

  it('shows the server message of a rejected upload, and a size message for a bare 413', async () => {
    mockFetch(() => json(415, { ok: false, code: 'BAD_FORMAT', message: 'Dieses Dateiformat geht nicht. Erlaubt sind PNG, JPG, WebP und SVG.' }));
    const file = new File([new Uint8Array([1])], 'x.gif', { type: 'image/gif' });
    const e = (await uploadDesignAsset('t', 'a', 'logo', file).catch((x: unknown) => x)) as CredentialsApiError;
    expect(e.code).toBe('BAD_FORMAT');
    expect(e.message).toBe('Dieses Dateiformat geht nicht. Erlaubt sind PNG, JPG, WebP und SVG.');

    mockFetch(() => new Response('Request Entity Too Large', { status: 413 }));
    const e2 = (await uploadDesignAsset('t', 'a', 'logo', file).catch((x: unknown) => x)) as CredentialsApiError;
    expect(e2.code).toBe('TOO_LARGE');
    expect(e2.message).toBe('Das Bild ist zu groß (höchstens 8 MB).');
  });

  it('reads the designer switch from the status', async () => {
    mockFetch(() => json(200, { enabled: false, configured: false, designer: true }));
    expect(await fetchStatus()).toEqual({ enabled: false, configured: false, designer: true });
    mockFetch(() => json(500, {}));
    expect(await fetchStatus()).toEqual({ enabled: false, configured: false, designer: false });
  });
});

describe('section view', () => {
  const org = { accountId: 'a', name: 'V', avatarUrl: null, subType: null, role: 'owner', membersMayBePublic: false, onChain: 'ready' } as OrgListItem;

  it('with the designer on and the register off offers the Typen tab only, without publishing', () => {
    const v = sectionView({ enabled: false, configured: false, designer: true }, org);
    expect(v).toEqual({ kind: 'open', tabs: ['types'], register: false, designer: true });
  });

  it('with both off says it is not switched on', () => {
    expect(sectionView({ enabled: false, configured: false, designer: false }, org)).toEqual({ kind: 'off' });
  });

  it('with the register on offers every tab', () => {
    const v = sectionView({ enabled: true, configured: true, designer: false }, org);
    expect(v).toEqual({ kind: 'open', tabs: ['types', 'people', 'batches', 'events', 'settings'], register: true, designer: false });
  });

  it('with the register on but the org not ready keeps the designer open', () => {
    const notReady = { ...org, onChain: 'org_not_registered' as const };
    expect(sectionView({ enabled: true, configured: true, designer: true }, notReady)).toEqual({ kind: 'open', tabs: ['types'], register: false, designer: true, notReady: true });
    expect(sectionView({ enabled: true, configured: true, designer: false }, notReady)).toEqual({ kind: 'not-ready' });
  });
});
