import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? (Constants as any).manifest?.extra) as
  | { SUPABASE_URL?: string }
  | undefined;

const SUPABASE_URL =
  extra?.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  '';

const SEED_TOKEN = process.env.EXPO_PUBLIC_SEED_TOKEN ?? '';

export type GenerateMenuImageInput = {
  menu_item_id: string;
  prompt_hint?: string;
  quality?: 'basic' | 'high';
  dry_run?: boolean;
};

export type GenerateMenuImageResult =
  | { ok: true; image_url: string; prompt: string; task_id?: string }
  | { ok: true; prompt: string; dry_run: true }
  | { ok: false; code: string; error?: string; task_id?: string };

/**
 * Invoke the `generate-menu-image` Edge Function. Blocks until the kie.ai
 * task completes or the function's 50 s budget expires. On timeout the
 * caller can retry — kie.ai keeps the task and a second call usually
 * succeeds (the function generates a fresh image each invocation).
 *
 * Auth: bundles the SEED_TOKEN from `EXPO_PUBLIC_SEED_TOKEN`. The token is
 * extractable from the JS bundle — acceptable for early-access. When the
 * app moves to production add a proxy that verifies wallet→account ownership.
 */
export async function regenerateMenuItemImage(
  input: GenerateMenuImageInput,
): Promise<GenerateMenuImageResult> {
  if (!SUPABASE_URL) {
    return { ok: false, code: 'NO_SUPABASE_URL' };
  }
  if (!SEED_TOKEN) {
    return { ok: false, code: 'NO_SEED_TOKEN' };
  }
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/generate-menu-image`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-seed-token': SEED_TOKEN,
      },
      body: JSON.stringify(input),
    });
    const json = await res.json();
    return json as GenerateMenuImageResult;
  } catch (err) {
    return { ok: false, code: 'NETWORK_ERROR', error: err instanceof Error ? err.message : String(err) };
  }
}
