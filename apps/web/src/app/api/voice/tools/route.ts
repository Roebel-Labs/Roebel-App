// Röbel knowledge for the Mecky voice agent (agents/mecky-voice). Server-to-server only:
// the LiveKit worker authenticates with VOICE_AGENT_SECRET.
//   GET  → { tools: [{ name, description, parameters }], briefing }  (briefing = this week in Röbel)
//   POST { name, args } → { result }  runs one tool of the public 'roebel' read pack
// Same tools as the chat suite (lib/chat/harness/packs/roebel-read.ts), so chat and voice
// answer from the same data. Read-only public data: no wallet, no personal data.
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { zodSchema } from "ai";
import { TOOLS } from "@/lib/chat/harness/packs/roebel-read";
import { getTenant } from "@/lib/chat/harness/tenants";
import type { HarnessContext } from "@/lib/chat/harness/types";
import { listEvents, listNews } from "@/lib/roebel-data/public";
import { plainText } from "@/lib/roebel-data/shape";

export const runtime = "nodejs";
export const maxDuration = 30;

// Tools that make sense by voice (no long lists of links, no money talk).
const VOICE_TOOLS = new Set([
  "search_roebel", "list_events", "get_event", "list_news", "get_news_article",
  "list_orgs", "get_org", "list_deals", "get_menu", "abfallkalender", "list_proposals",
]);

function authorized(request: Request): boolean {
  const secret = process.env.VOICE_AGENT_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function voiceContext(): HarnessContext {
  return {
    tenant: getTenant("roebel"),
    wallet: "",
    profile: null,
    threadId: "voice",
    botId: "mecky-voice",
    taskId: null,
    emitPart: () => {},
  };
}

const berlinDate = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

/** Compact plain-text briefing the agent gets in its instructions (no tool round trip needed). */
async function briefing(): Promise<string> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const db = createAdminClient();
  const tenant = getTenant("roebel");
  const ref = { id: tenant.id, appOrigin: tenant.appOrigin };
  const now = new Date();
  const today = berlinDate(now);
  const in7 = berlinDate(new Date(now.getTime() + 7 * 86_400_000));
  const [events, news] = await Promise.all([
    listEvents(db, ref, { limit: 15, upcoming: true, from: today, to: in7 }),
    listNews(db, ref, { limit: 3 }),
  ]);
  const weekday = now.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const lines = [`Heute ist ${weekday}.`, ...tenant.facts];
  const ev = events.events.filter((e) => !e.is_cancelled);
  lines.push(ev.length ? "Veranstaltungen der nächsten 7 Tage:" : "In den nächsten 7 Tagen sind keine Veranstaltungen eingetragen.");
  for (const e of ev) {
    lines.push(`- ${e.date}${e.time ? ` ${String(e.time).slice(0, 5)} Uhr` : ""}: ${e.title}${e.location ? ` (${e.location})` : ""}`);
  }
  if (news.articles.length) {
    lines.push("Neueste Nachrichten:");
    for (const n of news.articles) lines.push(`- ${n.title}${n.excerpt ? `: ${plainText(n.excerpt)?.slice(0, 160)}` : ""}`);
  }
  return lines.join("\n");
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tools = TOOLS.filter((t) => VOICE_TOOLS.has(t.name)).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: zodSchema(t.inputSchema).jsonSchema,
  }));
  let brief = "";
  try {
    brief = await briefing();
  } catch (err) {
    console.error("[voice/tools] briefing failed", err);
  }
  return NextResponse.json({ tools, briefing: brief });
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { name?: unknown; args?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const tool = TOOLS.find((t) => t.name === body.name && VOICE_TOOLS.has(t.name));
  if (!tool) return NextResponse.json({ error: "unknown_tool" }, { status: 404 });
  const parsed = tool.inputSchema.safeParse(body.args ?? {});
  if (!parsed.success) {
    return NextResponse.json({ result: { error: `Ungültige Eingabe: ${parsed.error.issues.map((i) => i.message).join(", ")}` } });
  }
  try {
    const result = await tool.execute(parsed.data, voiceContext());
    return NextResponse.json({ result });
  } catch (err) {
    console.error(`[voice/tools] ${tool.name} failed`, err);
    return NextResponse.json({ result: { error: "Das konnte ich gerade nicht nachschlagen." } });
  }
}
