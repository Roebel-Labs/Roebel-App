// AI help in the designer (plan D5): a short description becomes a card background or a sticker.
// The server generates, marks and stores the image; here its suggestion is applied to the design.
// A refused or failed request (limit, time, network) changes nothing and reports the error.
import { addLayer, newLayerId, type Background, type CardDesign, type Layer } from '@roebel/card-design';
import type { AssetView } from '../types';

export type AiKind = 'background' | 'sticker';
export type AiBackgroundResult = { asset: AssetView; background: Background };
export type AiStickerResult = { asset: AssetView; layer: Layer; notice?: string };

export const AI_PROMPT_MIN = 3;
export const AI_PROMPT_MAX = 300;

export const promptReady = (prompt: string) => {
  const n = prompt.trim().length;
  return n >= AI_PROMPT_MIN && n <= AI_PROMPT_MAX;
};

/** The change a generated background makes: it replaces the design's background. */
export const placeAiBackground = (r: AiBackgroundResult) => (d: CardDesign): CardDesign => ({ ...d, background: r.background });

/** The change a generated sticker makes: a new top layer, marked `ai`. */
export const placeAiSticker = (r: AiStickerResult) => (d: CardDesign): CardDesign =>
  addLayer(d, { ...r.layer, id: newLayerId(d), ai: true });

export async function generateForDesign(
  kind: AiKind,
  prompt: string,
  calls: { background: (prompt: string) => Promise<AiBackgroundResult>; sticker: (prompt: string) => Promise<AiStickerResult> },
  onError: (e: unknown) => void,
): Promise<{ change: (d: CardDesign) => CardDesign; asset: AssetView; notice?: string } | null> {
  try {
    if (kind === 'background') {
      const r = await calls.background(prompt.trim());
      return { change: placeAiBackground(r), asset: r.asset };
    }
    const r = await calls.sticker(prompt.trim());
    return { change: placeAiSticker(r), asset: r.asset, notice: r.notice };
  } catch (e) {
    onError(e);
    return null;
  }
}
