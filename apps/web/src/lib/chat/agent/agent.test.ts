import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { splitForPhone, validTwilioSignature } from "./channels";
import { mailHtml, mailText, verifySvix } from "./mail";
import { ALIAS_RE, PERSONALITIES } from "./profile";

test("twilio signature: URL plus sorted fields, HMAC-SHA1, base64", () => {
  const url = "https://www.example.org/api/chat/channels/twilio";
  const params = { To: "+4915100000000", From: "+4915111111111", Body: "Hallo", MessageSid: "SM1" };
  const data = url + "BodyHallo" + "From+4915111111111" + "MessageSidSM1" + "To+4915100000000";
  const good = createHmac("sha1", "token").update(data).digest("base64");
  assert.equal(validTwilioSignature("token", url, params, good), true);
  assert.equal(validTwilioSignature("token", url, { ...params, Body: "Hallo!" }, good), false);
  assert.equal(validTwilioSignature("other", url, params, good), false);
  assert.equal(validTwilioSignature("token", url, params, ""), false);
});

test("long answers are split at paragraph or sentence ends", () => {
  const text = `${"Erster Absatz mit etwas Text. ".repeat(12)}\n\n${"Zweiter Absatz. ".repeat(20)}`;
  const parts = splitForPhone(text, 300);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 300));
  assert.equal(splitForPhone("Kurz.", 300).length, 1);
});

test("mail rendering escapes HTML and drops wiki links and citations", () => {
  const md = "## Heute\n- **Jetzt handeln:** <script>x</script> siehe [Projekte](wiki:projects)[[2]]\n\nMehr unter [hier](https://example.org/a).";
  const html = mailHtml(md);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<strong>Jetzt handeln:<\/strong>/);
  assert.match(html, /href="https:\/\/example\.org\/a"/);
  assert.doesNotMatch(html, /wiki:|\[\[2\]\]/);
  assert.equal(mailText("Siehe [Projekte](wiki:projects)[[1]] und **das**."), "Siehe Projekte und das.");
});

test("svix verification rejects a wrong signature and a stale timestamp", () => {
  const secret = `whsec_${Buffer.from("geheim").toString("base64")}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from("geheim")).update(`id.${ts}.{}`).digest("base64");
  assert.equal(verifySvix(secret, "id", ts, "{}", `v1,${sig}`), true);
  assert.equal(verifySvix(secret, "id", ts, "{ }", `v1,${sig}`), false);
  assert.equal(verifySvix(secret, "id", String(Number(ts) - 3600), "{}", `v1,${sig}`), false);
});

test("aliases and personalities", () => {
  assert.equal(ALIAS_RE.test("mecky-a1b2c"), true);
  assert.equal(ALIAS_RE.test("-x"), false);
  assert.equal(ALIAS_RE.test("Max"), false);
  assert.ok(PERSONALITIES.some((p) => p.key === "standard" && p.prompt === ""));
});
