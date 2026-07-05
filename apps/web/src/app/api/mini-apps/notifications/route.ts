// Mini-app notification sending (spec §store-v2: opt-ins gate delivery).
// Two callers:
//  - Expo host runtime (sdk.notifications.send): notifies ONLY the current
//    wallet, and only if it opted in for the app. Same trust tier as events.
//  - Dashboards (developer or admin, `broadcast: true`): notify ALL opted-in
//    wallets of a live app; logged in mini_app_notifications.
// Delivery = insert into `notifications` (the app-wide push hub) with
// type 'mini_app' — the DB trigger fans out the actual push.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApp } from "@/lib/miniapp/data";
import { getParam, jsonError, resolveDeveloperReadonly } from "@/lib/miniapp/http";
import { requireAppAccess } from "@/lib/miniapp/images/access";
import { isAuthenticated } from "@/lib/auth/session";
import { MiniAppError, type MiniAppRow } from "@/lib/miniapp/types";

export const runtime = "nodejs";

const RUNTIME_DAILY_LIMIT = 2; // pro (App, Wallet)
const BROADCAST_DAILY_LIMIT = 3; // pro App
const DAY_MS = 24 * 60 * 60 * 1000;

type Body = {
  miniAppId?: string;
  appId?: string;
  slug?: string;
  wallet?: string;
  broadcast?: boolean;
  title?: string;
  body?: string;
  targetUrl?: string;
};

function validateContent(b: Body): { title: string; text: string; targetUrl: string | null } {
  const title = (b.title ?? "").trim();
  const text = (b.body ?? "").trim();
  const targetUrl = (b.targetUrl ?? "").trim() || null;
  if (title.length < 1 || title.length > 80) {
    throw new MiniAppError("invalid_params", "Titel erforderlich (max. 80 Zeichen).");
  }
  if (text.length < 1 || text.length > 200) {
    throw new MiniAppError("invalid_params", "Text erforderlich (max. 200 Zeichen).");
  }
  if (targetUrl && !/^https:\/\//.test(targetUrl)) {
    throw new MiniAppError("invalid_params", "targetUrl muss eine https-URL sein.");
  }
  return { title, text, targetUrl };
}

function notificationRow(
  app: MiniAppRow,
  recipient: string,
  content: { title: string; text: string; targetUrl: string | null },
) {
  return {
    recipient_wallet: recipient.toLowerCase(),
    type: "mini_app",
    title: content.title,
    body: content.text,
    metadata: {
      mini_app_id: app.id,
      slug: app.slug,
      app_name: app.name,
      target_url: content.targetUrl,
    },
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) throw new MiniAppError("invalid_params", "Ungültige Anfrage.");
    const appId = body.appId ?? body.miniAppId ?? "";
    if (!appId) throw new MiniAppError("invalid_params", "appId erforderlich.");
    const content = validateContent(body);
    const supabase = createAdminClient();
    const since = new Date(Date.now() - DAY_MS).toISOString();

    // ── Dashboard broadcast ─────────────────────────────────────────────────
    if (body.broadcast === true) {
      const app = await requireAppAccess(req, appId);
      if (app.status !== "live") {
        throw new MiniAppError(
          "invalid_params",
          "Mitteilungen können nur für Live-Apps gesendet werden.",
        );
      }

      const { count: sentToday } = await supabase
        .from("mini_app_notifications")
        .select("id", { count: "exact", head: true })
        .eq("mini_app_id", app.id)
        .gte("created_at", since);
      if ((sentToday ?? 0) >= BROADCAST_DAILY_LIMIT) {
        throw new MiniAppError(
          "rate_limited",
          `Maximal ${BROADCAST_DAILY_LIMIT} Mitteilungen pro Tag und App.`,
          429,
        );
      }

      const { data: optins, error: optErr } = await supabase
        .from("mini_app_notification_optins")
        .select("wallet")
        .eq("mini_app_id", app.id)
        .eq("enabled", true);
      if (optErr) throw new MiniAppError("internal", optErr.message);
      const wallets = [...new Set((optins ?? []).map((o) => o.wallet.toLowerCase()))];

      if (wallets.length > 0) {
        const rows = wallets.map((w) => notificationRow(app, w, content));
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await supabase.from("notifications").insert(rows.slice(i, i + 500));
          if (error) throw new MiniAppError("internal", error.message);
        }
      }

      const admin = await isAuthenticated();
      const developer = admin ? null : await resolveDeveloperReadonly(req);
      await supabase.from("mini_app_notifications").insert({
        mini_app_id: app.id,
        title: content.title,
        body: content.text,
        target_url: content.targetUrl,
        sent_by: admin ? "admin" : (developer?.wallet ?? "unknown"),
        recipients: wallets.length,
      });

      return NextResponse.json({ sent: true, recipients: wallets.length });
    }

    // ── Runtime send (Expo host, current user only) ─────────────────────────
    const wallet = (body.wallet ?? "").trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
      throw new MiniAppError("invalid_params", "Ungültige Wallet.");
    }
    const app = await getApp(appId);
    if (!app || app.status !== "live") {
      throw new MiniAppError("not_found", "App nicht gefunden oder nicht live.");
    }

    const { data: optin } = await supabase
      .from("mini_app_notification_optins")
      .select("enabled")
      .eq("mini_app_id", app.id)
      .eq("wallet", wallet)
      .maybeSingle();
    if (!optin?.enabled) {
      return NextResponse.json({ sent: false, reason: "not_opted_in" });
    }

    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_wallet", wallet)
      .eq("type", "mini_app")
      .eq("metadata->>mini_app_id", app.id)
      .gte("created_at", since);
    if ((count ?? 0) >= RUNTIME_DAILY_LIMIT) {
      throw new MiniAppError(
        "rate_limited",
        `Maximal ${RUNTIME_DAILY_LIMIT} Mitteilungen pro Tag und Nutzer.`,
        429,
      );
    }

    const { error } = await supabase
      .from("notifications")
      .insert(notificationRow(app, wallet, content));
    if (error) throw new MiniAppError("internal", error.message);
    return NextResponse.json({ sent: true });
  } catch (e) {
    return jsonError(e);
  }
}

// Dashboard data: opt-in count + recent broadcast history.
export async function GET(req: Request) {
  try {
    const appId = getParam(req, "appId") ?? "";
    if (!appId) throw new MiniAppError("invalid_params", "appId erforderlich.");
    const app = await requireAppAccess(req, appId);
    const supabase = createAdminClient();

    const [{ count: optins }, { data: sends }] = await Promise.all([
      supabase
        .from("mini_app_notification_optins")
        .select("id", { count: "exact", head: true })
        .eq("mini_app_id", app.id)
        .eq("enabled", true),
      supabase
        .from("mini_app_notifications")
        .select("id, created_at, title, body, target_url, recipients")
        .eq("mini_app_id", app.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    return NextResponse.json({ optins: optins ?? 0, sends: sends ?? [] });
  } catch (e) {
    return jsonError(e);
  }
}
