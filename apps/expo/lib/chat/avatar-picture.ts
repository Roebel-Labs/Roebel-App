// The picture rule for every bot avatar. Pure: no React, no native modules.
//
// A bot always shows a picture, never a drawn shape:
//   1. avatar.imageUrl (own upload or house artwork for presets),
//   2. else the illustrated character's tile,
//   3. else, for Mecky, Mecky's tile,
//   4. else the bot's initial letter on a rounded tile in avatar.color.
// The initial tile is also what shows while a picture loads or when it fails.
import type { BotAvatarSpec } from './types';
import { AGENT_SITE_ORIGIN, characterArt, characterById } from './characters';

/** Mecky's 512 px avatar tile. */
export const MECKY_TILE_URL = `${AGENT_SITE_ORIGIN}/agents/mecky/tile.webp`;

/** A spec that shows Mecky's picture: fallback for screens that have no bot at hand. */
export const MECKY_AVATAR_SPEC: BotAvatarSpec = { shape: 'circle', color: '#00498B', eyes: 'dots', imageUrl: MECKY_TILE_URL };

/** Colour of the initial tile when the spec has none (or an invalid one). */
export const FALLBACK_TILE_COLOR = '#00498B';

export function isMeckyName(name: string | null | undefined): boolean {
  return typeof name === 'string' && name.trim().toLowerCase() === 'mecky';
}

function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\/\S+$/i.test(value) && value.length <= 500;
}

/** Remote picture for a bot, or null when it shows the initial tile. */
export function botPictureUrl(
  spec: Pick<BotAvatarSpec, 'imageUrl' | 'character'> | null | undefined,
  name?: string | null,
): string | null {
  if (spec && isHttpsUrl(spec.imageUrl)) return spec.imageUrl;
  const character = characterById(spec?.character);
  if (character) return characterArt(character.id).tile;
  if (isMeckyName(name)) return MECKY_TILE_URL;
  return null;
}

/** The two animated loops each house character (and Mecky) has on the website. */
export type MascotAnimation = 'idle' | 'writing';

const HOUSE_ART = /^https:\/\/(?:www\.)?roebel\.app\/agents\/([a-z0-9-]+)\/tile\.webp$/i;

/**
 * Animated loop for a bot, or null when it has none (own uploads and initial tiles stay still). House artwork
 * carried by preset bots counts as its character; Mecky by name.
 */
export function botAnimationUrl(
  spec: Pick<BotAvatarSpec, 'imageUrl' | 'character'> | null | undefined,
  name: string | null | undefined,
  kind: MascotAnimation,
): string | null {
  let id: string | null = null;
  if (spec && isHttpsUrl(spec.imageUrl)) {
    const m = HOUSE_ART.exec(spec.imageUrl);
    const house = m?.[1].toLowerCase();
    if (house && (house === 'mecky' || characterById(house))) id = house;
    else return null;
  } else {
    id = characterById(spec?.character)?.id ?? (isMeckyName(name) ? 'mecky' : null);
  }
  return id ? `${AGENT_SITE_ORIGIN}/agents/${id}/${kind}.webp` : null;
}

/** Mecky's animated loops, for screens that show Mecky without a bot spec (comments, tips, posts). */
export function meckyAnimationUrl(kind: MascotAnimation): string {
  return `${AGENT_SITE_ORIGIN}/agents/mecky/${kind}.webp`;
}

/** First letter of the name, upper-cased ("" when there is none). Skips leading symbols and spaces. */
export function botInitial(name: string | null | undefined): string {
  if (typeof name !== 'string') return '';
  const match = name.trim().match(/[\p{L}\p{N}]/u);
  return match ? match[0].toLocaleUpperCase('de-DE') : '';
}

/** Background of the initial tile: the character's colour, else the spec's colour, else navy. */
export function botTileColor(spec: Pick<BotAvatarSpec, 'color' | 'character'> | null | undefined): string {
  const character = characterById(spec?.character);
  if (character) return character.color;
  const color = spec?.color;
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : FALLBACK_TILE_COLOR;
}

/** Letter colour that reads on `background` (#RRGGBB): dark on light tiles, white on dark ones. */
export function initialTextColor(background: string): string {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(background);
  if (!m) return '#FFFFFF';
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? '#1C1C1E' : '#FFFFFF';
}

/** Edge of an uploaded agent picture (square JPEG). */
export const AGENT_PICTURE_SIZE = 512;

/**
 * Centre square of a width × height image, or null when it already is square (or the size is unknown).
 * The picker crops to 1:1 itself on most devices; this covers the ones that ignore `aspect`.
 */
export function centerSquareCrop(
  width: number,
  height: number,
): { originX: number; originY: number; width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const w = Math.round(width);
  const h = Math.round(height);
  if (Math.abs(w - h) <= 1) return null;
  const side = Math.min(w, h);
  return { originX: Math.floor((w - side) / 2), originY: Math.floor((h - side) / 2), width: side, height: side };
}
