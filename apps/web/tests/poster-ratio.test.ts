import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyRatio, RATIO_LABELS } from "../src/lib/poster/ratio";

test("A-format posters within 8 percent are ok", () => {
  assert.equal(classifyRatio(794, 1123), "ok"); // 1.414
  assert.equal(classifyRatio(1080, 1512), "ok"); // 1.400
  assert.equal(classifyRatio(1000, 1333), "ok"); // 1.333 (-5.7 %)
  assert.equal(classifyRatio(1080, 1557), "ok"); // 1.442 (+2 %)
});

test("landscape and square images are flagged", () => {
  assert.equal(classifyRatio(1200, 800), "landscape");
  assert.equal(classifyRatio(498, 436), "landscape");
  assert.equal(classifyRatio(856, 856), "square");
  assert.equal(classifyRatio(1000, 1200), "square"); // 1.2 < 1.25
});

test("portrait outside the band is too short or too tall", () => {
  assert.equal(classifyRatio(1000, 1290), "too_short"); // 1.29 = -8.8 %
  assert.equal(classifyRatio(1080, 2097), "too_tall"); // 1.94
  assert.equal(classifyRatio(774, 1600), "too_tall"); // 2.07
});

test("invalid dimensions throw", () => {
  assert.throws(() => classifyRatio(0, 100));
  assert.throws(() => classifyRatio(100, Number.NaN));
});

test("labels are German and cover every class", () => {
  assert.equal(RATIO_LABELS.ok, "A-Format");
  assert.equal(RATIO_LABELS.landscape, "Querformat");
  assert.equal(Object.keys(RATIO_LABELS).length, 5);
});
