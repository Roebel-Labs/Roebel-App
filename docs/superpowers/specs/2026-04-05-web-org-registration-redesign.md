# Web App — Org Registration Flow Redesign

## Context

The web app's current business registration at `/app/gewerbe/erstellen` is a basic 3-step form (Grunddaten → Kontakt → Bilder) with raw HTML inputs and simple numbered circle indicators. It lacks the polish and guided experience of modern onboarding flows. This redesign replaces it with an Airbnb-inspired full-screen wizard that matches the visual quality of the Expo app's org creation flow while adapting the layout for web/desktop.

**Goal:** A premium, full-screen multi-step registration wizard that guides business owners through registration with confidence and clarity, ending with a CTA to create their first ad and a dedicated status page for tracking approval.

## Design Decisions

- **Layout:** Full-screen wizard — no AppShell sidebar/header. Minimal header with "Röbel" logo + "Beenden" exit button.
- **Route:** Replaces existing `/app/gewerbe/erstellen` (same route, complete overhaul).
- **Visual direction:** Airbnb Clean — white backgrounds, large typography (46px heading), generous whitespace, single prominent CTA per step.
- **Navigation:** Thin progress bar at top, "Zurück" text-button bottom-left, "Weiter" primary button bottom-right. Step counter in center ("Schritt X von 8").
- **Primary color:** `#194383` (Röbel navy) for buttons and progress bar.
- **Status page:** New dedicated route at `/app/gewerbe/status`.
- **Data model:** Reuses existing `businesses` table and `submitBusiness` server action — no schema changes needed.
- **Conditional fields:** Category select and opening hours only shown for `restaurant` and `unternehmen` org types (matches Expo logic).

## Wizard Steps

### Step 1: Intro

**Layout:** Airbnb landing — exact mirror of their host onboarding intro.

- **Header:** Minimal bar — "Röbel" text-logo left, "Beenden" pill button right (links to `/app/gewerbe`).
- **Left half:** Large bold heading: "Es ist ganz einfach, dein Gewerbe in Röbel zu registrieren" (46px, font-weight 800).
- **Right half:** 3 numbered steps stacked vertically, separated by `1px #eee` dividers:
  1. "Erzähl uns von deinem Gewerbe" — "Teile grundlegende Informationen, wie Name, Kategorie und eine kurze Beschreibung." + illustration
  2. "Mach es auffindbar" — "Füge Adresse, Kontaktdaten und Öffnungszeiten hinzu — damit Röbeler dich finden." + illustration
  3. "Zeig dein Gewerbe" — "Lade ein Logo und Titelbild hoch — wir helfen dir gerne dabei." + illustration
- **Footer:** "Loslegen" navy button, bottom-right.
- **No progress bar** on this screen.
- **Mobile:** Stacks vertically — heading on top, steps below.

### Step 2: Type Selection

- **Heading:** "Welche Art von Organisation möchtest du registrieren?"
- **Grid:** 2-column grid (3-column on wider screens) of selectable cards:
  - 🍽️ Restaurant — "Gastronomie mit Speisekarte"
  - 🏢 Unternehmen — "Gewerbe & Dienstleistungen"
  - 🤝 Verein — "Sport, Kultur, Soziales"
  - 🏛️ Partei — "Politische Parteien"
  - 🗳️ Fraktion — "Fraktionen im Stadtrat"
- **Selection:** Single-select, highlighted card with navy border on selection.
- **Validation:** "Weiter" button disabled until a type is selected.

### Step 3: Info

- **Heading:** "Erzähl uns von deinem Gewerbe"
- **Fields:**
  - Name (required, text input, max 100 chars with character counter)
  - Category (select dropdown, only if orgType is `restaurant` or `unternehmen`) — uses existing `BUSINESS_CATEGORIES` constants
  - Description (optional, textarea, max 500 chars with character counter)
- **Validation:** "Weiter" disabled if name is empty. Category required if conditional field is shown.

### Step 4: Location

- **Heading:** "Wo befindet sich dein Gewerbe?"
- **Fields:**
  - Address (text input with geocoding — uses existing `geocodeLocation()` from `lib/utils/geocoding.ts`)
  - On successful geocode: show inline map preview with pin (Google Maps static or embedded)
  - Green success indicator on the address field when geocoded
- **Skippable:** "Weiter" enabled even without address (address is optional in DB).

### Step 5: Contact

- **Heading:** "Wie kann man dich erreichen?"
- **Fields:**
  - Phone (tel input)
  - Email (email input)
  - Website (url input)
  - Opening hours editor (only if orgType is `restaurant` or `unternehmen`) — reuse/adapt existing `OpeningHoursEditor` component from `components/business/OpeningHoursEditor.tsx`
- **All fields optional.** "Weiter" always enabled.

### Step 6: Photos

- **Heading:** "Zeig dein Gewerbe"
- **Fields:**
  - Logo upload (circular preview, 1:1 aspect ratio) — reuse/adapt existing `BusinessImageUpload` component
  - Cover image upload (rectangular preview, 16:9 aspect ratio)
- **Upload flow:** File select → local preview → upload to Supabase Storage on form submit (existing `uploadBusinessImage` server action).
- **All fields optional.** "Weiter" always enabled.

### Step 7: Review

- **Heading:** "Überprüfe dein Gewerbe"
- **Layout:** Summary cards for each section (Type, Info, Location, Contact, Photos) with:
  - Section title + "Bearbeiten" link that navigates back to that step
  - Display of entered data or "Nicht angegeben" for empty optional fields
  - Image previews for logo/cover
- **CTA:** "Gewerbe einreichen" navy button. Shows loading spinner during submission.
- **Submission:** Calls existing `submitBusiness` server action with all collected data. On success, navigates to Step 8.

### Step 8: CTA — "Erreiche mehr als 200 Röbeler"

**Layout:** Split layout (same as intro — content left, image right).

- **Left half:**
  - Small label: "GESCHAFFT!" (uppercase, grey)
  - Heading: "Erreiche mehr als 200 Röbeler" (30px, bold)
  - Body: "Dein Gewerbe ist registriert! Erstelle jetzt deine erste Anzeige und werde sofort in der Community sichtbar."
  - Subtext: "Anzeigen erscheinen im Feed und auf der Karte — kostenlos für Röbeler Gewerbe."
  - Primary CTA: "Jetzt erste Anzeige erstellen" (navy button) → navigates to ad creation flow
  - Secondary: "Überspringen" (underlined text link) → navigates to `/app/gewerbe/status`
- **Right half:** Promotional image/illustration (placeholder for now).
- **Footer:** "Zurück" left, step counter center.
- **Progress bar:** 100% filled.

## Status Page (`/app/gewerbe/status`)

New dedicated page showing the registration's approval status.

### Layout

- **Status banner** at top:
  - Yellow/amber background (`#FFF8E1`) with ⏳ icon
  - Title: "Registrierung eingereicht"
  - Subtitle: "Dein Gewerbe wird geprüft. Du wirst benachrichtigt, sobald es freigeschaltet ist."
  - Banner updates dynamically based on business status:
    - `pending` → ⏳ amber, "Registrierung eingereicht"
    - `approved` → ✅ green, "Gewerbe freigeschaltet!"
    - `rejected` → ❌ red, "Registrierung abgelehnt" + admin_notes if available

### Status Timeline

Vertical timeline with 3 states:
1. **Eingereicht** — green circle with checkmark, timestamp
2. **In Prüfung** — amber circle (active) or grey (future)
3. **Freigeschaltet** — grey circle (future) or green (completed)

Connected by vertical lines (green for completed, grey for pending).

### Tips Section

- **Heading:** "Tipps für den Start"
- **Grid:** 2×2 grid of tip cards, each with:
  - Image (placeholder for now — user will add images later)
  - Bold title
  - Short description
  - Links to placeholder routes (e.g. `/docs/profil-optimieren`)
- **Tip cards:**
  1. 📸 "Profil optimieren" — "Tipps für bessere Fotos und Beschreibungen"
  2. 📣 "Anzeigen erstellen" — "So erreichst du die Röbeler Community"
  3. ⭐ "Bewertungen sammeln" — "Mehr Sichtbarkeit durch Kundenbewertungen"
  4. 📊 "Dashboard nutzen" — "Behalte den Überblick über dein Gewerbe"

### Data Source

- Fetches the user's business by `owner_wallet_address` using existing `getBusinessesByOwner()` action.
- If no business found, redirects to `/app/gewerbe/erstellen`.
- If business is `approved`, shows success state with link to profile at `/app/gewerbe/[slug]`.

## Wizard State Management

- **Client-side React state** via `useState` in a parent wizard component (no context needed — single component tree).
- State shape mirrors Expo's `WizardState`:
  ```ts
  type WizardState = {
    orgType: OrgTypeChoice | null
    name: string
    description: string
    category: BusinessCategory | null
    address: string
    latitude: number | null
    longitude: number | null
    formattedAddress: string | null
    phone: string
    email: string
    website: string
    openingHours: OpeningHours | null
    logoFile: File | null
    coverFile: File | null
    logoPreview: string | null
    coverPreview: string | null
  }
  ```
- Step tracking: `const [step, setStep] = useState(1)` (1-8).
- No persistence across page reloads (acceptable — wizard is short).

## Responsive Behavior

- **Desktop (>= 1024px):** Split layouts for intro/CTA, centered single-column for form steps (max-width 640px).
- **Mobile (< 768px):** Full-width, stacked vertically. Intro heading stacks above steps. CTA stacks content above image.
- **Progress bar:** Full-width thin bar at top of viewport on all steps except intro.

## Files to Create/Modify

### New Files
- `apps/web/src/app/app/gewerbe/erstellen/page.tsx` — Complete rewrite of the wizard page
- `apps/web/src/components/business/OrgRegistrationWizard.tsx` — Main wizard component with all 8 steps
- `apps/web/src/app/app/gewerbe/status/page.tsx` — New status page

### Modified Files
- None — the wizard is a full replacement, and the status page is new.

### Reused (no changes needed)
- `apps/web/src/app/actions/submit-business.ts` — existing `submitBusiness` server action
- `apps/web/src/components/business/OpeningHoursEditor.tsx` — opening hours component
- `apps/web/src/components/business/BusinessImageUpload.tsx` — image upload component
- `apps/web/src/lib/utils/geocoding.ts` — `geocodeLocation()` function
- `apps/web/src/types/business.ts` — `Business`, `BusinessCategory`, `OpeningHours` types

## Verification

1. **Wizard flow:** Navigate to `/app/gewerbe/erstellen` → complete all 8 steps → verify business appears in Supabase `businesses` table with status `pending`.
2. **Back navigation:** Verify "Zurück" button works on every step, preserving entered data.
3. **Review editing:** From review screen, click "Bearbeiten" on each section → verify it navigates to the correct step and back.
4. **Conditional fields:** Select `verein` type → verify category and opening hours are NOT shown. Select `restaurant` → verify they ARE shown.
5. **Image upload:** Upload logo and cover → verify they appear in Supabase Storage and URLs are saved to the business record.
6. **Status page:** After submission, navigate to `/app/gewerbe/status` → verify correct status banner and timeline.
7. **CTA flow:** Click "Jetzt erste Anzeige erstellen" → verify navigation. Click "Überspringen" → verify redirect to status page.
8. **Responsive:** Test on mobile viewport (375px) and desktop (1440px).
9. **Exit:** Click "Beenden" on intro → verify redirect to `/app/gewerbe`.
