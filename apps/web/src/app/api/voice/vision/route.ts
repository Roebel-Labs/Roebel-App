// Camera vision for the Mecky voice agent (agents/mecky-voice, tool `kamera_ansehen`).
// The realtime voice model behind LiveKit Inference rejects image input, so the worker sends the
// latest camera frame here and gets a short German description back. Server-to-server only
// (VOICE_AGENT_SECRET). Model route `vision`: GWDG SAIA first, Anthropic as fallback.
// The frame is not stored.
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { generateText } from "ai";
import { resolveModel } from "@/lib/chat/models";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_IMAGE_CHARS = 3_000_000; // ~2.2 MB base64

function authorized(request: Request): boolean {
  const secret = process.env.VOICE_AGENT_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const SYSTEM = `Du bist die Augen eines Sprachassistenten. Du bekommst ein Kamerabild vom Handy einer Person und ihre Frage.
Antworte auf Deutsch, sachlich und knapp (höchstens 4 Sätze), so dass man es vorlesen kann – kein Markdown.
Lies sichtbaren Text wörtlich vor, wenn er zur Frage passt. Wenn etwas unscharf oder nicht erkennbar ist, sag das.
Beschreibe Menschen nicht nach Aussehen, Alter, Herkunft oder Gefühlen und identifiziere niemanden.`;

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { image?: unknown; question?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const image = typeof body.image === "string" ? body.image : "";
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ error: "bad_image" }, { status: 400 });
  }
  const question = typeof body.question === "string" && body.question.trim()
    ? body.question.trim().slice(0, 300)
    : "Was ist auf dem Bild zu sehen?";
  try {
    const [, mediaType, base64] = image.match(/^data:(image\/[a-z]+);base64,(.*)$/) ?? [];
    const { model } = resolveModel("vision");
    const { text } = await generateText({
      model,
      system: SYSTEM,
      maxOutputTokens: 1500, // DeepSeek reasons before answering
      messages: [{ role: "user", content: [{ type: "image", image: Buffer.from(base64, "base64"), mediaType }, { type: "text", text: question }] }],
    });
    return NextResponse.json({ description: text.trim() });
  } catch (err) {
    console.error("[voice/vision] failed", err);
    return NextResponse.json({ description: "Ich konnte das Bild gerade nicht auswerten." });
  }
}
