import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adminConsentUrl, buildMicrosoftAuthUrl, emailFromIdToken, eventTimes, graphSearch, graphUtc, microsoftConfig, microsoftGate, recipients,
} from "./microsoft";

const cfg = { clientId: "cid", clientSecret: "sec", tenant: "common" };

test("config gate: off without both values, tenant defaults to common", () => {
  assert.equal(microsoftConfig({}), null);
  assert.equal(microsoftGate({})?.status, 503);
  assert.deepEqual(microsoftConfig({ MICROSOFT_OAUTH_CLIENT_ID: "a", MICROSOFT_OAUTH_CLIENT_SECRET: "b" }), { clientId: "a", clientSecret: "b", tenant: "common" });
});

test("auth url carries PKCE, offline_access and the mail/calendar scopes", () => {
  const u = new URL(buildMicrosoftAuthUrl(cfg, { redirectUri: "https://x/cb", state: "st", challenge: "ch" }));
  assert.equal(u.host, "login.microsoftonline.com");
  assert.equal(u.pathname, "/common/oauth2/v2.0/authorize");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  const scope = u.searchParams.get("scope") ?? "";
  for (const s of ["offline_access", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite"]) assert.ok(scope.includes(s), s);
});

test("admin consent link asks for Graph permissions only", () => {
  const u = new URL(adminConsentUrl(cfg, "https://x/cb"));
  assert.equal(u.pathname, "/organizations/v2.0/adminconsent");
  assert.ok((u.searchParams.get("scope") ?? "").includes("https://graph.microsoft.com/Mail.Send"));
  assert.ok(!(u.searchParams.get("scope") ?? "").includes("offline_access"));
});

test("id token email, Graph UTC times, search escaping, recipients", () => {
  const tok = `x.${Buffer.from(JSON.stringify({ preferred_username: "leitung@jugendhaus.de" })).toString("base64")}.y`;
  assert.equal(emailFromIdToken(tok), "leitung@jugendhaus.de");
  assert.equal(emailFromIdToken("nope"), null);
  assert.equal(graphUtc("2026-10-01T16:00:00.0000000")?.toISOString(), "2026-10-01T16:00:00.000Z");
  assert.equal(graphSearch('Rechnung "März"'), '"Rechnung  März"');
  assert.ok(!graphSearch('a"b').slice(1, -1).includes('"'));
  assert.deepEqual(recipients(["a@b.de"]), [{ emailAddress: { address: "a@b.de" } }]);
});

test("event times: Berlin wall time to UTC, all-day spans whole days, end before start fails", () => {
  const t = eventTimes("2026-07-01T18:00");
  assert.deepEqual(t.start, { dateTime: "2026-07-01T16:00:00", timeZone: "UTC" }); // CEST = UTC+2
  assert.equal(t.end.dateTime, "2026-07-01T17:00:00");
  assert.equal(t.isAllDay, false);
  const a = eventTimes("2026-12-24", "2026-12-26");
  assert.equal(a.isAllDay, true);
  assert.equal(a.start.dateTime, "2026-12-24T00:00:00");
  assert.equal(a.end.dateTime, "2026-12-27T00:00:00");
  assert.throws(() => eventTimes("2026-07-01T18:00", "2026-07-01T17:00"));
});
