/**
 * /api/mini-apps/data — the mini-app datastore ("Mini-CMS").
 *
 *   GET    ?app=<id|slug>&scope=app|user [&key=|&prefix=] [&wallet=]
 *          scope app  → public content (anyone; apps read via the host bridge)
 *          scope user → that wallet's own state (host-supplied wallet — same
 *                       MVP trust tier as the reward/balance rails)
 *   POST   { app, scope, key, value, wallet? }
 *          scope user → runtime writes from the host (wallet required)
 *          scope app  → CONTENT edits: owning developer or admin only
 *   DELETE { app, scope, key, wallet? } — same auth as POST
 *
 * Backing table: mini_app_data (staged migration 20260709_mini_app_data).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getApp } from "@/lib/miniapp/data";
import { deleteData, getData, listData, setData } from "@/lib/miniapp/dataStore";
import { requireAppAccess } from "@/lib/miniapp/images/access";
import { getParam, jsonError } from "@/lib/miniapp/http";
import { MiniAppError } from "@/lib/miniapp/types";

export const runtime = "nodejs";

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

async function resolveApp(idOrSlug: string | null) {
  if (!idOrSlug) throw new MiniAppError("invalid_params", "app fehlt.");
  const app = await getApp(idOrSlug);
  if (!app) throw new MiniAppError("not_found", "App nicht gefunden.");
  return app;
}

export async function GET(request: Request) {
  try {
    const app = await resolveApp(getParam(request, "app"));
    const scope = getParam(request, "scope") === "user" ? "user" : "app";
    const wallet = getParam(request, "wallet");
    if (scope === "user" && !WALLET_RE.test(wallet ?? "")) {
      return NextResponse.json({ error: "wallet fehlt für scope=user." }, { status: 400 });
    }
    const key = getParam(request, "key");
    if (key) {
      const item = await getData(app.id, scope, key, wallet);
      return NextResponse.json({ value: item?.value ?? null, exists: Boolean(item) });
    }
    const items = await listData(app.id, scope, {
      prefix: getParam(request, "prefix") ?? undefined,
      wallet,
    });
    return NextResponse.json({ items });
  } catch (e) {
    return jsonError(e);
  }
}

const writeSchema = z.object({
  app: z.string().min(1),
  scope: z.enum(["app", "user"]),
  key: z.string().min(1).max(64),
  value: z.unknown().optional(),
  wallet: z.string().regex(WALLET_RE).optional(),
});

export async function POST(request: Request) {
  try {
    const body = writeSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    const { app: appRef, scope, key, value, wallet } = body.data;

    if (scope === "user") {
      if (!wallet) {
        return NextResponse.json({ error: "wallet fehlt für scope=user." }, { status: 400 });
      }
      const app = await resolveApp(appRef);
      const item = await setData(app.id, "user", key, value, wallet);
      return NextResponse.json({ ok: true, item });
    }

    // scope 'app' → shared content: only the owning developer or an admin.
    const app = await resolveApp(appRef);
    await requireAppAccess(request, app.id);
    const item = await setData(app.id, "app", key, value, null);
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return jsonError(e);
  }
}

const deleteSchema = writeSchema.omit({ value: true });

export async function DELETE(request: Request) {
  try {
    const body = deleteSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    const { app: appRef, scope, key, wallet } = body.data;
    const app = await resolveApp(appRef);
    if (scope === "user") {
      if (!wallet) {
        return NextResponse.json({ error: "wallet fehlt für scope=user." }, { status: 400 });
      }
      await deleteData(app.id, "user", key, wallet);
    } else {
      await requireAppAccess(request, app.id);
      await deleteData(app.id, "app", key, null);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
