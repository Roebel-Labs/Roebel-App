# Business-Owner Onboarding Path — Design

**Date:** 2026-06-27
**App:** `apps/expo`
**Status:** Approved design, pending implementation plan

## Problem

The Expo first-run onboarding ([welcome/role.tsx](../../../apps/expo/app/welcome/role.tsx))
asks the user to choose between two personal roles:

- **Bürger:in** — "Ich wohne in Röbel."
- **Tourist:in** — "Ich besuche Röbel."

A founder whose **company is located in Röbel but who is not a resident** fits
neither: they are not a citizen and not a tourist. They have no path that describes
them, and no nudge toward the thing they actually need — registering their business.

A flat third "business owner" card also collides two independent facts into one
single-select choice — *the company is in Röbel* and *is the founder personally a
resident* — which breaks for the common "I'm a Röbel citizen **and** I run a
business" case. The design resolves this with a **two-step** selection.

## Key architectural context

The app already separates two orthogonal concepts:

1. **Personal role** — `users.preferred_role` (`'buerger' | 'tourist'`). Set during
   onboarding. **Informational only** — it tailors which features get highlighted.
   It does *not* affect the verified `tier` (citizenship is a separate NFT tier).
2. **Organizations** — a full `Account` system ([create-org wizard](../../../apps/expo/app/create-org/))
   supporting org sub-types incl. `unternehmen` (Gewerbe), `restaurant`, `verein`,
   etc. A person can own one or more org accounts independent of their personal role.

## Role / citizenship / org are independent (verified in code)

A person is **one wallet** with one personal account (which *gains* citizen status
when it holds the CitizenNFT) plus zero or more org accounts. There is **no separate
"citizen account"** — citizenship is a verified `tier` *on* the personal account.

| Concept | Driven by | Affected by `preferred_role`? |
|---|---|---|
| Citizenship (`tier === 'citizen'`) | Holding the CitizenNFT — auto-upgrades in [UserContext.tsx:207](../../../apps/expo/context/UserContext.tsx) | **No** |
| Org ownership | `account_owners` row created at org creation | **No** |
| `preferred_role` | The onboarding card | — informational only |

Consequence: a citizen who runs a business keeps both — the org is owned by their
wallet forever, citizenship comes from the NFT, and the existing "Account wechseln"
switcher ([profile.tsx:139](../../../apps/expo/app/profile.tsx)) toggles between the
personal account and the business once they own 2+ accounts. **Nothing needs
reconnecting — both are already attached to the same wallet.**

## Decisions (locked)

| Decision | Choice |
|---|---|
| Approach | **Two-step**: pick "Unternehmen", then declare the *person* as Bürger:in or Extern |
| Step-2 UI | **Inline reveal** on the same role screen |
| Role scope | **Business only** — pre-selects org sub-type `unternehmen` |
| Post-onboarding behavior | **Route into the create-org wizard** after consent |
| Skippable? | **Yes** — "Später erledigen"; skip lands user in the app |
| Skip fallback CTA | Persistent **"Unternehmen anlegen"** card on the **profile screen** |
| Citizen-founder path | Captured at the source: Unternehmen→Bürger:in ⇒ `buerger` ⇒ citizen path works automatically. No separate nudge patch needed. |
| Navigation | **User can always go back** at every step — never trapped (see §4a) |

## Design

### 1. `preferred_role` values and their meaning

Add `'unternehmer'` to the union. Final taxonomy:

| Value | Means | Citizen path shown? |
|---|---|---|
| `buerger` | **Resident** of Röbel (whether or not they own a business) | ✅ yes |
| `tourist` | **Non-resident visitor**, no local business | — |
| `unternehmer` | **External (non-resident) business owner** — has a Röbel business but does not live there | ❌ no (not a resident → not CitizenNFT-eligible; correct) |

- **Type sources:** `PreferredRole` in
  [WelcomeWizardContext.tsx](../../../apps/expo/context/WelcomeWizardContext.tsx)
  and the `preferred_role` field of `UserRecord` in
  [lib/types.ts](../../../apps/expo/lib/types.ts).
- **Database:** `users.preferred_role` is a free `text` column with no enum
  constraint ([20260421_user_onboarding.sql](../../../supabase/migrations/20260421_user_onboarding.sql)).
  **No migration required.** Update the column comment to document the new value.
- **Persistence:** `updateUserOnboarding()` in
  [lib/supabase-users.ts](../../../apps/expo/lib/supabase-users.ts) already passes
  `preferredRole` through generically — extend its inline type to allow
  `'unternehmer'`; no other change.

### 2. Two-step role selection (inline reveal)

In [welcome/role.tsx](../../../apps/expo/app/welcome/role.tsx):

- **Step 1 — three cards:** Bürger:in / Tourist:in / **Unternehmen**
  - Card "Unternehmen" label: **"Unternehmen"**, description e.g. **"Ich habe ein
    Unternehmen in Röbel."** Needs a business/org icon.
- **Step 2 — inline reveal, only when "Unternehmen" is selected:** a sub-question
  *"Und du selbst?"* with two choices:
  - **Bürger:in in Röbel** (resident) ⇒ `preferred_role = 'buerger'`
  - **Extern** ("Ich wohne nicht in Röbel") ⇒ `preferred_role = 'unternehmer'`
- The **Weiter** button stays disabled until: a Step-1 card is chosen **and**, if
  that card is "Unternehmen", a Step-2 answer is chosen.

Mapping summary:

| Path | `preferred_role` | `representsBusiness` (wizard flag) |
|---|---|---|
| Bürger:in | `buerger` | false |
| Tourist:in | `tourist` | false |
| Unternehmen → Bürger:in | `buerger` | **true** |
| Unternehmen → Extern | `unternehmer` | **true** |

### 3. Wizard state: `representsBusiness`

Routing into the org flow keys off the **Step-1 "Unternehmen" choice**, *not*
`preferred_role` (because Unternehmen→Bürger:in maps to `buerger`, indistinguishable
from a plain Bürger by role alone).

Add a transient `representsBusiness: boolean` to the
[WelcomeWizardContext](../../../apps/expo/context/WelcomeWizardContext.tsx) reducer
state, set true when "Unternehmen" is selected (and cleared if the user switches to
Bürger:in/Tourist:in). It drives the consent-step branch below. It does **not** need
to be persisted to the DB.

### 4. Onboarding flow branch

Current: `index → name → role → consent → app`

New (only when `representsBusiness`): `index → name → role → consent →
create-org (onboarding mode) → app`

Consent stays first (DSGVO — no account exists before it). In
[welcome/consent.tsx](../../../apps/expo/app/welcome/consent.tsx), **on the accept
path only**, after `updateUserOnboarding` persists the role and the personal account
exists: if `representsBusiness` is true, navigate into the create-org wizard in
onboarding mode instead of routing straight to the app. The **decline path is
unchanged**.

### 4a. Navigation — always allow back (no traps)

Every screen in the flow must expose a working back affordance; the user is never
locked into a step.

| At | Back goes to |
|---|---|
| Role screen (Step 1) | Previous onboarding step (name) |
| Role Step-2 inline reveal | Step-1 cards stay visible and re-selectable. Choosing a different card **clears `representsBusiness`** and collapses Step 2. Back from the role screen still returns to name. |
| Consent | Role screen (selection preserved) |
| Create-org **first** step (onboarding mode) | **Exits to the app home** (equivalent to "Später erledigen"). It must **not** return to consent — the account is already created and consent already accepted. |
| Create-org subsequent steps | Previous wizard step |

The existing create-org wizard already supports back between steps; the new
requirement is (a) the Step-2 reveal is reversible and (b) the create-org
first-step back in onboarding mode exits to the app instead of dead-ending.

### 5. Create-org "onboarding mode"

Pass an `onboarding=1` route param into the
[create-org wizard](../../../apps/expo/app/create-org/). In this mode it:

- **Pre-selects `sub_type: 'unternehmen'`** (skips/pre-fills the type step).
- Leaves the **"external org" toggle OFF** — the company is *in* Röbel; person-extern
  is a different axis and must not be conflated with org-external.
- Shows a **"Später erledigen"** skip affordance throughout.
- On **completion OR skip**, routes to the **app home** — not back to the screen
  create-org is normally launched from.

### 6. Skip fallback: profile CTA

When a founder skips, surface a path to finish later on the **profile screen**
([profile.tsx](../../../apps/expo/app/profile.tsx)):

- **External founders** (`preferred_role === 'unternehmer'`): show a persistent
  **"Unternehmen anlegen"** CTA when they own no `organisation` account. Auto-hides
  once an org exists. (Derive owned accounts from
  [AccountContext.tsx](../../../apps/expo/context/AccountContext.tsx).)
- **Resident founders** (`preferred_role === 'buerger'`): they are covered by the
  **existing** `showBusinessRegister = isCitizen && !isBusinessOwner && !orgAccount`
  button ([profile.tsx:124](../../../apps/expo/app/profile.tsx)) once they verify as
  a citizen — no new CTA needed. (Accepted minor gap: a not-yet-verified resident
  founder who skipped sees the citizen path first; the business button appears after
  verification.)

### 7. Audit existing `preferred_role` consumers

Ensure `'unternehmer'` is handled and never mistaken for Bürger/Tourist:

- [profile.tsx](../../../apps/expo/app/profile.tsx) — `wantsToBeCitizen ===
  'buerger'` is correctly false for `unternehmer` (no citizen nudge). **Add an
  `unternehmer` profile view branch** so an external founder gets a sensible default
  (their business CTA + neutral header) instead of falling through to the Tourist
  view. Confirm `isAspiringCitizen` logic is unaffected.
- [RoleBadge.tsx](../../../apps/expo/components/RoleBadge.tsx) — the `buerger`-only
  "Nicht verifiziert" branch must not trigger for `unternehmer`; show a neutral/
  business-appropriate badge (or none).

## Edge cases

- **Resident who runs a business** (Unternehmen→Bürger:in): tagged `buerger`, gets
  the citizen path automatically, and still goes through org creation. Solved at the
  source by the two-step — no workaround.
- **External founder later becomes a resident:** would need to change their role.
  There is currently **no post-onboarding role editor** (the onboarding "du kannst es
  später ändern" copy is aspirational). Treated as a **separate, deferred gap** —
  out of scope here.
- **External founder is never CitizenNFT-eligible:** correct — they are not a Röbel
  resident, so withholding the citizen nudge is intended behavior, not a bug.

## Out of scope (YAGNI)

- A general "change `preferred_role` after onboarding" settings editor.
- Broadening the business path to non-business orgs (Verein/restaurant) — they keep
  the normal create-org entry point.
- Any change to verified tiers, NFTs, or governance.
- Home-screen CTA surface (profile only).
- Web app onboarding (the Citizen/Tourist choice is Expo-only today).

## Touched files (summary)

| File | Change |
|---|---|
| [WelcomeWizardContext.tsx](../../../apps/expo/context/WelcomeWizardContext.tsx) | Add `'unternehmer'` to `PreferredRole`; add transient `representsBusiness` state + action |
| [lib/types.ts](../../../apps/expo/lib/types.ts) | Add `'unternehmer'` to `preferred_role` type |
| [lib/supabase-users.ts](../../../apps/expo/lib/supabase-users.ts) | Widen `updateUserOnboarding` `preferredRole` param to include `'unternehmer'` |
| [welcome/role.tsx](../../../apps/expo/app/welcome/role.tsx) | Third "Unternehmen" card + inline Bürger:in/Extern reveal; set role + `representsBusiness` |
| [welcome/consent.tsx](../../../apps/expo/app/welcome/consent.tsx) | Branch accept path into create-org when `representsBusiness` |
| [create-org/](../../../apps/expo/app/create-org/) wizard | `onboarding` mode: pre-select `unternehmen`, external toggle off, skip affordance, route to home on finish/skip |
| [profile.tsx](../../../apps/expo/app/profile.tsx) | `unternehmer` profile view + "Unternehmen anlegen" CTA (external founders); audit `preferred_role` branches |
| [RoleBadge.tsx](../../../apps/expo/components/RoleBadge.tsx) | Handle `unternehmer` (neutral/business badge, not the buerger branch) |
| [20260421_user_onboarding.sql](../../../supabase/migrations/20260421_user_onboarding.sql) | Update column comment to document `'unternehmer'` (doc only, no migration) |
