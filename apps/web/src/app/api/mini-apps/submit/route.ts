// POST /api/mini-apps/submit — a developer submits a new app for review.
// Body: { manifest: MiniAppManifest, wallet?: string, source?, version? }
// Auth: the calling developer (resolved from wallet header/body → developers row).
import { NextResponse } from "next/server";
import { submitApp } from "@/lib/miniapp";
import { jsonError, resolveDeveloper } from "@/lib/miniapp/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const dev = await resolveDeveloper(req, body);

    const app = await submitApp({
      manifest: body.manifest,
      developerId: dev.id,
      source: body.source,
      version: body.version,
    });
    return NextResponse.json({ app }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
