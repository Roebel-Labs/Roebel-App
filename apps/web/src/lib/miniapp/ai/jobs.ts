// Background-generation job persistence for the AI Mini App Builder.
//
// A generation survives the client: the generate route streams AND mirrors its
// progress into a state file, kept running after a disconnect via waitUntil.
// The editor stores the jobId in its session; after laptop sleep / reload /
// device switch it resumes from GET /api/mini-apps/generate/status.
//
// Storage: the existing public "images" bucket (no new DDL — Supabase MCP is
// OAuth-gated). Path is keyed by an unguessable UUID (capability-URL trust,
// same as icon uploads). State includes the full partial document so a
// resumed client can render the canvas mid-build.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "images";
const jobPath = (jobId: string) => `mini-apps/jobs/${jobId}.json`;

export interface GenerationJobState {
  jobId: string;
  status: "running" | "done" | "error";
  /** narration phase while running */
  phase: "vision" | "thinking" | "building";
  /** last ~1.5KB of the model's reasoning (display only) */
  thinkingTail: string;
  /** GLM-4.6V image brief, when images were attached */
  brief?: string;
  /** accumulated document (partial while running, complete when done) */
  html: string;
  chars: number;
  finishReason?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function writeJobState(state: GenerationJobState): Promise<void> {
  try {
    const supabase = createAdminClient();
    const body = JSON.stringify({ ...state, updatedAt: Date.now() });
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(jobPath(state.jobId), new Blob([body], { type: "application/json" }), {
        upsert: true,
        contentType: "application/json",
        cacheControl: "0",
      });
    if (error) console.error("[mini-apps/jobs] write failed", error.message);
  } catch (e) {
    console.error("[mini-apps/jobs] write threw", e);
  }
}

export async function readJobState(jobId: string): Promise<GenerationJobState | null> {
  if (!isUuid(jobId)) return null;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage.from(BUCKET).download(jobPath(jobId));
    if (error || !data) return null;
    return JSON.parse(await data.text()) as GenerationJobState;
  } catch {
    return null;
  }
}
