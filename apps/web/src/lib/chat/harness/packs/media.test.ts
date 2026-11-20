import { test } from "node:test";
import assert from "node:assert/strict";
import { isToolInputError } from "../errors";
import type { HarnessContext } from "../types";
import type { ChatPart } from "../../types";
import { imagesDeps } from "./images";
import {
  MEDIA_DAILY_LIMITS, generateMusic, generateSpeech, mediaCapState, mediaDeps, mediaFailureMessage,
  mediaObjectPath, mediaStatus, mediaTitle,
} from "./media";

const WALLET = "0x" + "11".repeat(20);
const THREAD = "7d3c1a6e-1111-4c3a-9e8f-0a1b2c3d4e5f";

function makeCtx(): { ctx: HarnessContext; parts: ChatPart[] } {
  const parts: ChatPart[] = [];
  const ctx = {
    wallet: WALLET, threadId: THREAD, botId: "bot", taskId: null, profile: null, tenant: {},
    emitPart: (p: ChatPart) => { parts.push(p); },
  } as unknown as HarnessContext;
  return { ctx, parts };
}

type Rows = { route: string; taskId: string; cost: number }[];

function stub(opts: { states: Array<"pending" | "success" | "fail">; used?: number; credits?: number }) {
  const rows: Rows = [];
  const saved = { ...mediaDeps };
  const savedTier = imagesDeps.tier;
  let clock = 0;
  let poll = 0;
  imagesDeps.tier = async () => "free";
  mediaDeps.now = () => clock;
  mediaDeps.sleep = async (ms: number) => { clock += ms; };
  mediaDeps.startedToday = async () => opts.used ?? 0;
  mediaDeps.recordJob = async (_ctx, route, taskId, cost) => { rows.push({ route, taskId, cost }); };
  mediaDeps.jobRowExists = async (_w, route, taskId) => rows.some((r) => r.route === route && r.taskId === taskId);
  mediaDeps.createJob = async () => "task_abcdef12";
  mediaDeps.pollJob = async () => {
    const state = opts.states[Math.min(poll++, opts.states.length - 1)];
    if (state === "success") return { state, urls: ["https://kie/a.mp3", "https://kie/b.mp3", "https://kie/c.mp3"], credits: opts.credits ?? null };
    if (state === "fail") return { state, error: "content flagged as sensitive" };
    return { state };
  };
  mediaDeps.persist = async (_t, _k, url) => `https://ours/${url.split("/").pop()}`;
  return {
    rows,
    restore() { Object.assign(mediaDeps, saved); imagesDeps.tier = savedTier; },
  };
}

test("caps: video is scarcer than speech on the free tier", () => {
  assert.ok(MEDIA_DAILY_LIMITS.video.free < MEDIA_DAILY_LIMITS.speech.free);
  assert.deepEqual(mediaCapState(1, "video", "free"), { limit: 1, remaining: 0, exceeded: true });
});

test("path, title and failure text", () => {
  assert.equal(mediaObjectPath(THREAD, "video", "x"), `chat/agents/${THREAD}/media/x.mp4`);
  assert.equal(mediaObjectPath(THREAD, "music", "x"), `chat/agents/${THREAD}/media/x.mp3`);
  assert.match(mediaTitle("music", "Shanty", 1, 2), /^Musik \(Variante 2\), KI-erzeugt: Shanty$/);
  assert.match(mediaFailureMessage("video", "flagged as sensitive"), /Inhaltsfilter/);
  assert.doesNotMatch(mediaFailureMessage("video", "internal error 500"), /internal/);
});

test("speech: finished job is stored, shown as a link card and booked with its cost", async () => {
  const s = stub({ states: ["pending", "success"], credits: 12 });
  try {
    const { ctx, parts } = makeCtx();
    const res = (await generateSpeech.execute({ text: "Moin Röbel" }, ctx)) as { ok?: boolean; urls?: string[] };
    assert.equal(res.ok, true);
    assert.deepEqual(res.urls, ["https://ours/a.mp3", "https://ours/b.mp3"]);
    assert.equal(parts.length, 1);
    assert.equal(parts[0].type, "sources");
    assert.deepEqual(s.rows.map((r) => r.route), ["media-start:speech", "media:speech"]);
    assert.equal(s.rows[1].cost, 60_000);
  } finally { s.restore(); }
});

test("music: a job that outlasts the turn returns a jobId, media_status delivers it once", async () => {
  const s = stub({ states: ["pending"] });
  try {
    const { ctx, parts } = makeCtx();
    const res = (await generateMusic.execute({ prompt: "Ein Shanty über die Müritz" }, ctx)) as { pending?: boolean; jobId?: string };
    assert.equal(res.pending, true);
    assert.equal(res.jobId, "music:task_abcdef12");
    assert.equal(parts.length, 0);

    mediaDeps.pollJob = async () => ({ state: "success", urls: ["https://kie/a.mp3"], credits: null });
    const done = (await mediaStatus.execute({ jobId: res.jobId! }, ctx)) as { ok?: boolean };
    assert.equal(done.ok, true);
    assert.equal(parts.length, 1);
    const again = (await mediaStatus.execute({ jobId: res.jobId! }, ctx)) as { alreadyDelivered?: boolean };
    assert.equal(again.alreadyDelivered, true);
    assert.equal(parts.length, 1);
  } finally { s.restore(); }
});

test("media_status refuses a job this person did not start", async () => {
  const s = stub({ states: ["success"] });
  try {
    const { ctx } = makeCtx();
    await assert.rejects(() => mediaStatus.execute({ jobId: "video:task_someoneelse" }, ctx) as Promise<unknown>, isToolInputError);
    await assert.rejects(() => mediaStatus.execute({ jobId: "nonsense-id" }, ctx) as Promise<unknown>, isToolInputError);
  } finally { s.restore(); }
});

test("daily cap blocks before a job is started", async () => {
  const s = stub({ states: ["success"], used: 2 });
  try {
    const { ctx } = makeCtx();
    await assert.rejects(() => generateMusic.execute({ prompt: "Noch ein Lied bitte" }, ctx) as Promise<unknown>, isToolInputError);
    assert.equal(s.rows.length, 0);
  } finally { s.restore(); }
});

test("vendor failure becomes a German message without vendor text", async () => {
  const s = stub({ states: ["fail"] });
  try {
    const { ctx, parts } = makeCtx();
    const res = (await generateSpeech.execute({ text: "Hallo" }, ctx)) as { error?: string };
    assert.match(res.error ?? "", /Inhaltsfilter/);
    assert.doesNotMatch(res.error ?? "", /sensitive/);
    assert.equal(parts.length, 0);
  } finally { s.restore(); }
});
