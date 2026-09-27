import { MENU_IMAGE_PATH, postAi, AiAuthError } from '@/lib/ai/proxy';
import type { SigningAccount } from '@/lib/signed-request';

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
 * Generate a menu item photo. Blocks until the kie.ai task completes or the
 * edge function's 50 s budget expires. On timeout the caller can retry — kie.ai
 * keeps the task and a second call usually succeeds.
 *
 * Auth (since 2026-09-27): goes through the web route POST /api/ai/menu-image
 * with the chat-session token. The route holds the seed token server-side and
 * checks that the wallet belongs to the org owning the menu item. The app no
 * longer bundles EXPO_PUBLIC_SEED_TOKEN.
 */
export async function regenerateMenuItemImage(
  account: SigningAccount | null,
  input: GenerateMenuImageInput,
): Promise<GenerateMenuImageResult> {
  try {
    const res = await postAi(MENU_IMAGE_PATH, account, input, { timeoutMs: 95_000 });
    const json = (await res.json().catch(() => null)) as GenerateMenuImageResult | null;
    if (json && typeof json === 'object' && 'ok' in json) return json;
    return { ok: false, code: `HTTP_${res.status}` };
  } catch (err) {
    if (err instanceof AiAuthError) return { ok: false, code: 'NOT_SIGNED_IN', error: err.message };
    return { ok: false, code: 'NETWORK_ERROR', error: err instanceof Error ? err.message : String(err) };
  }
}
