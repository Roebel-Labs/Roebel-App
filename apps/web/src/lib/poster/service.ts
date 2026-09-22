// Server: the poster proposal pipeline. Reads/writes only through the admin
// client (event_poster_proposals has no RLS policies on purpose).
import { createAdminClient } from "@/lib/supabase/admin";
import { markSyntheticImage } from "@/lib/images/ai-marking";
import { fetchSourceImage, type FetchedImage } from "./analyze";
import { classifyImage, draftPosterCopy } from "./ai";
import { evaluateCaps } from "./caps";
import {
  DEFAULT_DAILY_BUDGET_USD,
  POSTER_STORAGE_BUCKET,
  POSTER_STORAGE_FOLDER,
  SETTING_BUDGET,
  SETTING_ENABLED,
  SETTING_MODEL,
  posterGeneratorLabel,
} from "./constants";
import { buildPosterContent } from "./content";
import { decideMode } from "./decide";
import { pickDirections } from "./directions";
import { renderPoster, type RenderedPoster } from "./openai-image";
import { buildDesignPrompt, buildReformatPrompt } from "./prompts";
import { classifyRatio, type RatioClass } from "./ratio";
import type {
  PosterAnalysis,
  PosterCheck,
  PosterCopy,
  PosterEventInput,
  PosterMode,
  PosterProposal,
  PosterRequester,
  ProposeResult,
} from "./types";

export type ProposeInput =
  | { kind: "event"; eventId: string }
  | { kind: "draft"; draftId: string; draft: PosterEventInput };

export interface ProposeContext {
  requestedBy: PosterRequester;
  accountId?: string | null;
  hint?: string | null;
  /** Generate even when the analysis says the current image is fine. */
  force?: boolean;
}

export class PosterServiceError extends Error {
  code: "caps" | "not_found" | "render" | "upload";
  constructor(message: string, code: "caps" | "not_found" | "render" | "upload") {
    super(message);
    this.name = "PosterServiceError";
    this.code = code;
  }
}

type Admin = ReturnType<typeof createAdminClient>;

const EVENT_COLUMNS =
  "id, title, date, time, end_time, location, category, ticket_price, organizer_name, description, website_url, image_url, account_id";

type EventRow = PosterEventInput & { id: string | null; account_id: string | null };

export async function getPosterSettings(admin: Admin = createAdminClient()) {
  const { data } = await admin
    .from("app_settings")
    .select("key, value")
    .in("key", [SETTING_ENABLED, SETTING_BUDGET, SETTING_MODEL]);
  const rows = (data ?? []) as Array<{ key: string; value: string | null }>;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const budget = Number(map.get(SETTING_BUDGET));
  return {
    enabled: map.get(SETTING_ENABLED) !== "false",
    budgetLimitUsd: Number.isFinite(budget) && budget > 0 ? budget : DEFAULT_DAILY_BUDGET_USD,
    model: map.get(SETTING_MODEL)?.trim() || null,
  };
}

function startOfUtcDay(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function spentTodayUsd(admin: Admin = createAdminClient()): Promise<number> {
  const { data } = await admin
    .from("event_poster_proposals")
    .select("cost_usd")
    .gte("created_at", startOfUtcDay());
  const rows = (data ?? []) as Array<{ cost_usd: number | string | null }>;
  return rows.reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0);
}

async function countBatches(
  admin: Admin,
  column: "draft_id" | "account_id",
  value: string,
  todayOnly: boolean,
): Promise<number> {
  let q = admin.from("event_poster_proposals").select("batch_id").eq(column, value);
  if (todayOnly) q = q.gte("created_at", startOfUtcDay());
  const { data } = await q;
  const rows = (data ?? []) as Array<{ batch_id: string }>;
  return new Set(rows.map((r) => r.batch_id)).size;
}

async function loadEvent(admin: Admin, eventId: string): Promise<EventRow> {
  const { data, error } = await admin.from("events").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle();
  if (error || !data) throw new PosterServiceError("Veranstaltung nicht gefunden", "not_found");
  return data as unknown as EventRow;
}

async function uploadPoster(admin: Admin, scope: string, rendered: RenderedPoster): Promise<string> {
  const marked = markSyntheticImage(rendered.bytes, posterGeneratorLabel(rendered.model));
  const path = `${POSTER_STORAGE_FOLDER}/${scope}/${crypto.randomUUID()}.jpg`;
  const { error } = await admin.storage
    .from(POSTER_STORAGE_BUCKET)
    .upload(path, Buffer.from(marked.bytes), { contentType: "image/jpeg", upsert: false });
  if (error) throw new PosterServiceError(`Upload fehlgeschlagen: ${error.message}`, "upload");
  return admin.storage.from(POSTER_STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

function referenceKind(analysis: PosterAnalysis | null): string | null {
  if (!analysis) return null;
  if (analysis.kind === "logo") return "logo";
  if (analysis.kind === "photo") return "photo";
  return "image";
}

async function analyze(imageUrl: string | null | undefined): Promise<{
  image: FetchedImage | null;
  ratio: RatioClass | null;
  analysis: PosterAnalysis | null;
}> {
  const image = await fetchSourceImage(imageUrl);
  if (!image) return { image: null, ratio: null, analysis: null };
  const ratio = classifyRatio(image.width, image.height);
  const analysis = await classifyImage(image);
  return { image, ratio, analysis };
}

async function renderWithRetry(
  prompt: string,
  image: FetchedImage | null,
  model: string | null,
): Promise<RenderedPoster> {
  const input = {
    prompt,
    references: image ? [{ bytes: image.bytes, contentType: image.contentType }] : [],
    model: model ?? undefined,
  };
  try {
    return await renderPoster(input);
  } catch (first) {
    console.warn("renderPoster failed once, retrying", first);
    try {
      return await renderPoster(input);
    } catch (second) {
      const message = second instanceof Error ? second.message : String(second);
      throw new PosterServiceError(`Rendern fehlgeschlagen: ${message}`, "render");
    }
  }
}

export async function proposePosters(input: ProposeInput, ctx: ProposeContext): Promise<ProposeResult> {
  const admin = createAdminClient();
  const settings = await getPosterSettings(admin);

  const event: EventRow =
    input.kind === "event"
      ? await loadEvent(admin, input.eventId)
      : { ...input.draft, id: null, account_id: ctx.accountId ?? null };
  const eventId = input.kind === "event" ? input.eventId : null;
  const draftId = input.kind === "draft" ? input.draftId : null;
  const accountId = ctx.accountId ?? event.account_id ?? null;

  const caps = evaluateCaps({
    requestedBy: ctx.requestedBy,
    enabled: settings.enabled,
    budgetLimitUsd: settings.budgetLimitUsd,
    budgetSpentTodayUsd: await spentTodayUsd(admin),
    batchesForDraft: draftId ? await countBatches(admin, "draft_id", draftId, false) : 0,
    batchesForAccountToday: accountId ? await countBatches(admin, "account_id", accountId, true) : 0,
  });
  if (!caps.ok) throw new PosterServiceError(caps.message, "caps");

  const { image, ratio, analysis } = await analyze(event.image_url);
  const decided = decideMode(ratio, analysis);
  const check: PosterCheck = {
    checkedAt: new Date().toISOString(),
    width: image?.width ?? null,
    height: image?.height ?? null,
    ratio,
    mode: decided,
    analysis,
  };

  if (eventId) {
    await admin
      .from("events")
      .update({ poster_checked_at: check.checkedAt, poster_check: check })
      .eq("id", eventId);
  }

  if (decided === "skip" && !ctx.force) return { skipped: "ratio_ok_poster", check };
  const mode: PosterMode = decided === "skip" ? "reformat" : decided;
  if (mode === "design" && !(event.title ?? "").trim()) return { skipped: "nothing_to_design", check };

  const content = buildPosterContent(event);
  const copy: PosterCopy | null = mode === "design" ? await draftPosterCopy(event, content) : null;
  const directions = pickDirections(mode, event.category);
  const prompts = directions.map((direction) =>
    mode === "reformat" && analysis
      ? buildReformatPrompt(analysis, direction, ctx.hint)
      : buildDesignPrompt(content, copy, direction, {
          hasReference: !!image,
          referenceKind: referenceKind(analysis),
          hint: ctx.hint,
        }),
  );

  const rendered = await Promise.all(prompts.map((p) => renderWithRetry(p, image, settings.model)));

  const batchId = crypto.randomUUID();
  const scope = eventId ?? `draft/${draftId}`;
  const rows = [];
  for (let i = 0; i < rendered.length; i++) {
    const imageUrl = await uploadPoster(admin, scope, rendered[i]);
    rows.push({
      batch_id: batchId,
      event_id: eventId,
      draft_id: draftId,
      account_id: accountId,
      requested_by: ctx.requestedBy,
      mode,
      variant: i + 1,
      direction: directions[i].id,
      source_image_url: event.image_url ?? null,
      image_url: imageUrl,
      analysis: analysis ?? {},
      prompt: prompts[i],
      model: rendered[i].model,
      usage: rendered[i].usage,
      cost_usd: rendered[i].costUsd,
      status: "proposed",
    });
  }
  const { data, error } = await admin.from("event_poster_proposals").insert(rows).select("*");
  if (error || !data) {
    throw new PosterServiceError(`Speichern fehlgeschlagen: ${error?.message ?? "unbekannt"}`, "upload");
  }
  const proposals = (data as PosterProposal[]).sort((a, b) => a.variant - b.variant);
  return { batchId, mode, check, proposals, costUsd: rendered.reduce((s, r) => s + r.costUsd, 0) };
}

export async function selectProposal(
  proposalId: string,
  apply: boolean,
): Promise<{ ok: true; eventId: string | null; imageUrl: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("event_poster_proposals").select("*").eq("id", proposalId).maybeSingle();
  if (!p) return { ok: false, error: "Vorschlag nicht gefunden" };
  const proposal = p as PosterProposal;
  await admin
    .from("event_poster_proposals")
    .update({ status: "rejected" })
    .eq("batch_id", proposal.batch_id)
    .neq("id", proposalId);
  await admin.from("event_poster_proposals").update({ status: "selected" }).eq("id", proposalId);
  if (apply && proposal.event_id) {
    const { data: ev } = await admin
      .from("events")
      .select("image_url, original_image_url")
      .eq("id", proposal.event_id)
      .maybeSingle();
    const now = new Date().toISOString();
    const { error } = await admin
      .from("events")
      .update({
        image_url: proposal.image_url,
        original_image_url: ev?.original_image_url ?? ev?.image_url ?? null,
        poster_proposal_id: proposal.id,
        poster_reviewed_at: now,
        updated_at: now,
      })
      .eq("id", proposal.event_id);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, eventId: proposal.event_id, imageUrl: proposal.image_url };
}

export async function keepOriginal(eventId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  await admin
    .from("event_poster_proposals")
    .update({ status: "rejected" })
    .eq("event_id", eventId)
    .eq("status", "proposed");
  const { error } = await admin
    .from("events")
    .update({ poster_reviewed_at: new Date().toISOString() })
    .eq("id", eventId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function linkDraftProposals(
  draftId: string,
  eventId: string,
): Promise<{ ok: boolean; linked: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("event_poster_proposals")
    .update({ event_id: eventId })
    .eq("draft_id", draftId)
    .is("event_id", null)
    .select("id, image_url, status");
  if (error) return { ok: false, linked: 0 };
  const rows = (data ?? []) as Array<{ id: string; image_url: string; status: string }>;
  const selected = rows.find((r) => r.status === "selected");
  if (selected) {
    await admin
      .from("events")
      .update({ poster_proposal_id: selected.id, poster_reviewed_at: new Date().toISOString() })
      .eq("id", eventId);
  }
  return { ok: true, linked: rows.length };
}
