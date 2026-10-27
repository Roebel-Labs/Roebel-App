# Personalised UI: Erkunden layout, Darstellung, Mecky proposals

Date: 2026-10-27 · Status: built (Expo), not yet OTA'd

## Why

Users asked to customise the Röbel App. The long-term idea is that people (and AI
agents via index.roebel.app) can shape the UI on request. We deliberately do
**not** let an AI regenerate the app: civic surfaces must look the same for every
citizen, neighbours must be able to explain the app to each other, and nobody can
QA a different generated app per person. Instead the UI is a **constrained layout
layer**: data, not code. Toggles edit it, presets fill it, Mecky proposes changes
to it, and genuinely new UI arrives as sandboxed mini apps that can be pinned
into it.

## What exists

- **Block registry** — `apps/expo/lib/explore-layout.ts`. Erkunden below the fixed
  search bar + category chips is a list of registered blocks (`hero`, `this_week`,
  `all_events`, `nearby_events`, `movies`, `audio`, `mini_apps`, `marketplace`,
  `news`, `restaurants`, `businesses`) plus pinned mini apps (`miniapp:<slug>`).
  Every id is validated; unknown ids are dropped.
- **Locked blocks** — `locked: true` blocks can be moved but never hidden. None are
  locked today (Erkunden has no civic block yet). Any future votes/official-notice
  block MUST be locked.
- **Three layers** — code default → server default (`app_settings.explore_layout`)
  → the user's override (device-local AsyncStorage, `explore.layout.v1`). Blocks
  added in a later release are inserted after their predecessor in the default,
  so saved layouts never lose new blocks.
- **Presets** — Standard, Übersichtlich, Veranstaltungen zuerst, Neu in Röbel (code).
  Server presets with the same id override, new ids are appended. Pinned mini apps
  survive preset changes.
- **Gateways** — "Erkunden anpassen" button at the end of Erkunden, and
  Profil → **Darstellung** (`app/settings/darstellung.tsx`): theme, Mecky hand-off,
  presets, block list (up/down + show/hide), pin/unpin mini apps, reset.
- **Mecky** — tools `getExploreLayout` and `proposeExploreLayout` (client-side, in
  `lib/tools/mecky-tools.ts`). The proposal renders as `LayoutProposalCard` and is
  saved only when the user taps "Übernehmen". The card re-sanitises the proposal.
  `/messages/mecky?intent=layout` opens a fresh chat that starts the conversation.

## Server default format (`app_settings.explore_layout`)

```json
{
  "default": { "order": ["hero", "this_week", "news"], "hidden": ["movies"] },
  "presets": [
    { "id": "markttag", "label": "Markttag", "description": "…", "order": ["marketplace"], "hidden": [] }
  ]
}
```

Partial orders are fine (missing blocks are appended in code-default position).
Malformed JSON falls back to code defaults. Changing it needs no app update.

## Decisions made while building (check these)

- Layout is **device-local**, not synced: works for guests, needs no migration,
  leaves no server-side profile of what someone hides. Cross-device sync would be
  a later `user_ui_prefs` table (owner-only RLS).
- Up/down buttons instead of drag-and-drop: accessible, no new dependency.
- Hidden blocks still prefetch their queries on Erkunden (unchanged network
  behaviour); gating queries by visibility is a possible later optimisation.
- Mecky only edits Erkunden blocks. Tabs, profile and other screens are not part of
  the layout layer yet.

## Next

1. Admin UI for `explore_layout` in the web dashboard (today: set the row via SQL).
2. Community presets shared via index.roebel.app (a preset is the same JSON).
3. Agent-built mini apps (existing miniapp-sdk + /editor + MCP) → pinnable blocks;
   Mecky could propose pinning one.
4. A locked civic block ("Aktuelle Abstimmungen") on Erkunden.
