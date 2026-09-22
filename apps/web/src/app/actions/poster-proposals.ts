"use server";

import { revalidatePath } from "next/cache";
import { isAuthenticated } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPosterSettings,
  keepOriginal,
  proposePosters,
  PosterServiceError,
  selectProposal,
  spentTodayUsd,
  type PosterServiceErrorCode,
} from "@/lib/poster/service";
import type { PosterCheck, PosterProposal, ProposeResult } from "@/lib/poster/types";

export interface PosterOverviewEvent {
  id: string;
  title: string;
  date: string;
  status: string;
  image_url: string | null;
  poster_reviewed_at: string | null;
  poster_proposal_id: string | null;
  original_image_url: string | null;
  poster_check: PosterCheck | null;
  openBatch: boolean;
}

export interface PosterReviewEvent extends PosterOverviewEvent {
  location: string | null;
  time: string | null;
  organizer_name: string | null;
  category: string | null;
}

const OVERVIEW_COLUMNS =
  "id, title, date, status, image_url, poster_reviewed_at, poster_proposal_id, original_image_url, poster_check";

async function guard(): Promise<string | null> {
  return (await isAuthenticated()) ? null : "Nicht angemeldet";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listPosterOverviewAction() {
  const denied = await guard();
  if (denied) return { success: false as const, error: denied };
  const admin = createAdminClient();
  const [{ data: events, error }, { data: open }, settings, spent] = await Promise.all([
    admin
      .from("events")
      .select(OVERVIEW_COLUMNS)
      .gte("date", today())
      .in("status", ["approved", "pending"])
      .order("date", { ascending: true }),
    admin
      .from("event_poster_proposals")
      .select("event_id")
      .eq("status", "proposed")
      .not("event_id", "is", null),
    getPosterSettings(admin),
    spentTodayUsd(admin),
  ]);
  if (error) return { success: false as const, error: error.message };
  const openRows = (open ?? []) as Array<{ event_id: string }>;
  const openIds = new Set(openRows.map((r) => r.event_id));
  const rows = (events ?? []) as unknown as Array<Omit<PosterOverviewEvent, "openBatch">>;
  const list: PosterOverviewEvent[] = rows.map((e) => ({ ...e, openBatch: openIds.has(e.id) }));
  return {
    success: true as const,
    events: list,
    spentTodayUsd: spent,
    budgetLimitUsd: settings.budgetLimitUsd,
    enabled: settings.enabled,
  };
}

export async function proposeForEventAction(
  eventId: string,
  opts?: { hint?: string; force?: boolean },
): Promise<
  | { success: true; result: ProposeResult }
  | { success: false; error: string; code?: PosterServiceErrorCode }
> {
  const denied = await guard();
  if (denied) return { success: false, error: denied };
  try {
    const result = await proposePosters(
      { kind: "event", eventId },
      { requestedBy: "admin", hint: opts?.hint ?? null, force: opts?.force ?? false },
    );
    revalidatePath("/admin/dashboard/events/poster");
    revalidatePath(`/admin/dashboard/events/poster/${eventId}`);
    return { success: true, result };
  } catch (error) {
    console.error("proposeForEventAction failed", error);
    if (error instanceof PosterServiceError) return { success: false, error: error.message, code: error.code };
    return { success: false, error: "Vorschläge konnten nicht erzeugt werden." };
  }
}

export async function getPosterReviewAction(eventId: string) {
  const denied = await guard();
  if (denied) return { success: false as const, error: denied };
  const admin = createAdminClient();
  const [{ data: event, error }, { data: proposals }] = await Promise.all([
    admin
      .from("events")
      .select(`${OVERVIEW_COLUMNS}, location, time, organizer_name, category`)
      .eq("id", eventId)
      .maybeSingle(),
    admin
      .from("event_poster_proposals")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .order("variant", { ascending: true }),
  ]);
  if (error || !event) return { success: false as const, error: "Veranstaltung nicht gefunden" };
  const list = (proposals ?? []) as PosterProposal[];
  const row = event as unknown as Omit<PosterReviewEvent, "openBatch">;
  return {
    success: true as const,
    event: { ...row, openBatch: list.some((p) => p.status === "proposed") } as PosterReviewEvent,
    proposals: list,
  };
}

export async function selectPosterAction(proposalId: string): Promise<{ success: boolean; error?: string }> {
  const denied = await guard();
  if (denied) return { success: false, error: denied };
  const res = await selectProposal(proposalId, true);
  if (!res.ok) return { success: false, error: res.error };
  revalidatePath("/admin/dashboard/events");
  revalidatePath("/admin/dashboard/events/poster");
  if (res.eventId) revalidatePath(`/admin/dashboard/events/poster/${res.eventId}`);
  return { success: true };
}

export async function keepOriginalAction(eventId: string): Promise<{ success: boolean; error?: string }> {
  const denied = await guard();
  if (denied) return { success: false, error: denied };
  const res = await keepOriginal(eventId);
  revalidatePath("/admin/dashboard/events/poster");
  revalidatePath(`/admin/dashboard/events/poster/${eventId}`);
  return res.ok ? { success: true } : { success: false, error: res.error };
}
