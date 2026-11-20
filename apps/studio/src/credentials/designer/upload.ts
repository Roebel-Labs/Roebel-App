// Placing an uploaded image: a new logo, sticker or image layer, the background, or a replacement
// for an existing image layer (the template's logo slot). A rejected upload changes nothing.
import { LOGO_SLOT_ASSET, addLayer, updateLayer, type CardDesign } from '@roebel/card-design';
import type { AssetKind, AssetView } from '../types';
import { imageLayer } from './layers';

export type UploadTarget = { role: 'logo' | 'sticker' | 'image' } | { role: 'background' } | { replace: string };

export function assetKindFor(target: UploadTarget, d: CardDesign): AssetKind {
  if ('replace' in target) {
    const l = d.layers.find((x) => x.id === target.replace);
    return l?.type === 'image' && (l.role === 'logo' || l.assetId === LOGO_SLOT_ASSET) ? 'logo' : l?.type === 'image' && l.role === 'sticker' ? 'sticker' : 'image';
  }
  return target.role;
}

/** The change an uploaded asset makes to a design. */
export function placeAsset(target: UploadTarget, asset: AssetView): (d: CardDesign) => CardDesign {
  if ('replace' in target) return (d) => updateLayer(d, target.replace, { assetId: asset.sha });
  if (target.role === 'background') return (d) => ({ ...d, background: { kind: 'image', assetId: asset.sha, fit: 'cover' } });
  const role = target.role;
  return (d) => addLayer(d, imageLayer(d, asset.sha, role, asset));
}

/** For the logo button: fill the template's empty logo slot when there is one. */
export function logoTarget(d: CardDesign): UploadTarget {
  const slot = d.layers.find((l) => l.type === 'image' && l.assetId === LOGO_SLOT_ASSET);
  return slot ? { replace: slot.id } : { role: 'logo' };
}

/**
 * Uploads `file` and returns the design change, or null after reporting the error (server message:
 * too large, wrong format, unreadable). The editor stays as it was.
 */
export async function uploadForDesign(
  file: File,
  target: UploadTarget,
  d: CardDesign,
  upload: (kind: AssetKind, file: File) => Promise<AssetView>,
  onError: (e: unknown) => void,
): Promise<{ change: (d: CardDesign) => CardDesign; asset: AssetView } | null> {
  try {
    const asset = await upload(assetKindFor(target, d), file);
    return { change: placeAsset(target, asset), asset };
  } catch (e) {
    onError(e);
    return null;
  }
}
