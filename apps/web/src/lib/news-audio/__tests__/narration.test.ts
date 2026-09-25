// apps/web/src/lib/news-audio/__tests__/narration.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildNarrationText,
  chunkText,
  durationFromFileName,
  htmlToSpeechText,
  narrationFileName,
} from "../narration";

test("htmlToSpeechText keeps paragraphs and decodes entities", () => {
  const html = "<h2>Neu&nbsp;im Hafen</h2><p>Die <strong>Müritz</strong> &amp; der See.</p><ul><li>Eins</li><li>Zwei</li></ul>";
  assert.equal(htmlToSpeechText(html), "Neu im Hafen\n\nDie Müritz & der See.\n\nEins\n\nZwei");
});

test("htmlToSpeechText drops figures and scripts", () => {
  assert.equal(htmlToSpeechText("<p>A</p><figure><img/><figcaption>Foto</figcaption></figure><p>B</p>"), "A\n\nB");
});

test("buildNarrationText adds full stops between title, dek and body", () => {
  const text = buildNarrationText({ title: "Titel", excerpt: "Kurz gesagt", content: "<p>Text.</p>" });
  assert.equal(text, "Titel.\n\nKurz gesagt.\n\nText.");
});

test("chunkText respects the max length and keeps every character", () => {
  const para = "Ein Satz hier. ".repeat(40).trim();
  const text = [para, para, para].join("\n\n");
  const chunks = chunkText(text, 300);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 300, `chunk too long: ${c.length}`);
  assert.equal(chunks.join(" ").replace(/\s+/g, ""), text.replace(/\s+/g, ""));
});

test("duration round-trips through the file name", () => {
  const name = narrationFileName("abc123", 61234.4);
  assert.equal(name, "abc123-61234.mp3");
  assert.equal(durationFromFileName("abc123", name), 61234);
  assert.equal(durationFromFileName("other", name), null);
});
