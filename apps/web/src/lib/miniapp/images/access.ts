// Shared access check for the image routes: the app's own developer or an
// admin session may manage its images.
import "server-only";
import { isAuthenticated } from "@/lib/auth/session";
import { getApp } from "../data";
import { resolveDeveloperReadonly } from "../http";
import { MiniAppError, type MiniAppRow } from "../types";

export async function requireAppAccess(
  req: Request,
  appId: string,
): Promise<MiniAppRow> {
  const app = await getApp(appId);
  if (!app) throw new MiniAppError("not_found", "App nicht gefunden.");
  if (await isAuthenticated()) return app;
  const developer = await resolveDeveloperReadonly(req);
  if (developer && app.developer_id === developer.id) return app;
  throw new MiniAppError("unauthorized", "Keine Berechtigung für diese App.", 403);
}
