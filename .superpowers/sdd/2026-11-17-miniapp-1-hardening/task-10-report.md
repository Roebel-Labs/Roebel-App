# Task 10 report
Implemented: `USER_TOKEN` section (`## User token`) in devdocs.ts, appended to `getDocsSection("sdk")` and the full llms text; MCP section now says only `nz_` API keys are accepted (rollout wallet fallback removed). publishDoc.ts gets a short `## User token` section plus the nz_ note. No vendor names.
TDD RED: `npx tsx --test tests/miniapp-publish-doc.test.ts tests/miniapp-devdocs.test.ts` -> pass 1, fail 3 (user token section, MCP nz_ wording, publish.md section missing).
GREEN: same command -> pass 4, fail 0; all `tests/miniapp-*.test.ts` -> 84/84 pass.
Files: apps/web/src/lib/miniapp/devdocs.ts, publishDoc.ts, tests/miniapp-publish-doc.test.ts, tests/miniapp-devdocs.test.ts (new).
Notes: the "Wallet-Adresse als Token" doesNotMatch assertion passes trivially (string never existed). publish.md stays under 8000 chars. PUBLISH_API still shows `x-wallet-address` for the publish route (builder route, out of scope per plan follow-ups).
