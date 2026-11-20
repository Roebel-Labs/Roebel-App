// Strict, never-throwing validation of untrusted design JSON. The result is a fresh
// object built only from known keys, so unknown keys are dropped by construction.
import {
  FIELD_IDS, FONT_IDS, PRESET_IDS, designSize,
  type Background, type CardDesign, type DesignFormat, type Layer, type LayerBase, type TextStyle,
} from './schema';

export const MAX_LAYERS = 40;
export const MAX_TEXT = 120;
const COLOR_RE = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const LAYER_ID_RE = /^[a-z0-9-]{1,32}$/;
const ASSET_HASH_RE = /^[0-9a-f]{64}$/;
const ASSET_BUILTIN_RE = /^builtin:[a-z0-9-]{1,48}$/;

export type ValidateResult = { ok: true; design: CardDesign } | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export function isAssetId(v: unknown): v is string {
  return typeof v === 'string' && (ASSET_HASH_RE.test(v) || ASSET_BUILTIN_RE.test(v));
}

class Checker {
  errors: string[] = [];
  fail(path: string, msg: string): undefined {
    if (this.errors.length < 50) this.errors.push(`${path}: ${msg}`);
    return undefined;
  }
  num(o: Obj, key: string, path: string, min: number, max: number, opts: { minExclusive?: boolean } = {}): number {
    const v = o[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return this.fail(`${path}.${key}`, 'must be a finite number') ?? 0;
    if ((opts.minExclusive ? v <= min : v < min) || v > max) {
      return this.fail(`${path}.${key}`, `must be in ${opts.minExclusive ? '(' : '['}${min}, ${max}]`) ?? 0;
    }
    return v;
  }
  bool(o: Obj, key: string, path: string): boolean {
    const v = o[key];
    if (typeof v !== 'boolean') return this.fail(`${path}.${key}`, 'must be a boolean') ?? false;
    return v;
  }
  oneOf<T extends string>(o: Obj, key: string, path: string, allowed: readonly T[]): T {
    const v = o[key];
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
      return (this.fail(`${path}.${key}`, `must be one of ${allowed.join(', ')}`) ?? allowed[0]) as T;
    }
    return v as T;
  }
  color(o: Obj, key: string, path: string): string {
    const v = o[key];
    if (typeof v !== 'string' || !COLOR_RE.test(v)) return this.fail(`${path}.${key}`, 'must be a #rrggbb or #rrggbbaa colour') ?? '#000000';
    return v;
  }
  text(o: Obj, key: string, path: string): string {
    const v = o[key];
    if (typeof v !== 'string') return this.fail(`${path}.${key}`, 'must be a string') ?? '';
    if (v.length > MAX_TEXT) return this.fail(`${path}.${key}`, `must be at most ${MAX_TEXT} characters`) ?? '';
    return v;
  }
  asset(o: Obj, key: string, path: string): string {
    const v = o[key];
    if (!isAssetId(v)) return this.fail(`${path}.${key}`, 'must be a sha256 hex id or builtin:<name>') ?? '';
    return v;
  }
}

function background(c: Checker, v: unknown): Background | undefined {
  if (!isObj(v)) return c.fail('background', 'must be an object');
  if (v.kind === 'preset') {
    const bg: Background = { kind: 'preset', preset: c.oneOf(v, 'preset', 'background', PRESET_IDS) };
    if (v.color !== undefined) bg.color = c.color(v, 'color', 'background');
    return bg;
  }
  if (v.kind === 'image') {
    return { kind: 'image', assetId: c.asset(v, 'assetId', 'background'), fit: c.oneOf(v, 'fit', 'background', ['cover', 'tile'] as const) };
  }
  return c.fail('background.kind', 'must be preset or image');
}

function textStyle(c: Checker, o: Obj, path: string): TextStyle {
  return {
    font: c.oneOf(o, 'font', path, FONT_IDS),
    size: c.num(o, 'size', path, 6, 200),
    color: c.color(o, 'color', path),
    align: c.oneOf(o, 'align', path, ['left', 'center', 'right'] as const),
    uppercase: c.bool(o, 'uppercase', path),
    letterSpacing: c.num(o, 'letterSpacing', path, -0.2, 1),
  };
}

function layer(c: Checker, v: unknown, path: string, W: number): Layer | undefined {
  if (!isObj(v)) return c.fail(path, 'must be an object');
  const id = v.id;
  if (typeof id !== 'string' || !LAYER_ID_RE.test(id)) c.fail(`${path}.id`, 'must match ^[a-z0-9-]{1,32}$');
  const base: LayerBase = {
    id: typeof id === 'string' ? id : '',
    x: c.num(v, 'x', path, -W, 2 * W),
    y: c.num(v, 'y', path, -W, 2 * W),
    w: c.num(v, 'w', path, 0, 2 * W, { minExclusive: true }),
    h: c.num(v, 'h', path, 0, 2 * W, { minExclusive: true }),
    rotation: c.num(v, 'rotation', path, -360, 360),
    opacity: c.num(v, 'opacity', path, 0, 1),
    shine: c.bool(v, 'shine', path),
  };
  if (v.ai !== undefined) base.ai = c.bool(v, 'ai', path);
  switch (v.type) {
    case 'text':
      return { ...base, type: 'text', text: c.text(v, 'text', path), ...textStyle(c, v, path) };
    case 'field':
      return {
        ...base, type: 'field', field: c.oneOf(v, 'field', path, FIELD_IDS),
        sampleText: c.text(v, 'sampleText', path), ...textStyle(c, v, path),
      };
    case 'image':
      return { ...base, type: 'image', assetId: c.asset(v, 'assetId', path), role: c.oneOf(v, 'role', path, ['logo', 'sticker', 'image'] as const) };
    default:
      return c.fail(`${path}.type`, 'must be text, field or image');
  }
}

export function validateDesign(input: unknown): ValidateResult {
  const c = new Checker();
  if (!isObj(input)) return { ok: false, errors: ['design: must be an object'] };
  if (input.schema !== 1) return { ok: false, errors: [`schema: unsupported schema ${JSON.stringify(input.schema) ?? 'undefined'}, expected 1`] };
  const format = c.oneOf(input, 'format', 'design', ['card', 'stamp'] as const) as DesignFormat;
  const W = designSize(format).w;

  const bg = background(c, input.background);
  let shine = { enabled: false, intensity: 0 };
  if (!isObj(input.shine)) c.fail('shine', 'must be an object');
  else shine = { enabled: c.bool(input.shine, 'enabled', 'shine'), intensity: c.num(input.shine, 'intensity', 'shine', 0, 1) };

  let border: CardDesign['border'];
  if (input.border !== undefined) {
    if (!isObj(input.border)) c.fail('border', 'must be an object');
    else border = { color: c.color(input.border, 'color', 'border'), width: c.num(input.border, 'width', 'border', 0, 40) };
  }

  const layers: Layer[] = [];
  if (!Array.isArray(input.layers)) c.fail('layers', 'must be an array');
  else if (input.layers.length > MAX_LAYERS) c.fail('layers', `at most ${MAX_LAYERS} layers`);
  else {
    const seen = new Set<string>();
    input.layers.forEach((raw, i) => {
      const l = layer(c, raw, `layers[${i}]`, W);
      if (!l) return;
      if (seen.has(l.id)) c.fail(`layers[${i}].id`, `duplicate id ${l.id}`);
      seen.add(l.id);
      layers.push(l);
    });
  }

  if (c.errors.length > 0 || !bg) return { ok: false, errors: c.errors.length ? c.errors : ['background: invalid'] };
  const design: CardDesign = { schema: 1, format, background: bg, shine, layers };
  if (border) design.border = border;
  return { ok: true, design };
}
