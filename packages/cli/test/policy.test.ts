import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderNostrPolicyAwk, renderNostrPolicyWrapper, renderBundle } from "../src/render.js";
import { RSYNC_DELETE_EXCLUDES } from "../src/executor.js";

// The rendered write policy is run with /usr/bin/awk (BWK on macOS — the same
// POSIX subset busybox awk offers on the node), over strfry-shaped input lines.

const roebel = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../protocol/examples/roebel.netizen.json", import.meta.url)),
    "utf8",
  ),
);

const hex = (c: string) => c.repeat(64);
const MEMBER = hex("a");
const CITIZEN = hex("b");
const AUTHORITY = hex("c");
const STRANGER = hex("d");

let seq = 0;
function line(pubkey: string, kind: number, receivedAt = 1_800_000_000, content = "hi"): string {
  const id = (++seq).toString(16).padStart(64, "0");
  const event = { id, pubkey, created_at: receivedAt, kind, tags: [], content, sig: "e".repeat(128) };
  return JSON.stringify({ type: "new", event, receivedAt, sourceType: "IP4", sourceInfo: "127.0.0.1" });
}

function run(lines: string[], agents = ""): { action: string; msg?: string }[] {
  const dir = mkdtempSync(join(tmpdir(), "policy-"));
  writeFileSync(join(dir, "policy.awk"), renderNostrPolicyAwk(roebel));
  writeFileSync(join(dir, "members.txt"), `# members\n${MEMBER}\n${CITIZEN.toUpperCase()}\n`);
  writeFileSync(join(dir, "citizens.txt"), `${CITIZEN}\n`);
  writeFileSync(join(dir, "publisher-keys.txt"), `# publisher\n${AUTHORITY}\n`);
  const args = [
    "-v", `MEMBERS=${join(dir, "members.txt")}`,
    "-v", `CITIZENS=${join(dir, "citizens.txt")}`,
    "-v", `AUTHORITIES=${join(dir, "publisher-keys.txt")}`,
  ];
  if (agents) args.push("-v", `AGENTS=${agents}`);
  args.push("-f", join(dir, "policy.awk"));
  const r = spawnSync("/usr/bin/awk", args, { input: lines.join("\n") + "\n", encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = r.stdout.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(out.length, lines.length, "one reply per input line");
  return out;
}

const one = (l: string, agents = "") => run([l], agents)[0];

test("member kind 1 is accepted", () => {
  assert.equal(one(line(MEMBER, 1)).action, "accept");
});

test("non-member is rejected with the members message", () => {
  const r = one(line(STRANGER, 1));
  assert.equal(r.action, "reject");
  assert.match(r.msg!, /^blocked: only .+ members may publish/);
});

test("member may not sign an authority kind; the publisher key may", () => {
  const r = one(line(MEMBER, 32108));
  assert.equal(r.action, "reject");
  assert.equal(r.msg, "blocked: kind reserved for the community record");
  assert.equal(one(line(AUTHORITY, 32108)).action, "accept");
});

test("declared agent keys count as authorities", () => {
  const agent = hex("f");
  assert.equal(one(line(agent, 32108), agent).action, "accept");
});

test("member kind outside the allow-list is rejected", () => {
  const r = one(line(MEMBER, 4));
  assert.equal(r.action, "reject");
  assert.equal(r.msg, "blocked: kind not accepted here");
});

test("kind 11 needs the citizens list", () => {
  const r = one(line(MEMBER, 11));
  assert.equal(r.action, "reject");
  assert.equal(r.msg, "blocked: citizens only");
  assert.equal(one(line(CITIZEN, 11)).action, "accept");
});

test("the 21st event in a burst is rate-limited; authorities are exempt", () => {
  const burst = Array.from({ length: 21 }, () => line(MEMBER, 1));
  const out = run(burst);
  assert.ok(out.slice(0, 20).every((r) => r.action === "accept"));
  assert.equal(out[20].action, "reject");
  assert.equal(out[20].msg, "rate-limited: slow down");

  const auth = run(Array.from({ length: 30 }, () => line(AUTHORITY, 32100)));
  assert.ok(auth.every((r) => r.action === "accept"));
});

test("the bucket refills at 120/hour from receivedAt", () => {
  const t0 = 1_800_000_000;
  const lines = Array.from({ length: 20 }, () => line(MEMBER, 1, t0));
  lines.push(line(MEMBER, 1, t0 + 10)); // 10 s * 120/3600 = 0.33 token → reject
  lines.push(line(MEMBER, 1, t0 + 40)); // +1 token by now → accept
  const out = run(lines);
  assert.equal(out[20].action, "reject");
  assert.equal(out[21].action, "accept");
});

test("an oversize event is rejected", () => {
  const r = one(line(MEMBER, 1, 1_800_000_000, "x".repeat(70_000)));
  assert.equal(r.action, "reject");
  assert.equal(r.msg, "blocked: event too large");
});

test("the wrapper passes every list path; the bundle ships citizens.txt and keeps it on deploy", () => {
  const w = renderNostrPolicyWrapper();
  assert.match(w, /-v MEMBERS=\/etc\/strfry\/members\.txt/);
  assert.match(w, /-v CITIZENS=\/etc\/strfry\/citizens\.txt/);
  assert.match(w, /-v AUTHORITIES=\/etc\/strfry\/publisher-keys\.txt/);
  const b = renderBundle(roebel);
  assert.ok(b.files["strfry-policy/citizens.txt"]);
  assert.match(b.files["docker-compose.yml"], /CITIZENS_PATH: "\/etc\/strfry\/citizens\.txt"/);
  assert.ok(RSYNC_DELETE_EXCLUDES.includes("--exclude=strfry-policy/citizens.txt"));
  assert.ok(RSYNC_DELETE_EXCLUDES.includes("--exclude=strfry-policy/publisher-keys.txt"));
});
