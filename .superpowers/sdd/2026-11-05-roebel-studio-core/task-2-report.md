# Task 2 report
Implemented: types.ts (added Task 2 + template types, no campaignSlug; sponsors = {rotationSeconds, items[]} default {8, []}), reducer.ts (showReducer, initialState, serialize, restore with per-field type guards), store.tsx (StoreProvider/useShow, 500 ms debounced autosave to localStorage['roebel-studio-v1'] + beforeunload flush). Not wired into UI.
RED: test run failed "Failed to load url ../reducer". GREEN: 31/31 tests (15 new), typecheck clean.
Notes: addSource creates a full scene for every kind (not only camera); cut preset leaves fromSceneId null; restore keeps fromSceneId but resets startedAt; presets restored empty -> defaults.
Concerns: none significant.

## Fix round 1
Changes (reducer.ts, store.tsx, reducer.test.ts): per-element validators in restore (non-objects / wrong-typed ids dropped, sourceIds coerced to string[], template.nodes -> array, animIn/animOut -> defaults); restore nulls dangling scene/row ids and resets transition fully (startedAt and fromSceneId null, presetId -> Blende if missing); removeScene shares dropScenes() with removeSource; take/cut no-op when preview is null or equals program, null program = instant cut; setPreview/selectRow ignore unknown ids; localStorage get/set wrapped in try/catch.
Tests added (7): malformed array elements, dangling ids, take/cut no-op, null-program cut, removeScene clears transition, unknown ids ignored, nextRow from null selects row 0.
Command: pnpm --filter @roebel/studio test && pnpm --filter @roebel/studio typecheck
Output: reducer.test.ts 22 passed; all 39 tests passed; typecheck clean.
