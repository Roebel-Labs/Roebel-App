# Final fix wave report
1. data.ts updateAppManifest: throws invalid_params when app.origin set (covers MCP, PATCH dev + admin). Admin status/featured/budget/decision paths in PATCH don't use it: unaffected.
2. indexPlan.ts: rejected+changed -> update-direct; suspended stays stage-version. Tests changed first (red: 2 failing incl. slugify), then green. IndexedSourceCard: status pending -> "Manifest übernommen — die App ist wieder in Prüfung."
3. manifestFile.ts slugify: <2 chars -> "-app" suffix ("X"->"x-app", "--A--"->"a-app", ""->"app"); tests updated. reviewApp pre-validates pending manifest (indexed + approve) before first update.
4. createVersion accepts manifestHash, inserted in one go; indexing.ts addVersion uses it, second update dropped.
5. submit/route.ts: source only "ai_builder" else "external".
6. dashboard/mini-apps/[id]/page.tsx: ImagesSection hidden for app.origin, hint shown.
7. admin mini-apps page: Update badge dark variant.
Tests: 32 pass, 0 fail. tsc filtered: only data.ts(240) 'm.screenshots' possibly undefined (pre-existing, unchanged expression).
Concern: reviewApp "reset"/reject paths not pre-validated (only approve).
