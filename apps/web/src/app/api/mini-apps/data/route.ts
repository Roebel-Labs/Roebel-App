/**
 * /api/mini-apps/data — the mini-app datastore ("Mini-CMS").
 *
 *   GET    ?app=<id|slug>&scope=app|user [&key=|&prefix=] [&wallet=]
 *          scope app  → public content (anyone; apps read via the host bridge)
 *          scope user → that user's own state
 *   scope user (all methods): the user comes from `Authorization: Bearer
 *   <mini-app user token>` (wins over `wallet`); the bare host-supplied
 *   `wallet` is accepted only while MINIAPP_REQUIRE_USER_TOKEN≠1.
 *   POST   { app, scope, key, value, wallet? }
 *          scope user → runtime writes from the host (user token or wallet)
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
import { HOST_HEADER, resolveRuntimeUser, runtimeAuthDeps } from "@/lib/miniapp/runtimeAuth";
import { MiniAppError } from "@/lib/miniapp/types";

export const runtime = "nodejs";

async function resolveApp(idOrSlug: string | null) {
  if (!idOrSlug) throw new MiniAppError("invalid_params", "app fehlt.");
  const app = await getApp(idOrSlug);
  if (!app) throw new MiniAppError("not_found", "App nicht gefunden.");
  return app;
}

async function userWallet(
  request: Request,
  app: { id: string; slug: string },
  claimedWallet: string | null | undefined,
): Promise<string> {
  const user = await resolveRuntimeUser(
    {
      authorization: request.headers.get("authorization"),
      app,
      claimedWallet,
      route: "data",
      host: request.headers.get(HOST_HEADER),
    },
    runtimeAuthDeps(),
  );
  return user.wallet;
}

export async function GET(request: Request) {
  try {
    const app = await resolveApp(getParam(request, "app"));
    const scope = getParam(request, "scope") === "user" ? "user" : "app";
    const wallet =
      scope === "user" ? await userWallet(request, app, getParam(request, "wallet")) : null;
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
  // Validated by resolveRuntimeUser (legacy path); ignored when a token is sent.
  wallet: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = writeSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    const { app: appRef, scope, key, value, wallet } = body.data;

    if (scope === "user") {
      const app = await resolveApp(appRef);
      const item = await setData(app.id, "user", key, value, await userWallet(request, app, wallet));
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
      await deleteData(app.id, "user", key, await userWallet(request, app, wallet));
    } else {
      await requireAppAccess(request, app.id);
      await deleteData(app.id, "app", key, null);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
