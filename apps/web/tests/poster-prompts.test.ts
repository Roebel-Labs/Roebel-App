import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReformatPrompt, buildDesignPrompt } from "../src/lib/poster/prompts";
import { buildPosterCopyPrompt, normalizePosterCopy } from "../src/lib/poster/copy";
import { buildPosterContent } from "../src/lib/poster/content";
import { pickDirections } from "../src/lib/poster/directions";
import type { PosterAnalysis } from "../src/lib/poster/types";

const analysis: PosterAnalysis = {
  kind: "screenshot", hasEventInfo: true,
  visibleText: ["Saisonabschluss", "Freitag, 25. September", "Eintritt FREI"],
  hasUiChrome: true, brandColors: ["#1a73e8", "#f5c400"], styleNotes: "blaue Wellen", quality: "ok",
};

test("reformat prompt keeps texts verbatim and strips chrome", () => {
  const [dir] = pickDirections("reformat", null);
  const p = buildReformatPrompt(analysis, dir, "Logo größer");
  assert.match(p, /Screenshot/);
  assert.match(p, /„Saisonabschluss“ \/ „Freitag, 25\. September“ \/ „Eintritt FREI“/);
  assert.match(p, /Wort für Wort/);
  assert.match(p, /Originaltreu/);
  assert.match(p, /Logo größer/);
  assert.match(p, /1:1,414/);
  assert.doesNotMatch(p, /erkennbaren Gesichtern/);
});

test("design prompt lists the deterministic lines and the reference rule", () => {
  const content = buildPosterContent({
    title: "HEIMSPIEL", date: "2026-10-10", time: "15:00:00", location: "Friesensportplatz",
    ticket_price: 3, organizer_name: "PSV Röbel/Müritz e. V.", category: "Sport",
  });
  const [a, b] = pickDirections("design", "Sport");
  const p = buildDesignPrompt(content, { subline: "Herren · Kreisoberliga", highlights: [] }, a, {
    hasReference: true, referenceKind: "logo",
  });
  assert.match(p, /- HEIMSPIEL\n- Samstag, 10\. Oktober 2026 · 15:00 Uhr\n- Friesensportplatz\n- Eintritt 3 €/);
  assert.match(p, /Logo des Veranstalters/);
  assert.match(p, /Herren · Kreisoberliga/);
  assert.match(p, /Plakativ/);
  assert.match(p, /erkennbaren Gesichtern/);
  const noRef = buildDesignPrompt(content, null, b, { hasReference: false });
  assert.match(noRef, /kein Referenzbild/);
  assert.match(noRef, /Editorial/);
});

test("copy prompt carries the description and normalizer clamps and dedupes", () => {
  const content = buildPosterContent({ title: "Konzert", description: "Popmusik von Herzen.\r\nEintritt frei." });
  const prompt = buildPosterCopyPrompt({ title: "Konzert", description: "Popmusik von Herzen." }, content);
  assert.match(prompt, /Popmusik von Herzen/);
  const copy = normalizePosterCopy(
    { subline: "  Popmusik von Herzen  ", highlights: ["Konzert", "Solos & Duette", "Solos & Duette", "x".repeat(80), "extra", "more"] },
    content,
  );
  assert.equal(copy.subline, "Popmusik von Herzen");
  assert.deepEqual(copy.highlights, ["Solos & Duette", "x".repeat(40), "extra"]);
});
