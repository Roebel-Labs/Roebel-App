// The daily briefing read aloud (the Wochen-Radio voice). Rendered on the first
// request and cached in the private chat-media bucket under the person's own
// folder, addressed by the text's hash: a new briefing gets a new recording.
import { createHash } from "node:crypto";
import { readSetting } from "@/lib/event-radio/gather";
import { SETTING_SPEED, SETTING_VOICE_ID } from "@/lib/event-radio/generate";
import { DEFAULT_SPEED, clampSpeed, recordTtsUsage, synthesizeSpeech } from "@/lib/event-radio/tts";
import { chunkText } from "@/lib/news-audio/narration";
import { mailText } from "@/lib/chat/agent/mail";
import * as persona from "@/lib/chat/persona/store";
import { db } from "@/lib/chat/store";
import { handleError, jsonError, requireWallet, unauthorized } from "../../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BUCKET = "chat-media";
const MAX_CHARS = 4500;

/** Markdown → text a voice can read: headings become sentences, list marks and exclamation marks go. */
function speechText(md: string): string {
  return mailText(md.replace(/^#{1,6}\s+(.*)$/gm, "$1."))
    .replace(/^\s*[-*•]\s+/gm, "").replace(/\s*\((https?:[^)]+)\)/g, "").replace(/!/g, ".")
    .replace(/\n{2,}/g, "\n").trim().slice(0, MAX_CHARS);
}

const mp3 = (data: Blob | ArrayBuffer | Buffer) =>
  new Response(data as BodyInit, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });

/** GET /api/chat/persona/briefing/audio → audio/mpeg. */
export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return jsonError(503, "unavailable", "Vorlesen ist gerade nicht verfügbar.");
  try {
    const row = await persona.getPageRow(wallet, "_briefing");
    const text = speechText(row?.body ?? "");
    if (text.length < 40) return jsonError(404, "not_found", "Es gibt noch kein Briefing zum Vorlesen.");
    const voiceId = await readSetting(db(), SETTING_VOICE_ID);
    if (!voiceId) return jsonError(503, "unavailable", "Vorlesen ist gerade nicht verfügbar.");
    const speed = clampSpeed((await readSetting(db(), SETTING_SPEED)) ?? DEFAULT_SPEED);
    const hash = createHash("sha256").update(`${voiceId}|${speed}|${text}`).digest("hex").slice(0, 24);
    const folder = `${wallet}/briefing`;
    const path = `${folder}/${hash}.mp3`;

    const cached = await db().storage.from(BUCKET).download(path);
    if (cached.data) return mp3(cached.data);

    const buffers: Buffer[] = [];
    let previous: string | undefined;
    for (const part of chunkText(text)) {
      const res = await synthesizeSpeech({ text: part, voiceId, apiKey, previousText: previous, speed });
      buffers.push(res.audio);
      previous = part.slice(-300);
    }
    const audio = Buffer.concat(buffers);
    await recordTtsUsage("chat_briefing", text).catch(() => {});
    // Yesterday's recordings are of no use: keep the folder to this one file.
    const old = await db().storage.from(BUCKET).list(folder);
    const stale = (old.data ?? []).map((f) => `${folder}/${f.name}`).filter((p) => p !== path);
    if (stale.length) await db().storage.from(BUCKET).remove(stale).catch(() => {});
    await db().storage.from(BUCKET).upload(path, audio, { contentType: "audio/mpeg", upsert: true });
    return mp3(audio);
  } catch (err) {
    return handleError(err, "persona/briefing/audio");
  }
}
