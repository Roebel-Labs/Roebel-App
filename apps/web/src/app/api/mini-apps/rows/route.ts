/**
 * /api/mini-apps/rows — shared collections (sdk.data.collection, bridge `data.rows`).
 *
 *   POST { app, op, collection, scope, ...op fields, wallet? }
 *     op list   { query?: { keyPrefix?, mine?, limit?, order? } }
 *     op add    { data, privateData?, key? }        → 409 code "conflict" when the key exists
 *     op update { id, data?, privateData? }         → author only
 *     op remove { id }                              → author, or the app owner for shared rows
 *   GET ?app=<id|slug>&collections=1                → owner view: collections and counts
 *
 * The person: mini-app user token (Authorization: Bearer) or, while MINIAPP_REQUIRE_USER_TOKEN≠1,
 * the host-supplied wallet (same rule as /api/mini-apps/data). The app owner — whose view
 * includes everyone's privateData — needs a VERIFIED identity: an admin session or the
 * developer's chat-session Bearer (Ortis Studio). A bare x-wallet-address never counts.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth/session";
import { getParam, jsonError, sessionWallet } from "@/lib/miniapp/http";
import { getApp, getDeveloperByWallet } from "@/lib/miniapp/data";
import { checkCollection, checkKey, checkPayload, type Viewer } from "@/lib/miniapp/rows-core";
import { addRow, collectionsOf, listRows, removeRow, updateRow } from "@/lib/miniapp/rows";
import { HOST_HEADER, resolveRuntimeUser, runtimeAuthDeps } from "@/lib/miniapp/runtimeAuth";
import { MiniAppError, type MiniAppRow } from "@/lib/miniapp/types";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { MINUTE_MS, DAY_MS, takeAll } from "@/lib/rate-limit";

export const runtime = "nodejs";

const writeLimiters = sharedLimiters([
  { name: "miniapp-rows-write-m", limit: 60, windowMs: MINUTE_MS },
  { name: "miniapp-rows-write-d", limit: 2000, windowMs: DAY_MS },
]);

const obj = z.record(z.string(), z.unknown());
const base = {
  app: z.string().min(1),
  collection: z.string().min(1).max(40),
  scope: z.enum(["shared", "private"]).default("shared"),
  wallet: z.string().optional(),
};
const bodySchema = z.discriminatedUnion("op", [
  z.object({
    ...base,
    op: z.literal("list"),
    query: z
      .object({
        keyPrefix: z.string().max(120).optional(),
        mine: z.boolean().optional(),
        limit: z.number().optional(),
        order: z.enum(["newest", "oldest", "key"]).optional(),
      })
      .optional(),
  }),
  z.object({ ...base, op: z.literal("add"), data: obj, privateData: obj.nullish(), key: z.string().nullish() }),
  z.object({ ...base, op: z.literal("update"), id: z.string().min(1).max(64), data: obj.optional(), privateData: obj.nullish() }),
  z.object({ ...base, op: z.literal("remove"), id: z.string().min(1).max(64) }),
]);

async function resolveApp(ref: string): Promise<MiniAppRow> {
  const app = await getApp(ref);
  if (!app) throw new MiniAppError("not_found", "App nicht gefunden.", 404);
  return app;
}

/** Verified app owner: admin session, or the developer's own chat session (`chatWallet`). */
async function isAppOwner(app: MiniAppRow, chatWallet: string | null): Promise<boolean> {
  if (await isAuthenticated()) return true;
  if (!chatWallet) return false;
  const dev = await getDeveloperByWallet(chatWallet);
  return Boolean(dev && dev.id === app.developer_id);
}

/** The person using the app, or null (reads of shared rows work without one). */
async function runtimeWallet(request: Request, app: MiniAppRow, claimed: string | undefined, required: boolean): Promise<string | null> {
  try {
    const user = await resolveRuntimeUser(
      {
        authorization: request.headers.get("authorization"),
        app,
        claimedWallet: claimed,
        route: "rows",
        host: request.headers.get(HOST_HEADER),
      },
      runtimeAuthDeps(),
    );
    return user.wallet;
  } catch (e) {
    if (required) throw e;
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_body", code: "invalid_params" }, { status: 400 });
    const b = parsed.data;
    const bad = checkCollection(b.collection);
    if (bad) throw new MiniAppError(bad.code, bad.message);

    const app = await resolveApp(b.app);
    const ref = { appId: app.id, collection: b.collection, scope: b.scope };
    // Two kinds of Bearer: a chat session (Ortis Studio, owner view) or a mini-app user token
    // (the app at runtime). A chat session is never a runtime person for someone else's app.
    const chatWallet = await sessionWallet(request);
    const owner = await isAppOwner(app, chatWallet);
    const needsPerson = b.op === "add" || b.op === "update" || b.scope === "private" || (b.op === "remove" && !owner);
    const wallet = chatWallet
      ? owner
        ? chatWallet
        : null
      : await runtimeWallet(request, app, b.wallet, needsPerson && !owner);
    const viewer: Viewer = { wallet, appOwner: owner };

    if (b.op === "list") {
      return NextResponse.json(await listRows(ref, viewer, b.query ?? {}));
    }

    const limitKey = wallet ?? `owner:${app.id}`;
    if (!(await takeAll(writeLimiters, limitKey))) {
      throw new MiniAppError("rate_limited", "Zu viele Änderungen in kurzer Zeit. Bitte gleich noch einmal versuchen.", 429);
    }

    if (b.op === "add") {
      if (!wallet) throw new MiniAppError("unauthorized", "Bitte anmelden, um etwas einzutragen.", 401);
      const e = checkKey(b.key) ?? checkPayload(b.data, b.privateData ?? undefined, true);
      if (e) throw new MiniAppError(e.code, e.message);
      return NextResponse.json(await addRow(ref, wallet, { key: b.key ?? null, data: b.data, privateData: b.privateData ?? null }), { status: 201 });
    }
    if (b.op === "update") {
      const e = checkPayload(b.data, b.privateData ?? undefined, false);
      if (e) throw new MiniAppError(e.code, e.message);
      return NextResponse.json(await updateRow(ref, viewer, b.id, { data: b.data, privateData: b.privateData }));
    }
    return NextResponse.json(await removeRow(ref, viewer, b.id));
  } catch (e) {
    return jsonError(e);
  }
}

export async function GET(request: Request) {
  try {
    const app = await resolveApp(getParam(request, "app") ?? "");
    if (!(await isAppOwner(app, await sessionWallet(request)))) throw new MiniAppError("unauthorized", "Nur für die Betreiber:in der App.", 403);
    return NextResponse.json({ collections: await collectionsOf(app.id) });
  } catch (e) {
    return jsonError(e);
  }
}
