# Design: Event creation for Org accounts + AI recap-and-confirm

Date: 2026-07-01
App: `apps/expo`

## Problem

Organisation accounts cannot discover event creation, and the AI event
flow submits via a swipe gesture without first showing a clean,
structured recap for review. Three requests:

1. Show the illustrated "Veranstaltung erstellen" call-to-action in all
   Org accounts (currently only citizens/aspiring citizens see it).
2. Before submitting, the AI should present a clean, structured,
   highlighted recap of the event and ask for corrections or
   confirmation; on confirmation the existing swipe-to-submit appears.
3. "Meine Veranstaltungen" should be available to org accounts, and org
   admins tapping an event should land on the editable form (not the
   read-only details page).

## Findings from exploration

- The illustrated card ("Veranstaltung einsenden", asset
  `assets/illustration/profile/04.png` → `/submit-event`) lives only in
  `components/profile/ProfileActionGrid.tsx`, rendered for
  citizens/aspiring citizens. Org accounts render
  `components/profile/OrgActionCards.tsx`, which has no event card.
- `/submit-event` (`app/submit-event.tsx`) defaults to `mode='ai'` and
  renders `components/ai/MinimalAIChat.tsx`. So wiring the org card to
  `/submit-event` gives orgs the AI flow directly.
- The AI submit path (`submitEventToSupabase`) already stamps
  `account_id: activeAccount?.id` (`MinimalAIChat.tsx:640`), geocodes,
  inserts, and shows a success screen with a "Meine Veranstaltungen"
  button.
- Requirement 3 is already implemented:
  - `app/my-events.tsx` is in the org profile menu, filters org events
    by `account_id` (`:70-71`), and routes org owner/admin taps to
    `/edit-event/[id]` (`:111-112`), everyone else to `/event/[id]`.
  - `app/edit-event/[id].tsx` is a full editable form gated by
    `getAccountRole` + `canEditEvents`.

So only Parts 1 and 2 require building; Part 3 is verify-only.

## Part 1 — Org create-event card

Add a third grid cell to `components/profile/OrgActionCards.tsx`:

- Label `Veranstaltung\nerstellen` (per user's wording; the citizen card
  says "einsenden").
- Icon `require('../../assets/illustration/profile/04.png')`.
- `onPress` wrapped in `requireAuth`, `router.push('/submit-event')`.
- Top grid becomes 3 cells (Anzeige erstellen · Dienstleistung anbieten ·
  Veranstaltung erstellen); each cell is already `flex: 1`, so it lays
  out as three-across. The wide Ads/Dashboard cards are unchanged.

Rendered for all org accounts via `app/profile.tsx:298` (`isOrg`).

## Part 2 — AI recap card, then confirm-by-message → swipe-to-submit

Today `prepare_event_submission` immediately sets `isReadyToSubmit`,
revealing the swipe-up. Split into two steps.

Flow:

1. **Recap.** When all required fields are gathered, the AI calls
   `prepare_event_submission`. The app stores `pendingEventData` and
   pushes a chat message carrying `eventRecap` data, rendered by a new
   `EventRecapCard` — structured/highlighted, one labeled row per field
   (Titel, Datum/Termine, Zeit, Ort, Kategorie, Preis, Max. Teilnehmer,
   Webseite, Veranstalter; "Bild angehängt" note if an image was
   uploaded). The AI asks: "Passt alles so? Antworte mit 'Ja' zum
   Einsenden – oder sag mir, was ich ändern soll." The text input stays;
   **swipe-up is NOT enabled** (`isReadyToSubmit` stays false).
2. **Correction loop.** If the user requests a change, the AI calls
   `prepare_event_submission` again with updated values → recap card
   re-renders. Repeat until confirmed.
3. **Confirm.** When the user confirms in any message ("Ja"/"passt"/
   "senden"…), the AI calls a new `confirm_event_submission` tool. The
   app enables the existing swipe-up state ("Jetzt einsenden – Wischen
   Sie einfach hoch"). Guarded: only enable if `pendingEventDataRef`
   is set.
4. **Submit.** User swipes up → existing `submitEventToSupabase` runs
   unchanged.

The recap card is display-only (no button); confirmation is by message
then swipe, per the user's chosen flow.

Implementation touches only `components/ai/MinimalAIChat.tsx`:

- Add `eventRecap?: EventRecapData` to the `Message` interface.
- Add an `EventRecapCard` component (StyleSheet + `useTheme()`), fed by
  the structured tool input.
- Add the `confirm_event_submission` tool to `TOOLS`.
- In `sendMessageWithImage`, branch on `toolUseBlock.name`:
  - `prepare_event_submission` → store `pendingEventData`, push a
    message with `eventRecap` + the AI's text; do NOT set
    `isReadyToSubmit`.
  - `confirm_event_submission` → if `pendingEventDataRef.current`, set
    `isReadyToSubmit(true)` + `startIconBounceAnimation()`, push AI text
    ("Super! Wische nach oben, um dein Event einzureichen.").
- Update `buildSystemPrompt` to describe the recap → confirm → swipe
  sequence and when to call each tool.

No changes to `submitEventToSupabase`, DB schema, `my-events.tsx`, or
`edit-event/[id].tsx`.

## Part 3 — Verify org My-Events → edit (verify-only)

Manual run-through as an org admin: create event via the new card →
appears in "Meine Veranstaltungen" → tap → editable form (not
`/event/[id]`) → edit + save. Fix only if broken.

## Non-goals

- No NativeWind (StyleSheet + `useTheme()` only).
- No DB/schema changes.
- No changes to the citizen `ProfileActionGrid`.
- No rework of the edit form or my-events beyond verification.

## Testing / verification

- Org account: profile shows the new "Veranstaltung erstellen" card;
  tapping opens the AI chat.
- AI chat: after required fields, a styled recap card appears with no
  swipe-up; requesting a change updates the card; confirming reveals the
  swipe-up; swiping submits and shows the success screen.
- Org My-Events lists the newly created event; tapping opens the
  editable form; edits save.
