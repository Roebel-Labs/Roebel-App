// Server-side proxy for the `generate-menu-image` Supabase edge function (POST /api/ai/menu-image).
//
// Before 2026-09-27 the Expo app called the edge function directly with EXPO_PUBLIC_SEED_TOKEN
// inlined in its JS bundle. That token lets anyone generate paid kie.ai images and overwrite ANY
// menu item's image (the edge function writes with the service role). Now the token stays on the
// server (SUPABASE_SEED_TOKEN, already used by the web dashboard) and this route adds what the
// edge function never checked: the caller's chat-session wallet must belong to the org that owns
// the restaurant of the menu item.
//
// Payload passthrough: the same JSON fields the app sent to the edge function, and the edge
// function's JSON answer returned unchanged (same `{ ok, code, ... }` shape).
//
// No next/* imports and relative imports only, so `npx tsx --test` can load it.
import { takeAll, type RateLimiter } from "../rate-limit/index";

export interface MenuImageInput {
  menu_item_id: string;
  prompt_hint?: string;
  quality?: "basic" | "high";
  dry_run?: boolean;
}

export interface MenuImageDeps {
  authenticate(request: Request): Promise<string | null>;
  limiters: RateLimiter[];
  /** True when `wallet` may change this menu item (member of the org owning its restaurant). */
  canEditMenuItem(wallet: string, menuItemId: string): Promise<boolean>;
  supabaseUrl: string | undefined;
  seedToken: string | undefined;
  fetchImpl?: typeof fetch;
}

const ID_RE = /^[0-9a-fA-F-]{8,64}$/;
export const MAX_PROMPT_HINT = 500;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function parseMenuImageInput(body: unknown): MenuImageInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.menu_item_id !== "string" || !ID_RE.test(b.menu_item_id)) return null;
  const out: MenuImageInput = { menu_item_id: b.menu_item_id };
  if (b.prompt_hint !== undefined) {
    if (typeof b.prompt_hint !== "string") return null;
    out.prompt_hint = b.prompt_hint.slice(0, MAX_PROMPT_HINT);
  }
  if (b.quality !== undefined) {
    if (b.quality !== "basic" && b.quality !== "high") return null;
    out.quality = b.quality;
  }
  if (b.dry_run !== undefined) out.dry_run = b.dry_run === true;
  return out;
}

export async function handleMenuImage(request: Request, deps: MenuImageDeps): Promise<Response> {
  const wallet = await deps.authenticate(request);
  if (!wallet) return json(401, { ok: false, code: "UNAUTHORIZED" });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, code: "BAD_JSON" });
  }
  const input = parseMenuImageInput(body);
  if (!input) return json(400, { ok: false, code: "BAD_REQUEST" });

  if (!(await takeAll(deps.limiters, wallet))) return json(429, { ok: false, code: "RATE_LIMITED" });

  if (!deps.supabaseUrl || !deps.seedToken) {
    console.error("[api/ai/menu-image] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SEED_TOKEN is not set");
    return json(503, { ok: false, code: "NOT_CONFIGURED" });
  }

  let allowed = false;
  try {
    allowed = await deps.canEditMenuItem(wallet, input.menu_item_id);
  } catch (err) {
    console.error("[api/ai/menu-image] ownership lookup failed", err instanceof Error ? err.message : err);
    return json(503, { ok: false, code: "LOOKUP_FAILED" });
  }
  if (!allowed) return json(403, { ok: false, code: "FORBIDDEN" });

  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${deps.supabaseUrl.replace(/\/$/, "")}/functions/v1/generate-menu-image`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-seed-token": deps.seedToken },
      body: JSON.stringify(input),
    });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { "content-type": "application/json" } });
  } catch (err) {
    console.error("[api/ai/menu-image] edge function unreachable", err instanceof Error ? err.message : err);
    return json(502, { ok: false, code: "NETWORK_ERROR" });
  }
}

export const MENU_IMAGE_RATE_RULES = [
  { name: "ai-menu-image-hour", limit: 20, windowMs: 3_600_000 },
  { name: "ai-menu-image-day", limit: 60, windowMs: 86_400_000 },
];

/** Minimal Supabase query surface used by the ownership check. */
export interface OwnershipDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
        ilike(col: string, val: string): { limit(n: number): PromiseLike<{ data: unknown[] | null; error: unknown }> };
      };
    };
  };
}

/** menu_items.restaurant_id → restaurants.account_id → account_owners(wallet). */
export async function walletCanEditMenuItem(db: OwnershipDb, wallet: string, menuItemId: string): Promise<boolean> {
  const item = await db.from("menu_items").select("restaurant_id").eq("id", menuItemId).maybeSingle();
  if (item.error) throw item.error;
  const restaurantId = item.data?.restaurant_id;
  if (typeof restaurantId !== "string") return false;
  const restaurant = await db.from("restaurants").select("account_id").eq("id", restaurantId).maybeSingle();
  if (restaurant.error) throw restaurant.error;
  const accountId = restaurant.data?.account_id;
  if (typeof accountId !== "string") return false;
  const owners = await db.from("account_owners").select("role").eq("account_id", accountId).ilike("wallet_address", wallet).limit(1);
  if (owners.error) throw owners.error;
  return Array.isArray(owners.data) && owners.data.length > 0;
}
