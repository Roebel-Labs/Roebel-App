/**
 * GET /api/mini-apps/generate/status?job=<uuid> — poll a background
 * generation job (see lib/miniapp/ai/jobs.ts). Used by the editor to resume
 * after laptop sleep, reload, or a dropped stream.
 *
 * While the job is running, `html` is the partial document (canvas preview);
 * on "done" it is the complete document. Trust model: the jobId is an
 * unguessable UUID handed only to the client that started the job.
 */
import { NextResponse } from "next/server";
import { readJobState } from "@/lib/miniapp/ai/jobs";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("job") ?? "";
  const state = await readJobState(jobId);
  if (!state) {
    return NextResponse.json({ error: "job_not_found" }, { status: 404 });
  }
  return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
}
