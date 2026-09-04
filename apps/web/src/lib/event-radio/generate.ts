// apps/web/src/lib/event-radio/generate.ts
// Orchestrates one Wochen-Radio run (spec section 6.5). Called by the daily
// cron and by the admin "Jetzt neu generieren" route.
import { createAdminClient } from "@/lib/supabase/admin";
import { mapWithConcurrency } from "./concurrency";
import { gatherWeekEvents, loadExistingRows, readSetting } from "./gather";
import { concurrencyFromEnv } from "./generate-helpers";
import { planExpiry, planScopes, staleRowsForScope, type ScopePlan } from "./plan";
import { writeEventSegments, writeIntro, writeOutro } from "./scripts";
import { scopeId } from "./select";
import { deleteSegmentAudio, segmentObjectPath, uploadSegmentAudio } from "./storage";
import { clampSpeed, DEFAULT_SPEED, synthesizeSpeech, TTS_MODEL_ID } from "./tts";
import { berlinToday, previousWeekKey, weekWindow, type WeekWindow } from "./window";

export const SETTING_VOICE_ID = "event_radio_voice_id";
export const SETTING_SPEED = "event_radio_speed";

export type GenerateOptions = { force?: boolean; dryRun?: boolean };

export type GenerateResult = {
  skipped_reason?: "api_key_missing" | "voice_id_missing";
  window: WeekWindow;
  generated: { intro: boolean; events: string[]; outro: boolean };
  reused: string[];
  scripts?: { intro?: string; outro?: string; events: Record<string, string> };
  errors: Array<{ scope: string; message: string }>;
  expired: number;
};

type Job = { plan: ScopePlan; text: string; previousText?: string };

export async function generateEventRadio(opts: GenerateOptions = {}): Promise<GenerateResult> {
  const supabase = createAdminClient();
  const todayKey = berlinToday();
  const window = weekWindow(todayKey);
  const result: GenerateResult = {
    window,
    generated: { intro: false, events: [], outro: false },
    reused: [],
    errors: [],
    expired: 0,
  };

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { ...result, skipped_reason: "api_key_missing" };
  const voiceId = await readSetting(supabase, SETTING_VOICE_ID);
  if (!voiceId) return { ...result, skipped_reason: "voice_id_missing" };

  const speed = clampSpeed((await readSetting(supabase, SETTING_SPEED)) ?? DEFAULT_SPEED);
  const ctx = { voiceId, modelId: TTS_MODEL_ID, speed };
  const events = await gatherWeekEvents(supabase, window);
  const existing = await loadExistingRows(supabase);
  const plan = planScopes({ events, todayKey, weekKey: window.weekKey, existing, ctx, force: Boolean(opts.force) });

  // 1. Scripts (Claude). Failures here abort the run: nothing partial is written.
  const scripts: NonNullable<GenerateResult["scripts"]> = { events: {} };
  if (plan.intro?.needed) scripts.intro = await writeIntro(events, todayKey);
  if (plan.outro.needed) scripts.outro = await writeOutro();
  const neededEvents = plan.events.filter((p) => p.needed);
  if (neededEvents.length > 0) {
    const map = await writeEventSegments(neededEvents.map((p) => p.event!));
    for (const p of neededEvents) scripts.events[p.scopeKey] = map.get(p.scopeKey)!;
  }
  result.reused = [
    ...(plan.intro && !plan.intro.needed ? ["intro"] : []),
    ...(!plan.outro.needed ? ["outro"] : []),
    ...plan.events.filter((p) => !p.needed).map((p) => `event:${p.scopeKey}`),
  ];
  if (opts.dryRun) return { ...result, scripts };

  // 2. Text to speech + upload + row, one job per needed scope.
  const introText =
    scripts.intro ??
    (plan.intro ? existing.find((r) => r.kind === "intro" && r.scope_key === plan.intro!.scopeKey)?.script : undefined);
  const jobs: Job[] = [];
  if (plan.intro?.needed && scripts.intro) jobs.push({ plan: plan.intro, text: scripts.intro });
  for (const p of neededEvents) jobs.push({ plan: p, text: scripts.events[p.scopeKey], previousText: introText });
  if (plan.outro.needed && scripts.outro) jobs.push({ plan: plan.outro, text: scripts.outro, previousText: introText });

  const settled = await mapWithConcurrency(jobs, concurrencyFromEnv(process.env), async (job) => {
    const tts = await synthesizeSpeech({ text: job.text, voiceId, apiKey, speed, previousText: job.previousText });
    const path = segmentObjectPath(window.weekKey, job.plan.kind, job.plan.scopeKey, job.plan.hash);
    const audioUrl = await uploadSegmentAudio(supabase, path, tts.audio);
    const { data: saved, error } = await supabase
      .from("event_radio_segments")
      .upsert(
        {
          kind: job.plan.kind,
          event_id: job.plan.kind === "event" ? job.plan.scopeKey : null,
          scope_key: job.plan.scopeKey,
          week_key: window.weekKey,
          valid_on: job.plan.kind === "intro" ? job.plan.scopeKey : null,
          content_hash: job.plan.hash,
          script: job.text,
          audio_url: audioUrl,
          duration_ms: tts.durationMs,
          voice_id: voiceId,
          model_id: TTS_MODEL_ID,
          request_id: tts.requestId,
        },
        { onConflict: "kind,scope_key,content_hash" },
      )
      .select("id")
      .single();
    if (error || !saved) throw new Error(`Speichern fehlgeschlagen: ${error?.message ?? "keine Zeile"}`);

    const stale = staleRowsForScope(existing, job.plan.kind, job.plan.scopeKey, saved.id);
    if (stale.length > 0) {
      await deleteSegmentAudio(supabase, stale.map((r) => r.audio_url));
      await supabase.from("event_radio_segments").delete().in("id", stale.map((r) => r.id));
    }
    return job.plan;
  });

  settled.forEach((s, i) => {
    const job = jobs[i];
    if (s.ok) {
      if (job.plan.kind === "intro") result.generated.intro = true;
      else if (job.plan.kind === "outro") result.generated.outro = true;
      else result.generated.events.push(job.plan.scopeKey);
    } else {
      const message = s.error instanceof Error ? s.error.message : String(s.error);
      console.error(`[EventRadio] ${scopeId(job.plan.kind, job.plan.scopeKey)} failed:`, message);
      result.errors.push({ scope: scopeId(job.plan.kind, job.plan.scopeKey), message });
    }
  });

  // 3. Expiry pass (files first, then rows).
  const expired = planExpiry({ existing, todayKey, weekKey: window.weekKey, previousWeekKey: previousWeekKey(todayKey) });
  if (expired.length > 0) {
    await deleteSegmentAudio(supabase, expired.map((r) => r.audio_url));
    const { error } = await supabase.from("event_radio_segments").delete().in("id", expired.map((r) => r.id));
    if (error) result.errors.push({ scope: "expiry", message: error.message });
    else result.expired = expired.length;
  }

  return result;
}
