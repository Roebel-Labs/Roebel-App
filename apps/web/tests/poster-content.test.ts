import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPosterContent,
  contentLines,
  formatGermanDate,
  formatClock,
  formatPriceLine,
} from "../src/lib/poster/content";

test("German long date with weekday", () => {
  assert.equal(formatGermanDate("2026-10-10"), "Samstag, 10. Oktober 2026");
  assert.equal(formatGermanDate("2026-09-25"), "Freitag, 25. September 2026");
  assert.equal(formatGermanDate("nope"), null);
});

test("clock trims seconds and pads", () => {
  assert.equal(formatClock("15:00:00"), "15:00");
  assert.equal(formatClock("9:30"), "09:30");
  assert.equal(formatClock(null), null);
});

test("price line: free, integer, decimal, unknown", () => {
  assert.equal(formatPriceLine(0), "Eintritt frei");
  assert.equal(formatPriceLine("0.00"), "Eintritt frei");
  assert.equal(formatPriceLine(12), "Eintritt 12 €");
  assert.equal(formatPriceLine("12.50"), "Eintritt 12,50 €");
  assert.equal(formatPriceLine(null), null);
  assert.equal(formatPriceLine("abc"), null);
});

test("buildPosterContent assembles lines and collapses whitespace", () => {
  const c = buildPosterContent({
    title: "Konzertsommer  im Bürgergarten",
    date: "2026-09-23",
    time: "19:00:00",
    end_time: "22:00:00",
    location: "Haus des Gastes Str. der Deutschen Einheit 7 17207 Röbel/Müritz",
    category: "Musik",
    ticket_price: "12.00",
    organizer_name: "Haus des Gastes Röbel/Müritz",
    website_url: "https://www.herb-rock.de/",
  });
  assert.equal(c.title, "Konzertsommer im Bürgergarten");
  assert.equal(c.dateLine, "Mittwoch, 23. September 2026");
  assert.equal(c.timeLine, "19:00 bis 22:00 Uhr");
  assert.equal(c.priceLine, "Eintritt 12 €");
  assert.equal(c.websiteLine, "herb-rock.de");
  assert.deepEqual(contentLines(c), [
    "Konzertsommer im Bürgergarten",
    "Mittwoch, 23. September 2026 · 19:00 bis 22:00 Uhr",
    "Haus des Gastes Str. der Deutschen Einheit 7 17207 Röbel/Müritz",
    "Eintritt 12 €",
    "Veranstalter: Haus des Gastes Röbel/Müritz",
    "herb-rock.de",
  ]);
});

test("missing fields are omitted, never invented", () => {
  const c = buildPosterContent({ title: "HEIMSPIEL", time: "15:00:00" });
  assert.equal(c.dateLine, null);
  assert.equal(c.timeLine, "15:00 Uhr");
  assert.deepEqual(contentLines(c), ["HEIMSPIEL", "15:00 Uhr"]);
});
