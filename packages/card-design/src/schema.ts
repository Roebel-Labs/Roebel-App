// The card design document: one versioned JSON description of a card (or a round
// stamp) that every renderer draws the same way. Coordinates are card units.

export const CARD_W = 924, CARD_H = 580, STAMP_SIZE = 580, CARD_RADIUS = 48;

export type DesignFormat = 'card' | 'stamp';
export type PresetId = 'silver' | 'navy' | 'gold' | 'black' | 'paper' | 'holo' | 'matte' | 'glass';
export type FontId = 'mona' | 'mona-bold' | 'mona-condensed' | 'barlow' | 'barlow-black' | 'playfair' | 'grotesk';
export type FieldId = 'holderName' | 'validUntil' | 'memberSince';

export const PRESET_IDS: readonly PresetId[] = ['silver', 'navy', 'gold', 'black', 'paper', 'holo', 'matte', 'glass'];
export const FONT_IDS: readonly FontId[] = ['mona', 'mona-bold', 'mona-condensed', 'barlow', 'barlow-black', 'playfair', 'grotesk'];
export const FIELD_IDS: readonly FieldId[] = ['holderName', 'validUntil', 'memberSince'];

export type Background =
  | { kind: 'preset'; preset: PresetId; color?: string } // color tints matte/navy
  | { kind: 'image'; assetId: string; fit: 'cover' | 'tile' };

export interface LayerBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  shine: boolean;
  ai?: boolean;
}

export type TextStyle = {
  font: FontId;
  size: number;
  color: string;
  align: 'left' | 'center' | 'right';
  uppercase: boolean;
  letterSpacing: number;
};

export type TextLayer = LayerBase & { type: 'text'; text: string } & TextStyle;
export type FieldLayer = LayerBase & { type: 'field'; field: FieldId; sampleText: string } & TextStyle;
export type ImageLayer = LayerBase & { type: 'image'; assetId: string; role: 'logo' | 'sticker' | 'image' };
export type Layer = TextLayer | FieldLayer | ImageLayer;

export interface CardDesign {
  schema: 1;
  format: DesignFormat;
  background: Background;
  shine: { enabled: boolean; intensity: number };
  border?: { color: string; width: number };
  layers: Layer[];
}

/** Width and height of the design surface in card units. */
export function designSize(format: DesignFormat): { w: number; h: number } {
  return format === 'stamp' ? { w: STAMP_SIZE, h: STAMP_SIZE } : { w: CARD_W, h: CARD_H };
}
