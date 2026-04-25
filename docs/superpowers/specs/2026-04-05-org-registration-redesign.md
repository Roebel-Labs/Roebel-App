# Org Registration Flow Redesign

## Context

The org creation wizard (`apps/expo/app/create-org/`) has all screens and logic implemented but no styling — text renders unstyled with no visual hierarchy (see original screenshot). This redesign applies Airbnb-inspired UI/UX to the existing flow, adds AI-powered location lookup, and introduces post-submission status tracking.

## Design Decisions

- **Visual direction**: Airbnb Clean — white backgrounds, large typography, generous whitespace, single prominent CTA
- **Type selection**: Compact 2-column grid with emoji + label
- **Location input**: Reuse `geocodeLocation()` from `lib/utils/geocoding.ts` with inline success state (green border on same field)
- **Status tracking**: Profile banner card (tappable) + detail screen with vertical timeline
- **Navigation**: "Zurück" text left, "Weiter" button right, thin progress bar at top

## Screens

### 1. Intro (`index.tsx`)

- Large heading: "Werde sichtbar in Röbel"
- Subtitle: "In wenigen Schritten erstellst du dein Profil."
- 3 step-preview cards in a vertical list, each with:
  - Emoji icon (🏪 ✏️ 🚀)
  - Bold title + grey subtitle
  - Rounded border, 16px border-radius
- Full-width navy CTA button: "Los geht's"
- No progress bar on this screen

### 2. Type Selection (`type.tsx`)

- Step label: "SCHRITT 1" (uppercase, grey, tracked)
- Title: "Welcher Typ passt?"
- Subtitle: "Wähle die Kategorie, die deine Organisation am besten beschreibt."
- 2-column grid of type cards:
  - Each: emoji (32px) + label (14px bold)
  - Unselected: 1px grey border, white bg
  - Selected: 2px navy border, light blue bg (`#f0f4fa`)
  - Fraktion spans full width (grid-column: span 2)
- Types: Restaurant 🍽️, Unternehmen 🏪, Verein 🤝, Partei 🏛️, Fraktion ⚖️

### 3. Info (`info.tsx`)

- Title: "Erzähl uns mehr"
- Fields:
  - **Name** (required): text input, max 100 chars with counter
  - **Beschreibung** (optional): multiline, max 500 chars with counter
  - **Kategorie** (conditional: restaurant/unternehmen): dropdown picker
- Input styling: `bg-surface rounded-xl px-4 py-3.5`, uppercase label above each field

### 4. Location (`location.tsx`)

- Title: "Wo befindet ihr euch?"
- Subtitle: "Gib eure Adresse ein — wir finden die genauen Koordinaten automatisch."
- Address input with 📍 icon prefix
- **AI geocoding**: On text input blur or "Enter", call `geocodeLocation()` from `lib/utils/geocoding.ts`
  - Reuses the existing multi-strategy Google Maps geocoding (Autocomplete → Text Search, Röbel-biased)
  - API key from `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`
- **States**:
  - Empty: grey border, placeholder "z.B. Marktplatz 1, Röbel..."
  - Loading: ActivityIndicator in place of checkmark
  - Success: green border (#28a745), green bg (#f0faf2), resolved address + coordinates shown inside the same input field, checkmark right
  - Error: red border, error message below
- Optional map preview below (placeholder for now)
- "Adresse später hinzufügen" skip link (for non-business orgs)
- Stores: `latitude`, `longitude`, `formattedAddress` in wizard context

### 5. Contact (`contact.tsx`)

- Title: "Wie erreicht man euch?"
- Fields: Phone, Email, Website (all optional text inputs)
- Conditional: Opening hours section for restaurant/unternehmen
  - 7 days, each with open/close time pickers + closed toggle
- Same input styling as info screen

### 6. Photos (`photos.tsx`)

- Title: "Zeigt euch von eurer besten Seite"
- Two upload areas:
  - **Logo**: square aspect, shown as rounded circle preview
  - **Cover**: 16:9 aspect, shown as rounded rectangle preview
- Upload states: empty placeholder with + icon → loading spinner → image preview with edit/remove overlay
- Uploads to Supabase storage (`images/org-logos/`, `images/org-covers/`)

### 7. Review (`review.tsx`)

- Title: "Alles richtig?"
- Summary sections (card-style, `bg-surface rounded-2xl p-4`):
  - Type + Name + Description
  - Location + Address
  - Contact info + Opening hours
  - Photos preview
- Each section has "Bearbeiten" link to jump back to that step
- Full-width CTA: "Antrag einreichen"
- Submits to: `accounts`, `account_owners`, `businesses`, `restaurants` tables

### 8. Success (`success.tsx`)

- Centered layout
- Large green checkmark (animated)
- "Dein Antrag wurde eingereicht!"
- Subtitle explaining review process
- CTA: "Zurück zum Profil"
- No progress bar on this screen

## Shared Design Patterns

### Progress Bar
- 3px height, full width at top of screen
- Background: `bg-surface` (#f0f0f0)
- Fill: `bg-primary` (#194383), animated width based on step (1/6 through 6/6)
- Hidden on intro and success screens

### Bottom Navigation
- Sticky to bottom, separated by 1px top border
- Left: "Zurück" text button (grey, `text-text-secondary`)
- Right: "Weiter" filled button (navy, rounded-xl, `bg-primary`)
- "Weiter" disabled (opacity-50) when required fields empty

### Step Header
- Step label: `text-xs uppercase tracking-wider text-text-tertiary font-inter-medium`
- Title: `text-2xl font-inter-bold text-text-primary`
- Subtitle: `text-sm text-text-secondary`, 28px margin-bottom

### Form Inputs
- Label: `text-xs uppercase tracking-wider font-inter-medium text-text-primary`
- Input: `bg-surface rounded-xl px-4 py-3.5 text-base font-inter-regular text-text-primary`
- Character counter: `text-xs text-text-tertiary` aligned right

## Status Tracking (New Feature)

### Profile Banner Component
- Location: `app/profile.tsx`, shown when user has a pending/approved org
- Card with: org emoji (in rounded-lg icon box) + name + type label | status badge pill + chevron
- Status badges:
  - Pending: orange bg (`#FFF3E0`), orange text (`#E65100`), label "In Prüfung"
  - Approved: green bg, green text, label "Freigegeben"
  - Rejected: red bg, red text, label "Abgelehnt"
- Tappable → navigates to status detail screen

### Status Detail Screen
- New route: `app/org-status.tsx`
- Header: org icon + name + type
- Vertical timeline with 3 steps:
  1. **Antrag eingereicht** — checkmark circle (navy), timestamp
  2. **In Prüfung** — dot circle (orange border when active, grey when pending)
  3. **Freigegeben** — empty circle (grey when pending, navy checkmark when done)
- Connecting lines: navy (completed) or grey (pending)
- Rejected state: step 2 shows red with rejection reason text

### Data Source
- Query `businesses` table `status` column for the current user's org
- Status values: `pending` → `approved` → `published` (or `rejected`)
- No new DB tables needed — existing `status` field is sufficient

## Files to Modify

| File | Changes |
|------|---------|
| `app/create-org/index.tsx` | Restyle intro with step-preview cards, CTA button |
| `app/create-org/type.tsx` | 2-col grid type cards with selection states |
| `app/create-org/info.tsx` | Styled form fields with labels, counters |
| `app/create-org/location.tsx` | AI geocoding integration, inline success/error states |
| `app/create-org/contact.tsx` | Styled contact fields, opening hours |
| `app/create-org/photos.tsx` | Upload areas with preview states |
| `app/create-org/review.tsx` | Card-based summary sections |
| `app/create-org/success.tsx` | Centered success layout |
| `app/create-org/_layout.tsx` | Progress bar styling (already has animated bar) |
| `app/profile.tsx` | Add status banner component |
| `app/org-status.tsx` | **New file** — status detail screen with timeline |

## Reusable Code

- `lib/utils/geocoding.ts` — `geocodeLocation()` function, reuse as-is for location screen
- `context/CreateOrgWizardContext.tsx` — existing state management, no changes needed
- `lib/supabase-restaurants.ts` / `lib/supabase-businesses.ts` — existing DB functions
- `lib/supabase-accounts.ts` — existing account creation

## Verification

1. Run `pnpm start` in `apps/expo` and open on iOS simulator
2. Navigate to Profile → "Organisation erstellen"
3. Walk through all 7 wizard steps verifying:
   - Visual styling matches design (typography, spacing, colors)
   - Type selection highlights correctly
   - Location field resolves address and shows green success state
   - Photos upload and preview correctly
   - Review screen shows all entered data
   - Submit creates records in Supabase
4. After submission, verify:
   - Profile page shows status banner with org name + "In Prüfung" badge
   - Tapping banner opens timeline detail screen
5. Test dark mode on all screens
6. Test with different org types (restaurant vs verein) to verify conditional fields
