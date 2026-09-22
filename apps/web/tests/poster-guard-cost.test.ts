import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedReferenceUrl } from "../src/lib/poster/reference-guard";
import { estimateCostUsd } from "../src/lib/poster/cost";

const BASE = "https://wwbeqhkslxdxhktqzqti.supabase.co";

test("only public storage objects on our Supabase host pass", () => {
  assert.equal(isAllowedReferenceUrl(`${BASE}/storage/v1/object/public/images/event-images/a.jpg`, BASE), true);
  assert.equal(isAllowedReferenceUrl(`${BASE}/storage/v1/object/public/news-images/b.jpeg`, BASE), true);
  assert.equal(isAllowedReferenceUrl(`http://wwbeqhkslxdxhktqzqti.supabase.co/storage/v1/object/public/images/a.jpg`, BASE), false);
  assert.equal(isAllowedReferenceUrl("https://evil.example/storage/v1/object/public/images/a.jpg", BASE), false);
  assert.equal(isAllowedReferenceUrl(`${BASE}/rest/v1/events`, BASE), false);
  assert.equal(isAllowedReferenceUrl("not a url", BASE), false);
  assert.equal(isAllowedReferenceUrl(`${BASE}/storage/v1/object/public/images/a.jpg`, undefined), false);
});

test("cost follows the published token rates", () => {
  // Measured probe: 342 text in, 1512 image in, 2010 image out → $0.0741
  const usd = estimateCostUsd({
    input_tokens: 1854,
    input_tokens_details: { image_tokens: 1512, text_tokens: 342 },
    output_tokens: 2010,
    output_tokens_details: { image_tokens: 2010, text_tokens: 0 },
  });
  assert.equal(usd, 0.0741);
  assert.equal(estimateCostUsd(null), 0);
  // Without details every input token is billed as image input (upper bound)
  assert.equal(estimateCostUsd({ input_tokens: 1000, output_tokens: 0 }), 0.008);
});
