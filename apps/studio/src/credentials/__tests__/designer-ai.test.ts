import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TEMPLATES, type Layer } from '@roebel/card-design';
import { CredentialsApiError } from '../api';
import { generateForDesign, promptReady, type AiBackgroundResult, type AiStickerResult } from '../designer/ai';
import { AiBox } from '../designer/AddPanel';
import type { AssetView } from '../types';

const design = TEMPLATES.find((x) => x.id === 'schwarz')!.design;
const asset = (kind: AssetView['kind']): AssetView => ({ sha: 'c'.repeat(64), kind, url: 'https://x/c', width: 1024, height: 576, ai: true });
const sticker: Layer = { id: 'ai-sticker', type: 'image', role: 'sticker', assetId: 'c'.repeat(64), x: 323, y: 151, w: 277, h: 277, rotation: 0, opacity: 1, shine: false, ai: true };
const never = () => Promise.reject(new Error('not called'));

describe('AI help', () => {
  it('a generated background replaces design.background', async () => {
    const bg: AiBackgroundResult = { asset: asset('background'), background: { kind: 'image', assetId: 'c'.repeat(64), fit: 'cover' } };
    const r = await generateForDesign('background', ' Müritz ', { background: async (p) => (expect(p).toBe('Müritz'), bg), sticker: never }, vi.fn());
    const next = r!.change(design);
    expect(next.background).toEqual(bg.background);
    expect(next.layers).toEqual(design.layers);
  });

  it('a sticker becomes a new top layer with ai: true and a fresh id', async () => {
    const withClash = { ...design, layers: [...design.layers, { ...sticker, ai: false }] };
    const res: AiStickerResult = { asset: asset('sticker'), layer: sticker, notice: 'Hintergrund konnte nicht entfernt werden.' };
    const r = await generateForDesign('sticker', 'Windmühle', { background: never, sticker: async () => res }, vi.fn());
    const next = r!.change(withClash);
    const top = next.layers[next.layers.length - 1];
    expect(next.layers.length).toBe(withClash.layers.length + 1);
    expect(top.ai).toBe(true);
    expect(top.type === 'image' && top.role).toBe('sticker');
    expect(new Set(next.layers.map((l) => l.id)).size).toBe(next.layers.length);
    expect(r!.notice).toBe('Hintergrund konnte nicht entfernt werden.');
  });

  it('the 429 limit text goes to onError and the design stays as it was', async () => {
    const err = new CredentialsApiError(429, 'AI_LIMIT', 'Für heute sind alle KI-Bilder eurer Organisation verbraucht. Morgen geht es weiter.');
    const onError = vi.fn();
    const r = await generateForDesign('background', 'Müritz', { background: () => Promise.reject(err), sticker: never }, onError);
    expect(r).toBeNull();
    expect(onError).toHaveBeenCalledWith(err);
  });

  it('needs 3 to 300 characters; the box shows the progress line while running', () => {
    expect(promptReady('ab')).toBe(false);
    expect(promptReady('Müritz')).toBe(true);
    expect(promptReady('x'.repeat(301))).toBe(false);
    const html = renderToStaticMarkup(createElement(AiBox, { kind: 'sticker', running: true, notice: null, onGenerate: () => undefined }));
    expect(html).toContain('Beschreibe das Bild');
    expect(html).toContain('Wird erzeugt … (bis zu einer Minute)');
  });
});
