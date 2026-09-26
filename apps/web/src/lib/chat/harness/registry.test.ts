import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { allTools, enableKeyFor, isAwaitingApproval, selectTools } from "./registry";
import { grantableFrom } from "./grants";
import { ROEBEL_TENANT } from "./tenants";
import type { HarnessContext, HarnessTool } from "./types";

const ctx = (over: Partial<HarnessContext> = {}): HarnessContext => ({
  tenant: ROEBEL_TENANT, wallet: "0xabc", profile: null, threadId: "t", botId: "b", taskId: null,
  emitPart: () => {}, ...over,
});

const mk = (name: string, pack: HarnessTool["pack"], risk: HarnessTool["risk"], extra: Partial<HarnessTool> = {}): HarnessTool => ({
  name, pack, risk, description: `${name}. Mehr.`, inputSchema: z.object({}),
  summarize: () => name, execute: async () => ({}), ...extra,
});

const fake = [
  mk("list_events", "roebel", "read"),
  mk("my_profile", "user", "private"),
  mk("remember", "memory", "private"),
  mk("fetch_url", "web", "read"),
  mk("ask_options", "chat", "private"),
  mk("write_file", "chat", "private"),
  mk("create_routine", "chat", "private", { available: (c) => !c.turn?.routineRun }),
  mk("request_calendar_access", "chat", "private", { available: (c) => !c.turn?.calendarContext }),
  mk("note_to_team", "actions", "public"),
  mk("org_only", "roebel", "read", { available: (c) => Boolean(c.profile?.orgs.length) }),
];
const names = (ts: HarnessTool[]) => ts.map((t) => t.name).sort();

test("enableKeyFor: legacy keys map to chat tools, packs use their pack name", () => {
  assert.equal(enableKeyFor({ name: "write_file", pack: "chat" }), "files");
  assert.equal(enableKeyFor({ name: "create_routine", pack: "chat" }), null);
  assert.equal(enableKeyFor({ name: "note_to_team", pack: "actions" }), "actions_test");
  assert.equal(enableKeyFor({ name: "list_events", pack: "roebel" }), "roebel");
});

test("selectTools: only what the bot enables; routines always on", () => {
  const got = selectTools(fake, ["files", "roebel"], ctx(), { gatedOffered: true });
  assert.deepEqual(names(got), ["create_routine", "list_events", "write_file"]);
  assert.ok(names(selectTools(fake, ["calendar"], ctx(), { gatedOffered: true })).includes("request_calendar_access"));
});

test("selectTools: available() filters (routine run, calendar shared, org owner)", () => {
  const keys = ["roebel", "files"];
  const inRoutine = selectTools(fake, keys, ctx({ turn: { routineRun: true, calendarContext: [] } }), { gatedOffered: true });
  assert.ok(!names(inRoutine).includes("create_routine"));
  assert.ok(!names(inRoutine).includes("request_calendar_access"));
  const withOrg = selectTools(fake, keys, ctx({ profile: { displayName: null, username: null, isCitizen: false, orgs: [{ id: "o", name: "SV", role: "owner", kind: "verein" }] } }), { gatedOffered: true });
  assert.ok(names(withOrg).includes("org_only"));
});

test("selectTools: gated tools need their key AND the policy offering them", () => {
  assert.ok(!names(selectTools(fake, ["roebel"], ctx(), { gatedOffered: true })).includes("note_to_team"));
  assert.ok(names(selectTools(fake, ["actions_test"], ctx(), { gatedOffered: true })).includes("note_to_team"));
  assert.ok(!names(selectTools(fake, ["actions_test"], ctx(), { gatedOffered: false })).includes("note_to_team"));
});

test("grantableFrom: only public/external tools the bot has, never money", () => {
  const withMoney = [...fake, mk("transfer_muenzen", "money", "money")];
  assert.deepEqual(grantableFrom(withMoney, ["roebel", "money"]), []);
  assert.deepEqual(grantableFrom(withMoney, ["actions_test", "money"]), [{ tool: "note_to_team", label: "note_to_team.", risk: "public" }]);
});

test("real registry: built-in tools registered once with unique snake_case names", () => {
  const tools = allTools();
  const n = tools.map((t) => t.name);
  for (const expected of ["ask_options", "write_file", "update_file", "propose_calendar_event", "request_calendar_access",
    "create_routine", "list_routines", "delete_routine", "remember", "recall", "forget", "note_to_team"]) {
    assert.ok(n.includes(expected), expected);
  }
  assert.equal(new Set(n).size, n.length);
  assert.equal(tools.find((t) => t.name === "note_to_team")?.risk, "public");
});

test("isAwaitingApproval", () => {
  assert.equal(isAwaitingApproval({ status: "awaiting_approval", actionId: "x", note: "" }), true);
  assert.equal(isAwaitingApproval({ ok: true }), false);
  assert.equal(isAwaitingApproval("text"), false);
});
