/**
 * Supabase Edge Function: special-menu-image-job
 *
 * Background photo generation for Mittagstisch dishes. Called by the
 * trg_queue_special_menu_item_image trigger (supabase/migrations/
 * 20261027_mittagstisch_dish_images.sql) whenever a special_menu_items row is
 * saved without a photo — the weekly menu is entered by an agent through the
 * web admin, so nobody presses "generate".
 *
 * Claims the pending row in special_menu_image_jobs (that row is the
 * authorization: the trigger is the only writer), then calls
 * generate-menu-image with the SEED_TOKEN from the shared edge env. The
 * German dish name + description go into the prompt as written.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY    - injected by Supabase
 *   SEED_TOKEN                                 - shared with generate-menu-image
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const MAX_ATTEMPTS = 3;

// The menu text is German ("u." = "und"); without this the model sometimes
// drops a side or guesses a non-German take on the dish.
const GERMAN_DISH_HINT =
  'The dish name and description are German menu text. Show exactly that dish with every component it names (main, sides, sauce), as a German restaurant serves it for lunch, one generous portion.';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function processJob(db: SupabaseClient, itemId: string) {
  const setJob = (patch: Record<string, unknown>) =>
    db
      .from('special_menu_image_jobs')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('special_menu_item_id', itemId);

  try {
    // A photo may have been uploaded by hand in the meantime — that one wins.
    const { data: item } = await db
      .from('special_menu_items')
      .select('id, image_url')
      .eq('id', itemId)
      .maybeSingle();
    if (!item || item.image_url) {
      await setJob({ status: 'skipped', error: null });
      return;
    }

    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-menu-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-seed-token': Deno.env.get('SEED_TOKEN') ?? '' },
      body: JSON.stringify({ special_menu_item_id: itemId, prompt_hint: GERMAN_DISH_HINT }),
    });
    const out = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string };
    if (!res.ok || !out.ok) {
      throw new Error(`generate-menu-image ${res.status} ${out.code ?? ''} ${out.error ?? ''}`.trim());
    }
    await setJob({ status: 'done', error: null });
  } catch (e) {
    console.error('[special-menu-image-job] failed', itemId, e);
    await setJob({ status: 'failed', error: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500) });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const body = await req.json().catch(() => ({}));
  const itemId = typeof body?.special_menu_item_id === 'string' ? body.special_menu_item_id : '';
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return json(400, { error: 'invalid_item_id' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // Atomic claim: only a pending job under the attempt cap runs, and only once.
  const { data: job } = await db
    .from('special_menu_image_jobs')
    .select('attempts')
    .eq('special_menu_item_id', itemId)
    .eq('status', 'pending')
    .maybeSingle();
  if (!job || job.attempts >= MAX_ATTEMPTS) return json(200, { accepted: false });
  const { data: claimed } = await db
    .from('special_menu_image_jobs')
    .update({ status: 'running', attempts: job.attempts + 1, updated_at: new Date().toISOString() })
    .eq('special_menu_item_id', itemId)
    .eq('status', 'pending')
    .eq('attempts', job.attempts)
    .select('special_menu_item_id');
  if (!claimed?.length) return json(200, { accepted: false });

  EdgeRuntime.waitUntil(processJob(db, itemId));
  return json(202, { accepted: true });
});
