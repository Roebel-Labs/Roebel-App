/**
 * Supabase Edge Function: moderate-post
 *
 * Runs background Claude content moderation on a freshly created post and
 * updates `posts.moderation_status` (and `posts.status='flagged'` if necessary).
 *
 * Called fire-and-forget from `createPost()` in apps/expo/lib/supabase-posts.ts
 * after a non-citizen post lands. Idempotent: skips work if the post already
 * has a non-pending moderation_status.
 *
 * Env:
 *   ANTHROPIC_API_KEY         - required
 *   SUPABASE_URL              - injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY - injected by Supabase
 *
 * Auth: verify_jwt=true. The expo client invokes with the anon key, which is
 * sufficient — abuse is bounded because the function only touches the single
 * post by id, won't re-process moderated posts, and never returns content.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

type ModerationLabel =
  | 'clean'
  | 'hate'
  | 'sexual'
  | 'harassment'
  | 'spam_ad'
  | 'off_topic'
  | 'other_bad';

const FLAGGED_LABELS: ReadonlySet<ModerationLabel> = new Set([
  'hate',
  'sexual',
  'harassment',
  'spam_ad',
  'other_bad',
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const SYSTEM_PROMPT = `Du bist ein Moderations-Assistent für die Röbel/Müritz Community-App.

Bewerte den vom Nutzer eingereichten Beitrag (Text + ggf. Bilder) und gib EINE
einzige Klassifikation zurück. Antworte ausschließlich mit einem JSON-Objekt
im Format:

{"label": "<eine der Labels>", "reason": "<kurze deutsche Begründung, max 80 Zeichen>"}

Mögliche labels:
- "clean"      : harmloser, themenpassender Beitrag aus oder über Röbel/Müritz
- "hate"       : Hass, Rassismus, Beleidigungen gegen Gruppen
- "sexual"     : sexueller / pornografischer Inhalt
- "harassment" : Belästigung, Doxxing, gezielte Angriffe auf einzelne Personen
- "spam_ad"    : kommerzielle Werbung, Linkfarm, Crypto-Scam, Affiliate-Spam
- "off_topic"  : völlig unverbunden mit Röbel/Müritz und nicht im Sinne eines Community-Feeds
- "other_bad"  : sonstige Verstöße (Gewalt, Selbstverletzung, Drogen, etc.)

Wichtig: Lokale Themen (Sport, Veranstaltungen, Gastronomie, Ehrenamt, Politik,
Klatsch im neutralen Sinne) sind "clean". Tourismus-Inhalte sind "clean".
Kritik an lokalen Themen ist "clean", solange sie nicht in Hass kippt.
Antworten in deutscher oder englischer Sprache sind beide "clean".`;

function parseLabel(raw: string): { label: ModerationLabel; reason: string } {
  const cleaned = raw.trim();
  // Strip optional code fences
  const stripped = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(stripped);
    const label = (parsed.label || 'clean') as ModerationLabel;
    const reason = String(parsed.reason || '').slice(0, 200);
    if (
      label === 'clean' || label === 'hate' || label === 'sexual' ||
      label === 'harassment' || label === 'spam_ad' || label === 'off_topic' ||
      label === 'other_bad'
    ) {
      return { label, reason };
    }
    return { label: 'clean', reason: 'unknown label, treated as clean' };
  } catch {
    return { label: 'clean', reason: 'unparsable response, treated as clean' };
  }
}

interface ContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: { type: 'url'; url: string };
}

async function classify(content: string, mediaUrls: string[]): Promise<{
  label: ModerationLabel;
  reason: string;
}> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('[moderate-post] ANTHROPIC_API_KEY not set; defaulting to clean');
    return { label: 'clean', reason: 'no api key configured' };
  }

  const blocks: ContentBlock[] = [];
  blocks.push({
    type: 'text',
    text: `Beitragstext:\n"""\n${content || '(leer)'}\n"""`,
  });

  // Cap at first 4 images to keep latency + cost bounded.
  for (const url of mediaUrls.slice(0, 4)) {
    if (!url) continue;
    blocks.push({ type: 'image', source: { type: 'url', url } });
  }

  const body = {
    model: MODEL,
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: blocks }],
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[moderate-post] anthropic error', res.status, text);
    return { label: 'clean', reason: `anthropic ${res.status}, treated as clean` };
  }

  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? '';
  return parseLabel(text);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method not allowed' });
  }

  let body: { post_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid json' });
  }

  const postId = body.post_id;
  if (!postId || typeof postId !== 'string') {
    return json(400, { error: 'missing post_id' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: 'supabase env not configured' });
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Load the post.
  const { data: post, error: loadError } = await supabase
    .from('posts')
    .select('id, content, media_urls, post_type, moderation_status, status')
    .eq('id', postId)
    .single();

  if (loadError || !post) {
    console.error('[moderate-post] post not found', postId, loadError?.message);
    return json(404, { error: 'post not found' });
  }

  // Idempotency: only moderate pending user posts.
  if (post.post_type !== 'user') {
    return json(200, { skipped: true, reason: 'non-user post' });
  }
  if (post.moderation_status && post.moderation_status !== 'pending') {
    return json(200, { skipped: true, reason: 'already moderated' });
  }

  const { label, reason } = await classify(
    post.content || '',
    Array.isArray(post.media_urls) ? post.media_urls : []
  );

  const isFlagged = FLAGGED_LABELS.has(label);
  const update: Record<string, unknown> = {
    moderation_status: isFlagged ? 'flagged' : 'clean',
    moderation_reason: reason || label,
  };
  if (isFlagged) {
    update.status = 'flagged';
    update.hidden_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from('posts')
    .update(update)
    .eq('id', postId);

  if (updateError) {
    console.error('[moderate-post] failed to update', updateError.message);
    return json(500, { error: 'failed to update post' });
  }

  return json(200, { label, reason, flagged: isFlagged });
});
