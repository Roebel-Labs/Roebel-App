import { test } from "node:test";
import assert from "node:assert/strict";
import { MINI_APP_TEMPLATES, getTemplate, templateSummary } from "./index";
import { MINI_APP_CATEGORIES, MINI_APP_PERMISSIONS } from "../ai/manifest";
import { SDK_ESM_URL } from "../ai/htmlPrompt";

test("template ids are unique and resolvable", () => {
  const ids = MINI_APP_TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.equal(getTemplate(id)?.id, id);
  assert.equal(getTemplate("nope"), null);
});

for (const t of MINI_APP_TEMPLATES) {
  test(`template ${t.id} follows the app contract`, () => {
    const h = t.html;
    assert.ok(h.startsWith("<!doctype html>"), "starts with doctype");
    assert.ok(h.includes(SDK_ESM_URL), "pinned SDK import");
    assert.ok(h.includes("sdk.actions.ready()"), "calls ready()");
    assert.ok(h.includes("__NETIZEN_PREVIEW_STATE__"), "honours preview states");
    assert.ok(!h.includes("{APP_NAME}"), "title replaced");
    assert.ok(/<\/html>\s*<!--NOTES: [^]+-->$/.test(h), "ends with NOTES comment");
    const screens = [...h.matchAll(/<section data-screen="([a-z0-9-]+)"/g)].map((m) => m[1]);
    assert.ok(screens.length >= 1 && screens.length <= 6, "1-6 screens");
    assert.equal((h.match(/<section data-screen="[^"]+"[^>]*class="active"/g) ?? []).length, 1, "exactly one active screen");
    for (const m of h.matchAll(/data-goto="([a-z0-9-]+)"/g)) assert.ok(screens.includes(m[1]), `nav target ${m[1]} exists`);
    assert.ok(!/0x[0-9a-fA-F]{40}/.test(h), "no wallet addresses");
    assert.ok(!/\bCRC\b|Circles/.test(h), "no Circles jargon");
    assert.ok(MINI_APP_CATEGORIES.includes(t.manifest.category));
    for (const p of t.manifest.permissions) assert.ok(MINI_APP_PERMISSIONS.includes(p));
    if (h.includes("grantReward")) assert.ok(t.manifest.permissions.includes("rewards"), "rewards permission declared");
    for (const c of t.cms) assert.ok(h.includes(`content("${c.key}"`), `CMS key ${c.key} is read`);
    assert.ok(t.thumbnailSvg.startsWith("<svg") && t.thumbnailSvg.includes('viewBox="0 0 320 180"'));
    const s = templateSummary(t);
    assert.equal("html" in s, false);
  });
}
