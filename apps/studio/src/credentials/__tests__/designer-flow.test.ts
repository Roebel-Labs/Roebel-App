import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LOGO_SLOT_ASSET, TEMPLATES } from '@roebel/card-design';
import { CredentialsApiError } from '../api';
import { DesignerHeader, publishGate } from '../designer/Designer';
import { ConflictDialog } from '../designer/ConflictDialog';
import { createAutosaver } from '../designer/state';
import { logoTarget, uploadForDesign } from '../designer/upload';
import type { AssetView, DraftView, DraftWithDesign } from '../types';

const draft: DraftView = {
  id: 'd1', name: 'Mitglied', kind: 'membership', template: 'schwarz', typeId: null, revision: 2, updatedAt: '', liveVersion: null,
  pendingVersion: null, hasUnpublishedChanges: true, testSentAt: null,
};
const REASON = 'Veröffentlichen geht, sobald eure Organisation im Register eingetragen ist.';

const header = (gate: { enabled: boolean; reason: string | null }, live = false) =>
  renderToStaticMarkup(
    createElement(DesignerHeader, {
      name: 'Mitglied', kind: 'membership', kindLocked: live, status: 'saved', gate, live, busy: false,
      onName: () => undefined, onKind: () => undefined, onBack: () => undefined, onRetry: () => undefined, onTest: () => undefined, onPublish: () => undefined,
    }),
  );

describe('publishing', () => {
  it('is disabled with the register text while the org is not ready', () => {
    const gate = publishGate({ register: true, org: { onChain: 'org_not_registered' }, draft, status: 'saved' });
    expect(gate).toEqual({ enabled: false, reason: REASON });
    const html = header(gate);
    expect(html).toMatch(/<button class="w-btn green" disabled="" title="[^"]*">Veröffentlichen<\/button>/);
    expect(html).toContain(REASON);
  });

  it('is disabled with the same text while the register is off (designer only)', () => {
    expect(publishGate({ register: false, org: { onChain: 'ready' }, draft, status: 'saved' })).toEqual({ enabled: false, reason: REASON });
  });

  it('is possible for a saved draft of a ready org, and says "Update" once live', () => {
    const gate = publishGate({ register: true, org: { onChain: 'ready' }, draft, status: 'saved' });
    expect(gate).toEqual({ enabled: true, reason: null });
    expect(header(gate)).toMatch(/<button class="w-btn green">Veröffentlichen<\/button>/);
    expect(header(gate, true)).toContain('Update veröffentlichen');
    expect(publishGate({ register: true, org: { onChain: 'ready' }, draft: { ...draft, pendingVersion: 2 }, status: 'saved' }).enabled).toBe(false);
    expect(publishGate({ register: true, org: { onChain: 'ready' }, draft: null, status: 'saving' }).enabled).toBe(false);
  });
});

describe('uploads', () => {
  const design = TEMPLATES.find((x) => x.id === 'schwarz')!.design;
  const file = new File([new Uint8Array(10)], 'gross.png', { type: 'image/png' });
  const asset: AssetView = { sha: 'b'.repeat(64), kind: 'logo', url: 'https://x/b', width: 600, height: 300, ai: false };

  it('a rejected upload leaves the design unchanged and calls onError', async () => {
    const err = new CredentialsApiError(413, 'TOO_LARGE', 'Das Bild ist zu groß (höchstens 8 MB).');
    const onError = vi.fn();
    const r = await uploadForDesign(file, { role: 'sticker' }, design, async () => Promise.reject(err), onError);
    expect(r).toBeNull();
    expect(onError).toHaveBeenCalledWith(err);
  });

  it('the logo button fills the template logo slot', async () => {
    const target = logoTarget(design);
    expect(target).toEqual({ replace: 'logo' });
    const upload = vi.fn(async () => asset);
    const r = await uploadForDesign(file, target, design, upload, () => undefined);
    expect(upload).toHaveBeenCalledWith('logo', file);
    const next = r!.change(design);
    const logo = next.layers.find((l) => l.id === 'logo');
    expect(logo).toMatchObject({ type: 'image', assetId: asset.sha });
    expect(design.layers.find((l) => l.id === 'logo')).toMatchObject({ assetId: LOGO_SLOT_ASSET });
  });

  it('a background upload replaces the background; a sticker becomes a new layer', async () => {
    const bg = await uploadForDesign(file, { role: 'background' }, design, async () => ({ ...asset, kind: 'background' }), () => undefined);
    expect(bg!.change(design).background).toEqual({ kind: 'image', assetId: asset.sha, fit: 'cover' });
    const st = await uploadForDesign(file, { role: 'sticker' }, design, async () => ({ ...asset, kind: 'sticker' }), () => undefined);
    const next = st!.change(design);
    expect(next.layers).toHaveLength(design.layers.length + 1);
    expect(next.layers.at(-1)).toMatchObject({ type: 'image', role: 'sticker', assetId: asset.sha });
  });
});

describe('conflict', () => {
  it('offers both choices', () => {
    const html = renderToStaticMarkup(createElement(ConflictDialog, { onKeepMine: () => undefined, onLoadTheirs: () => undefined }));
    expect(html).toContain('Auf einem anderen Gerät geändert');
    expect(html).toContain('Meine Version behalten');
    expect(html).toContain('Andere Version laden');
  });

  it('"Meine Version behalten" saves with the server revision', async () => {
    const server = { ...draft, revision: 11, design: TEMPLATES[0].design } as DraftWithDesign;
    const save = vi.fn().mockRejectedValueOnce(new CredentialsApiError(409, 'DRAFT_CONFLICT', 'geändert', server)).mockResolvedValue({ ...draft, revision: 12 });
    let conflict: DraftWithDesign | null = null;
    const saver = createAutosaver<string>({ save, revision: 2, onStatus: () => undefined, onSaved: () => undefined, onConflict: (c) => (conflict = c) });
    saver.change('mine');
    await saver.flush();
    expect(conflict).toEqual(server);
    await saver.keepMine(conflict!);
    expect(save).toHaveBeenLastCalledWith('mine', 11);
  });
});
