/**
 * Supabase Edge Function: generate-menu-image
 *
 * Generates a food photo for a menu_items row using Seedream 4.5 via the
 * Volcengine Ark API, stores it in the `images` bucket at
 * `menu-items/<restaurant_id>/<menu_item_id>.png`, and writes the public
 * URL to `menu_items.image_url`.
 *
 * Auth model
 * ----------
 * Deployed with `verify_jwt=false` because the Expo client signs in via
 * thirdweb (no Supabase JWT). We protect the function with a shared
 * secret header `x-seed-token` matched against `SEED_TOKEN` env. For
 * easy local testing we ALSO accept `x-ark-key` to override the server-
 * side `ARK_API_KEY` env. Never expose either header value in the
 * mobile client.
 *
 * Required secrets (set via Supabase dashboard → Edge Functions → Secrets):
 *   - ARK_API_KEY   Volcengine Ark API key (starts with `ark-...`)
 *   - SEED_TOKEN    Any random string; required as `x-seed-token` header
 *
 * Request body:
 *   { menu_item_id: string, dry_run?: boolean, prompt_hint?: string }
 *
 * Response:
 *   { ok: true, image_url, prompt }       // success
 *   { ok: true, prompt, dry_run: true }   // dry_run only
 *   { ok: false, code, error }            // failure
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const SEEDREAM_MODEL = 'doubao-seedream-4-5-251128';
const BUCKET = 'images';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-seed-token, x-ark-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function cuisineFromName(restaurantName: string): string {
  const n = restaurantName.toLowerCase();
  if (n.includes('delizia')) return 'Italian trattoria';
  if (n.includes('müritz') || n.includes('mueritz')) return 'modern German Mecklenburg-style';
  if (n.includes('waage')) return 'classic German bistro';
  return 'modern European';
}

function buildPrompt(itemName: string, description: string | null, cuisine: string, hint?: string): string {
  const desc = description ? `: ${description}` : '';
  const tail = hint ? ` ${hint}` : '';
  return `Professional overhead food photography of ${itemName}${desc}. ${cuisine} restaurant plating, rustic table, warm natural lighting, shallow depth of field, vibrant colors, hyper-detailed, no text, no watermark, no logo.${tail}`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });

  const expectedToken = Deno.env.get('SEED_TOKEN');
  const providedToken = req.headers.get('x-seed-token');
  if (!expectedToken || providedToken !== expectedToken) {
    return json(401, { ok: false, code: 'UNAUTHORIZED' });
  }

  let body: { menu_item_id?: string; dry_run?: boolean; prompt_hint?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: 'BAD_JSON' });
  }
  if (!body.menu_item_id) return json(400, { ok: false, code: 'MISSING_MENU_ITEM_ID' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Load item + restaurant + account for cuisine context.
  const { data: item, error: itemErr } = await supabase
    .from('menu_items')
    .select('id, name, description, restaurant_id')
    .eq('id', body.menu_item_id)
    .single();
  if (itemErr || !item) return json(404, { ok: false, code: 'ITEM_NOT_FOUND' });

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, name, account_id')
    .eq('id', item.restaurant_id)
    .single();
  const cuisine = cuisineFromName(restaurant?.name ?? '');
  const prompt = buildPrompt(item.name, item.description, cuisine, body.prompt_hint);

  if (body.dry_run) return json(200, { ok: true, prompt, dry_run: true });

  const arkKey = req.headers.get('x-ark-key') ?? Deno.env.get('ARK_API_KEY');
  if (!arkKey) return json(500, { ok: false, code: 'NO_ARK_KEY' });

  // 1. Call Seedream.
  const seedResp = await fetch(ARK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${arkKey}`,
    },
    body: JSON.stringify({
      model: SEEDREAM_MODEL,
      prompt,
      size: '1024x1024',
      n: 1,
      response_format: 'url',
    }),
  });
  if (!seedResp.ok) {
    const text = await seedResp.text();
    return json(502, { ok: false, code: 'SEEDREAM_ERROR', error: text.slice(0, 500) });
  }
  const seedJson = (await seedResp.json()) as { data?: Array<{ url?: string }> };
  const sourceUrl = seedJson?.data?.[0]?.url;
  if (!sourceUrl) return json(502, { ok: false, code: 'SEEDREAM_NO_URL' });

  // 2. Download the generated image.
  const imgResp = await fetch(sourceUrl);
  if (!imgResp.ok) return json(502, { ok: false, code: 'IMAGE_DOWNLOAD_FAILED' });
  const imgBytes = new Uint8Array(await imgResp.arrayBuffer());
  const contentType = imgResp.headers.get('content-type') ?? 'image/png';
  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';

  // 3. Upload to Supabase Storage.
  const objectPath = `menu-items/${item.restaurant_id}/${item.id}.${ext}`;
  const uploadRes = await supabase.storage.from(BUCKET).upload(objectPath, imgBytes, {
    contentType,
    upsert: true,
  });
  if (uploadRes.error) return json(500, { ok: false, code: 'UPLOAD_FAILED', error: uploadRes.error.message });
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  const publicUrl = pub.publicUrl;

  // 4. Write image_url back to the row.
  const { error: updErr } = await supabase
    .from('menu_items')
    .update({ image_url: publicUrl })
    .eq('id', item.id);
  if (updErr) return json(500, { ok: false, code: 'DB_UPDATE_FAILED', error: updErr.message });

  return json(200, { ok: true, image_url: publicUrl, prompt });
});
