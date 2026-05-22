/**
 * Supabase Edge Function: generate-menu-image
 *
 * Generates a food photo for a menu_items row via Seedream 4.5 (kie.ai),
 * stores it in the `images` bucket and writes the public URL to
 * `menu_items.image_url`.
 *
 * v3 style — per-gastro brand, angle by food type, sharp, centered, no text.
 *
 * Auth: verify_jwt=false; protect with x-seed-token header matched against
 * SEED_TOKEN env. Optional x-kie-key header overrides KIE_API_KEY env.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const KIE_CREATE = 'https://api.kie.ai/api/v1/jobs/createTask';
const KIE_POLL = 'https://api.kie.ai/api/v1/jobs/recordInfo';
const SEEDREAM_MODEL = 'seedream/4.5-text-to-image';
const BUCKET = 'images';
const POLL_INTERVAL_MS = 2500;
const POLL_BUDGET_MS = 50_000;
const VERSION_TAG = 'v3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-seed-token, x-kie-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type GastroKey = 'mt' | 'delizia' | 'waage' | 'generic';
type StylePreset = 'dark_stoneware' | 'italian_gingham' | 'light_concrete' | 'wooden_board';

function gastroFor(restaurantName: string): GastroKey {
  const n = restaurantName.toLowerCase();
  if (n.includes('delizia')) return 'delizia';
  if (n.includes('müritz') || n.includes('mueritz')) return 'mt';
  if (n.includes('waage')) return 'waage';
  return 'generic';
}

function backgroundForPreset(p: StylePreset): string {
  switch (p) {
    case 'dark_stoneware':
      return 'served on an anthracite/black stoneware ceramic plate on top of a dark matte surface, clean even dark background, soft round shadow under the plate';
    case 'italian_gingham':
      return 'served on a white ceramic plate on top of a beige-and-white gingham checkered cotton tablecloth (small even squares, classic Italian trattoria), bright and clean';
    case 'light_concrete':
      return 'on a light grey concrete-textured flat surface (subtle stone texture, Uber-Eats catalog style), clean and bright, even neutral background';
    case 'wooden_board':
      return 'served on a warm oak wooden board with visible natural grain (rustic farm-to-table look), clean neutral surroundings, soft round shadow under the board';
  }
}

function backgroundFor(g: GastroKey): string {
  switch (g) {
    case 'mt':
      return backgroundForPreset('dark_stoneware');
    case 'delizia':
      return backgroundForPreset('italian_gingham');
    case 'waage':
      return backgroundForPreset('light_concrete');
    default:
      return 'on a clean flat neutral background';
  }
}

function isValidStylePreset(v: unknown): v is StylePreset {
  return (
    v === 'dark_stoneware' ||
    v === 'italian_gingham' ||
    v === 'light_concrete' ||
    v === 'wooden_board'
  );
}

function angleFor(itemName: string): 'overhead' | 'side' {
  const n = itemName.toLowerCase();
  if (
    n.includes('burger') ||
    n.includes('hamburger') ||
    n.includes('cheeseburger') ||
    n.includes('döner') ||
    n.includes('doner') ||
    n.includes('dürüm') ||
    n.includes('duerum') ||
    n.includes('dürum') ||
    n.includes('dönerbox') ||
    n.includes('hot dog') ||
    n.includes('wrap')
  ) {
    return 'side';
  }
  return 'overhead';
}

function vesselFor(g: GastroKey, itemName: string): string {
  const angle = angleFor(itemName);
  if (g === 'waage') {
    if (angle === 'side') {
      // döner / dürüm style — paper-wrap or small white plate, side 3/4 view
      return 'plated on a white ceramic plate, shot from a slight side 3/4 angle (eye-level)';
    }
    return 'plated centered, shot from directly overhead';
  }
  if (angle === 'side') {
    return 'plated on a white ceramic plate, shot from a slight side 3/4 angle (eye-level) so the layers and stack are visible';
  }
  return 'shot from directly overhead, food perfectly centered in the frame';
}

function buildPrompt(
  itemName: string,
  description: string | null,
  restaurantName: string,
  preset: StylePreset | null,
  hint?: string,
): string {
  const g = gastroFor(restaurantName);
  const bg = preset ? backgroundForPreset(preset) : backgroundFor(g);
  const vessel = vesselFor(g, itemName);
  const desc = description ? `: ${description}` : '';
  const tail = hint ? ` ${hint}` : '';
  return [
    `Studio-grade product food photography of ${itemName}${desc}.`,
    `${vessel}, ${bg}.`,
    'The subject is perfectly centered in the frame with even margins on all sides.',
    'Entire image is in perfect sharp focus — every element crisp and clean, no depth-of-field blur, no bokeh.',
    'Bright, even, soft natural lighting. Vibrant natural colors. Magazine/advertising quality. Ultra clean composition.',
    'No people, no hands, no cutlery, no menu cards, no packaging branding.',
    'ABSOLUTELY NO text, no letters, no numbers, no signage, no captions, no logos, no watermarks anywhere in the image.',
    tail,
  ].join(' ').trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });

  const expectedToken = Deno.env.get('SEED_TOKEN');
  const providedToken = req.headers.get('x-seed-token');
  if (!expectedToken || providedToken !== expectedToken) {
    return json(401, { ok: false, code: 'UNAUTHORIZED' });
  }

  let body: {
    menu_item_id?: string;
    dry_run?: boolean;
    prompt_hint?: string;
    quality?: 'basic' | 'high';
    style_preset?: string;
  };
  try { body = await req.json(); } catch { return json(400, { ok: false, code: 'BAD_JSON' }); }
  if (!body.menu_item_id) return json(400, { ok: false, code: 'MISSING_MENU_ITEM_ID' });
  if (body.style_preset !== undefined && !isValidStylePreset(body.style_preset)) {
    return json(400, { ok: false, code: 'INVALID_STYLE_PRESET' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: item, error: itemErr } = await supabase
    .from('menu_items')
    .select('id, name, description, restaurant_id')
    .eq('id', body.menu_item_id)
    .single();
  if (itemErr || !item) return json(404, { ok: false, code: 'ITEM_NOT_FOUND' });

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, name, ai_image_style')
    .eq('id', item.restaurant_id)
    .single();
  // Resolution order: explicit body param > restaurants.ai_image_style > gastroFor() fallback.
  const presetFromBody = isValidStylePreset(body.style_preset) ? body.style_preset : null;
  const presetFromRow = isValidStylePreset(restaurant?.ai_image_style) ? restaurant.ai_image_style : null;
  const resolvedPreset: StylePreset | null = presetFromBody ?? presetFromRow;
  const prompt = buildPrompt(item.name, item.description, restaurant?.name ?? '', resolvedPreset, body.prompt_hint);

  if (body.dry_run) return json(200, { ok: true, prompt, dry_run: true });

  const kieKey = req.headers.get('x-kie-key') ?? Deno.env.get('KIE_API_KEY');
  if (!kieKey) return json(500, { ok: false, code: 'NO_KIE_KEY' });

  const createResp = await fetch(KIE_CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${kieKey}` },
    body: JSON.stringify({
      model: SEEDREAM_MODEL,
      input: { prompt, aspect_ratio: '16:9', quality: body.quality ?? 'basic' },
    }),
  });
  if (!createResp.ok) {
    const txt = await createResp.text();
    return json(502, { ok: false, code: 'KIE_CREATE_ERROR', error: txt.slice(0, 500) });
  }
  const createJson = (await createResp.json()) as { data?: { taskId?: string } };
  const taskId = createJson?.data?.taskId;
  if (!taskId) return json(502, { ok: false, code: 'KIE_NO_TASK_ID', error: JSON.stringify(createJson).slice(0, 500) });

  const started = Date.now();
  let imageUrl: string | null = null;
  let failMsg: string | null = null;
  while (Date.now() - started < POLL_BUDGET_MS) {
    await sleep(POLL_INTERVAL_MS);
    const pollResp = await fetch(`${KIE_POLL}?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${kieKey}` },
    });
    if (!pollResp.ok) continue;
    const pollJson = (await pollResp.json()) as { data?: { state?: string; resultJson?: string; failMsg?: string } };
    const state = pollJson?.data?.state;
    if (state === 'success') {
      try {
        const parsed = JSON.parse(pollJson.data?.resultJson ?? '{}') as { resultUrls?: string[] };
        imageUrl = parsed.resultUrls?.[0] ?? null;
      } catch {}
      break;
    }
    if (state === 'fail') {
      failMsg = pollJson?.data?.failMsg ?? 'unknown failure';
      break;
    }
  }
  if (failMsg) return json(502, { ok: false, code: 'KIE_FAIL', error: failMsg, task_id: taskId });
  if (!imageUrl) return json(202, { ok: false, code: 'TIMEOUT', task_id: taskId, prompt });

  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) return json(502, { ok: false, code: 'IMAGE_DOWNLOAD_FAILED' });
  const imgBytes = new Uint8Array(await imgResp.arrayBuffer());
  const contentType = imgResp.headers.get('content-type') ?? 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : 'jpg';

  // Timestamped path so each regeneration writes a fresh object — bypasses the
  // bucket's no-update RLS for anon callers and cache-busts the image URL.
  const objectPath = `menu-items/${item.restaurant_id}/${item.id}_${VERSION_TAG}_${Date.now()}.${ext}`;
  const uploadRes = await supabase.storage.from(BUCKET).upload(objectPath, imgBytes, { contentType, upsert: true });
  if (uploadRes.error) return json(500, { ok: false, code: 'UPLOAD_FAILED', error: uploadRes.error.message });
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  const publicUrl = pub.publicUrl;

  const { error: updErr } = await supabase.from('menu_items').update({ image_url: publicUrl }).eq('id', item.id);
  if (updErr) return json(500, { ok: false, code: 'DB_UPDATE_FAILED', error: updErr.message });

  return json(200, { ok: true, image_url: publicUrl, prompt, task_id: taskId });
});
