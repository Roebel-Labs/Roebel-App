# Web Org Registration Wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic 3-step business registration form at `/app/gewerbe/erstellen` with an Airbnb-inspired full-screen 8-step wizard, plus a new `/app/gewerbe/status` page for tracking approval.

**Architecture:** Full-screen wizard component with step-based state machine, rendering outside the AppShell layout. Reuses existing `submitBusiness` server action, `OpeningHoursEditor`, `BusinessImageUpload`, and `geocodeLocation()`. New `OrgTypeChoice` type added to the existing business types file.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS 3, Supabase, Thirdweb wallet auth, Lucide icons

**Spec:** `docs/superpowers/specs/2026-04-05-web-org-registration-redesign.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `apps/web/src/types/business.ts` | Add `OrgTypeChoice` type and `ORG_TYPES` constant |
| `apps/web/src/app/app/gewerbe/erstellen/layout.tsx` | New layout that bypasses AppShell (full-screen) |
| `apps/web/src/app/app/gewerbe/erstellen/page.tsx` | Complete rewrite — mounts the wizard |
| `apps/web/src/components/business/OrgRegistrationWizard.tsx` | Main wizard: state, navigation, progress bar, all 8 steps |
| `apps/web/src/app/app/gewerbe/status/page.tsx` | Status page with timeline + tip cards |

---

### Task 1: Add OrgTypeChoice type and ORG_TYPES constant

**Files:**
- Modify: `apps/web/src/types/business.ts`

- [ ] **Step 1: Add the type and constant to the bottom of the types file**

Add after the existing `BusinessCategory` type (line ~16):

```ts
export type OrgTypeChoice = "restaurant" | "unternehmen" | "verein" | "partei" | "fraktion"
```

Add after the existing `DAYS_OF_WEEK` constant (line ~183):

```ts
export const ORG_TYPES: { value: OrgTypeChoice; label: string; description: string; emoji: string }[] = [
  { value: "restaurant", label: "Restaurant", description: "Gastronomie mit Speisekarte", emoji: "🍽️" },
  { value: "unternehmen", label: "Unternehmen", description: "Gewerbe & Dienstleistungen", emoji: "🏢" },
  { value: "verein", label: "Verein", description: "Sport, Kultur, Soziales", emoji: "🤝" },
  { value: "partei", label: "Partei", description: "Politische Parteien", emoji: "🏛️" },
  { value: "fraktion", label: "Fraktion", description: "Fraktionen im Stadtrat", emoji: "🗳️" },
]
```

- [ ] **Step 2: Verify the app still compiles**

Run: `cd apps/web && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds or only pre-existing errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/types/business.ts
git commit -m "feat(web): add OrgTypeChoice type and ORG_TYPES constant"
git push
```

---

### Task 2: Create full-screen wizard layout

**Files:**
- Create: `apps/web/src/app/app/gewerbe/erstellen/layout.tsx`

The existing `/app/app/layout.tsx` wraps all `/app` routes in the AppShell (sidebar, header, bottom nav). We need a layout for `/app/app/gewerbe/erstellen` that bypasses the AppShell and renders full-screen instead.

- [ ] **Step 1: Create the layout file**

```tsx
export default function CreateBusinessLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-white">
      {children}
    </div>
  )
}
```

Note: This is a server component. The parent `/app/app/layout.tsx` still wraps this with providers (AuthGuard, ThirdwebProvider, etc.) but the AppShell's sidebar/header won't render because this layout replaces the content area. Check if the parent layout's AppShell wraps `{children}` — if so, the wizard page component itself will need to use CSS to go full-screen (position fixed). Read `apps/web/src/app/app/layout.tsx` to verify.

- [ ] **Step 2: Read the parent layout to check how AppShell wraps children**

Read: `apps/web/src/app/app/layout.tsx`

If the parent layout renders `<AppShell>{children}</AppShell>`, the nested layout alone won't bypass it. In that case, the wizard component will need `position: fixed; inset: 0; z-index: 50` to overlay everything.

- [ ] **Step 3: Adjust approach based on findings and verify**

If AppShell wraps children: the layout file should add a `fixed inset-0 z-50 bg-white` wrapper.
If AppShell does NOT wrap children: the simple layout above is sufficient.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/app/gewerbe/erstellen/layout.tsx
git commit -m "feat(web): add full-screen layout for org registration wizard"
git push
```

---

### Task 3: Build the OrgRegistrationWizard component — Steps 1-2 (Intro + Type)

**Files:**
- Create: `apps/web/src/components/business/OrgRegistrationWizard.tsx`

This is the main wizard component. This task implements the shell (state, navigation, progress bar) plus Steps 1-2.

- [ ] **Step 1: Create the wizard component with state, navigation, and Steps 1-2**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Loader2, MapPin, Check } from "lucide-react"
import { submitBusiness } from "@/app/actions/submit-business"
import {
  BUSINESS_CATEGORIES,
  ORG_TYPES,
  DAYS_OF_WEEK,
  getCategoryLabel,
} from "@/types/business"
import type {
  OrgTypeChoice,
  BusinessCategory,
  OpeningHours,
} from "@/types/business"
import { OpeningHoursEditor } from "./OpeningHoursEditor"
import { BusinessImageUpload } from "./BusinessImageUpload"

interface OrgRegistrationWizardProps {
  walletAddress: string
}

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
  openingHours: OpeningHours
  logoFile: File | null
  coverFile: File | null
  logoPreview: string | null
  coverPreview: string | null
}

const TOTAL_STEPS = 8

export function OrgRegistrationWizard({ walletAddress }: OrgRegistrationWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [state, setState] = useState<WizardState>({
    orgType: null,
    name: "",
    description: "",
    category: null,
    address: "",
    latitude: null,
    longitude: null,
    formattedAddress: null,
    phone: "",
    email: "",
    website: "",
    openingHours: {},
    logoFile: null,
    coverFile: null,
    logoPreview: null,
    coverPreview: null,
  })

  const update = (partial: Partial<WizardState>) =>
    setState((prev) => ({ ...prev, ...partial }))

  const needsCategory =
    state.orgType === "restaurant" || state.orgType === "unternehmen"

  // ── Step 1: Intro ──
  if (step === 1) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        {/* Minimal header */}
        <div className="flex justify-between items-center px-6 md:px-10 py-5 border-b border-gray-100">
          <span className="text-xl font-bold text-[#194383]">Röbel</span>
          <Link
            href="/app/gewerbe"
            className="border border-gray-300 rounded-full px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Beenden
          </Link>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col lg:flex-row items-center px-6 md:px-16 lg:px-20">
          {/* Left: heading */}
          <div className="flex-1 flex items-center py-12 lg:py-0">
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight text-gray-900 tracking-tight">
              Es ist ganz einfach,
              <br />
              dein Gewerbe in
              <br />
              Röbel zu registrieren
            </h1>
          </div>

          {/* Right: 3 steps */}
          <div className="flex-1 flex flex-col justify-center lg:pl-16 pb-12 lg:pb-0 w-full lg:w-auto">
            {[
              {
                num: 1,
                title: "Erzähl uns von deinem Gewerbe",
                desc: "Teile grundlegende Informationen, wie Name, Kategorie und eine kurze Beschreibung.",
                emoji: "🏪",
              },
              {
                num: 2,
                title: "Mach es auffindbar",
                desc: "Füge Adresse, Kontaktdaten und Öffnungszeiten hinzu — damit Röbeler dich finden.",
                emoji: "📍",
              },
              {
                num: 3,
                title: "Zeig dein Gewerbe",
                desc: "Lade ein Logo und Titelbild hoch — wir helfen dir gerne dabei.",
                emoji: "📸",
              },
            ].map((item, i) => (
              <div
                key={item.num}
                className={`flex items-start gap-5 py-7 ${i < 2 ? "border-b border-gray-200" : ""}`}
              >
                <span className="text-lg font-semibold text-gray-900 min-w-[20px]">
                  {item.num}
                </span>
                <div className="flex-1">
                  <div className="text-base font-semibold text-gray-900 mb-1">
                    {item.title}
                  </div>
                  <div className="text-sm text-gray-500 leading-relaxed">
                    {item.desc}
                  </div>
                </div>
                <span className="text-4xl flex-shrink-0">{item.emoji}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 md:px-10 py-5 flex justify-end">
          <button
            onClick={() => setStep(2)}
            className="bg-[#194383] hover:bg-[#143a72] text-white px-7 py-3.5 rounded-lg font-semibold text-base transition-colors"
          >
            Loslegen
          </button>
        </div>
      </div>
    )
  }

  // ── Step 2: Type Selection ──
  if (step === 2) {
    return (
      <WizardShell
        step={step}
        setStep={setStep}
        canAdvance={!!state.orgType}
        onNext={() => setStep(3)}
      >
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
          Welche Art von Organisation möchtest du registrieren?
        </h2>
        <p className="text-gray-500 mb-8">Wähle die passende Kategorie für dein Gewerbe.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ORG_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => update({ orgType: type.value })}
              className={`flex items-center gap-4 p-5 rounded-xl border-2 text-left transition-all ${
                state.orgType === type.value
                  ? "border-[#194383] bg-blue-50/50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="text-3xl">{type.emoji}</span>
              <div>
                <div className="font-semibold text-gray-900">{type.label}</div>
                <div className="text-sm text-gray-500">{type.description}</div>
              </div>
            </button>
          ))}
        </div>
      </WizardShell>
    )
  }

  // Placeholder for steps 3-8 (implemented in subsequent tasks)
  return null
}

// ── Shared wizard chrome (progress bar, back/next, step counter) ──
function WizardShell({
  step,
  setStep,
  canAdvance,
  onNext,
  nextLabel = "Weiter",
  isLoading = false,
  children,
}: {
  step: number
  setStep: (s: number) => void
  canAdvance: boolean
  onNext: () => void
  nextLabel?: string
  isLoading?: boolean
  children: React.ReactNode
}) {
  const progress = ((step - 1) / (TOTAL_STEPS - 1)) * 100

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Progress bar */}
      <div className="h-1 bg-gray-100">
        <div
          className="h-1 bg-[#194383] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-6 py-10 md:py-16">
          {children}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-6 md:px-10 py-5 flex items-center justify-between">
        <button
          onClick={() => setStep(step - 1)}
          className="text-sm font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2 transition-colors"
        >
          Zurück
        </button>
        <span className="text-sm text-gray-400">
          Schritt {step} von {TOTAL_STEPS}
        </span>
        <button
          onClick={onNext}
          disabled={!canAdvance || isLoading}
          className="bg-[#194383] hover:bg-[#143a72] disabled:bg-gray-200 disabled:text-gray-400 text-white px-7 py-3 rounded-lg font-semibold text-sm transition-colors flex items-center gap-2"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {nextLabel}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the component compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/business/OrgRegistrationWizard.tsx
git commit -m "feat(web): add OrgRegistrationWizard with intro and type selection steps"
git push
```

---

### Task 4: Add Steps 3-6 (Info, Location, Contact, Photos)

**Files:**
- Modify: `apps/web/src/components/business/OrgRegistrationWizard.tsx`

- [ ] **Step 1: Add Steps 3-6 to the wizard component**

Replace the `// Placeholder for steps 3-8` comment and `return null` with the following steps. Each step is rendered inside `<WizardShell>`:

```tsx
  // ── Step 3: Info ──
  if (step === 3) {
    const canProceed = state.name.trim().length > 0 && (!needsCategory || !!state.category)

    return (
      <WizardShell step={step} setStep={setStep} canAdvance={canProceed} onNext={() => setStep(4)}>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
          Erzähl uns von deinem Gewerbe
        </h2>
        <p className="text-gray-500 mb-8">Grundlegende Informationen zu deiner Organisation.</p>

        <div className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Name *
            </label>
            <input
              type="text"
              value={state.name}
              onChange={(e) => update({ name: e.target.value.slice(0, 100) })}
              placeholder="z.B. Bäckerei Müller"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#194383] focus:border-transparent"
            />
            <div className="text-xs text-gray-400 mt-1 text-right">
              {state.name.length}/100
            </div>
          </div>

          {/* Category (conditional) */}
          {needsCategory && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Kategorie *
              </label>
              <select
                value={state.category || ""}
                onChange={(e) => update({ category: e.target.value as BusinessCategory })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#194383] focus:border-transparent"
              >
                <option value="">Kategorie wählen...</option>
                {BUSINESS_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Beschreibung
            </label>
            <textarea
              value={state.description}
              onChange={(e) => update({ description: e.target.value.slice(0, 500) })}
              placeholder="Beschreibe dein Gewerbe in ein paar Sätzen..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#194383] focus:border-transparent resize-none"
            />
            <div className="text-xs text-gray-400 mt-1 text-right">
              {state.description.length}/500
            </div>
          </div>
        </div>
      </WizardShell>
    )
  }

  // ── Step 4: Location ──
  if (step === 4) {
    return (
      <WizardShell step={step} setStep={setStep} canAdvance={true} onNext={() => setStep(5)}>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
          Wo befindet sich dein Gewerbe?
        </h2>
        <p className="text-gray-500 mb-8">Damit Röbeler dich auf der Karte finden können.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Adresse
            </label>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-3.5 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={state.address}
                onChange={(e) =>
                  update({
                    address: e.target.value,
                    latitude: null,
                    longitude: null,
                    formattedAddress: null,
                  })
                }
                placeholder="Marktplatz 1, 17207 Röbel/Müritz"
                className={`w-full pl-11 pr-4 py-3 border rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#194383] focus:border-transparent ${
                  state.formattedAddress
                    ? "border-green-400 bg-green-50/30"
                    : "border-gray-300"
                }`}
              />
              {state.formattedAddress && (
                <Check className="absolute right-3.5 top-3.5 h-5 w-5 text-green-500" />
              )}
            </div>
            {state.formattedAddress && (
              <p className="text-sm text-green-600 mt-1.5">
                ✓ {state.formattedAddress}
              </p>
            )}
          </div>

          <p className="text-xs text-gray-400">
            Die Adresse wird beim Einreichen automatisch geocodiert. Du kannst diesen Schritt auch überspringen.
          </p>
        </div>
      </WizardShell>
    )
  }

  // ── Step 5: Contact ──
  if (step === 5) {
    return (
      <WizardShell step={step} setStep={setStep} canAdvance={true} onNext={() => setStep(6)}>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
          Wie kann man dich erreichen?
        </h2>
        <p className="text-gray-500 mb-8">Kontaktdaten sind optional, helfen aber Röbelern dich zu finden.</p>

        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefon</label>
              <input
                type="tel"
                value={state.phone}
                onChange={(e) => update({ phone: e.target.value })}
                placeholder="+49 ..."
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#194383] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">E-Mail</label>
              <input
                type="email"
                value={state.email}
                onChange={(e) => update({ email: e.target.value })}
                placeholder="info@example.de"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#194383] focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Website</label>
            <input
              type="url"
              value={state.website}
              onChange={(e) => update({ website: e.target.value })}
              placeholder="https://www.example.de"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#194383] focus:border-transparent"
            />
          </div>

          {needsCategory && (
            <OpeningHoursEditor
              value={state.openingHours}
              onChange={(hours) => update({ openingHours: hours })}
            />
          )}
        </div>
      </WizardShell>
    )
  }

  // ── Step 6: Photos ──
  if (step === 6) {
    return (
      <WizardShell step={step} setStep={setStep} canAdvance={true} onNext={() => setStep(7)}>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
          Zeig dein Gewerbe
        </h2>
        <p className="text-gray-500 mb-8">Lade ein Logo und Titelbild hoch. Beides ist optional.</p>

        <div className="space-y-6">
          <BusinessImageUpload
            label="Logo"
            currentUrl={null}
            onFileSelect={(file) => {
              update({
                logoFile: file,
                logoPreview: file ? URL.createObjectURL(file) : null,
              })
            }}
            previewUrl={state.logoPreview}
          />

          <BusinessImageUpload
            label="Titelbild"
            currentUrl={null}
            onFileSelect={(file) => {
              update({
                coverFile: file,
                coverPreview: file ? URL.createObjectURL(file) : null,
              })
            }}
            previewUrl={state.coverPreview}
          />
        </div>
      </WizardShell>
    )
  }
```

- [ ] **Step 2: Verify the component compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/business/OrgRegistrationWizard.tsx
git commit -m "feat(web): add info, location, contact, and photos wizard steps"
git push
```

---

### Task 5: Add Steps 7-8 (Review + CTA) and submission logic

**Files:**
- Modify: `apps/web/src/components/business/OrgRegistrationWizard.tsx`

- [ ] **Step 1: Add Steps 7-8 after Step 6**

Add after the Step 6 block, before the final `return null`:

```tsx
  // ── Step 7: Review ──
  if (step === 7) {
    const sections = [
      {
        title: "Art",
        step: 2,
        content: ORG_TYPES.find((t) => t.value === state.orgType)
          ? `${ORG_TYPES.find((t) => t.value === state.orgType)!.emoji} ${ORG_TYPES.find((t) => t.value === state.orgType)!.label}`
          : "Nicht angegeben",
      },
      {
        title: "Informationen",
        step: 3,
        content: [
          state.name,
          needsCategory && state.category ? getCategoryLabel(state.category) : null,
          state.description || null,
        ]
          .filter(Boolean)
          .join(" · "),
      },
      {
        title: "Standort",
        step: 4,
        content: state.address || "Nicht angegeben",
      },
      {
        title: "Kontakt",
        step: 5,
        content:
          [state.phone, state.email, state.website].filter(Boolean).join(" · ") ||
          "Nicht angegeben",
      },
    ]

    return (
      <WizardShell
        step={step}
        setStep={setStep}
        canAdvance={!isSubmitting}
        onNext={handleSubmit}
        nextLabel={isSubmitting ? "Wird eingereicht..." : "Gewerbe einreichen"}
        isLoading={isSubmitting}
      >
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
          Überprüfe dein Gewerbe
        </h2>
        <p className="text-gray-500 mb-8">Schau dir alles nochmal an, bevor du einreichst.</p>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {sections.map((section) => (
            <div
              key={section.title}
              className="flex items-start justify-between p-4 bg-gray-50 rounded-xl"
            >
              <div>
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                  {section.title}
                </div>
                <div className="text-sm text-gray-900">{section.content}</div>
              </div>
              <button
                onClick={() => setStep(section.step)}
                className="text-sm font-medium text-[#194383] hover:underline flex-shrink-0 ml-4"
              >
                Bearbeiten
              </button>
            </div>
          ))}

          {/* Photos preview */}
          <div className="flex items-start justify-between p-4 bg-gray-50 rounded-xl">
            <div>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                Fotos
              </div>
              <div className="flex gap-3 mt-2">
                {state.logoPreview ? (
                  <div className="w-16 h-16 rounded-full overflow-hidden border border-gray-200">
                    <img src={state.logoPreview} alt="Logo" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-400">
                    Logo
                  </div>
                )}
                {state.coverPreview ? (
                  <div className="w-28 h-16 rounded-lg overflow-hidden border border-gray-200">
                    <img src={state.coverPreview} alt="Cover" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-28 h-16 rounded-lg bg-gray-200 flex items-center justify-center text-xs text-gray-400">
                    Titelbild
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setStep(6)}
              className="text-sm font-medium text-[#194383] hover:underline flex-shrink-0 ml-4"
            >
              Bearbeiten
            </button>
          </div>
        </div>
      </WizardShell>
    )
  }

  // ── Step 8: CTA ──
  if (step === 8) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        {/* Progress bar — 100% */}
        <div className="h-1 bg-gray-100">
          <div className="h-1 bg-[#194383] w-full" />
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col lg:flex-row items-center px-6 md:px-16 lg:px-20">
          {/* Left: CTA content */}
          <div className="flex-1 flex flex-col justify-center py-12 lg:py-0">
            <div className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-4">
              Geschafft!
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 leading-tight mb-4">
              Erreiche mehr als
              <br />
              200 Röbeler
            </h2>
            <p className="text-base text-gray-600 leading-relaxed mb-2">
              Dein Gewerbe ist registriert! Erstelle jetzt deine erste Anzeige und
              werde sofort in der Community sichtbar.
            </p>
            <p className="text-sm text-gray-400 mb-8">
              Anzeigen erscheinen im Feed und auf der Karte — kostenlos für Röbeler
              Gewerbe.
            </p>
            <div className="flex flex-col gap-3 items-start">
              <button
                onClick={() => router.push("/app/gewerbe/angebote")}
                className="bg-[#194383] hover:bg-[#143a72] text-white px-8 py-3.5 rounded-lg font-semibold text-base transition-colors"
              >
                Jetzt erste Anzeige erstellen
              </button>
              <button
                onClick={() => router.push("/app/gewerbe/status")}
                className="text-gray-500 text-sm underline underline-offset-2 hover:text-gray-700 transition-colors"
              >
                Überspringen
              </button>
            </div>
          </div>

          {/* Right: Image placeholder */}
          <div className="flex-1 hidden lg:flex items-center justify-center">
            <div className="w-full max-w-md h-80 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl flex items-center justify-center">
              <div className="text-center text-gray-400">
                <div className="text-6xl mb-3">📣</div>
                <div className="text-sm">Bild / Illustration</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 md:px-10 py-5 flex items-center justify-between">
          <button
            onClick={() => setStep(7)}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2 transition-colors"
          >
            Zurück
          </button>
          <span className="text-sm text-gray-400">
            Schritt {step} von {TOTAL_STEPS}
          </span>
          <div />
        </div>
      </div>
    )
  }

  return null
```

- [ ] **Step 2: Add the handleSubmit function**

Add this function inside the `OrgRegistrationWizard` component, after the `needsCategory` line:

```tsx
  const handleSubmit = async () => {
    if (!state.name.trim() || !state.orgType) {
      setError("Name und Organisationstyp sind erforderlich.")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.set("owner_wallet_address", walletAddress)
      formData.set("name", state.name)
      formData.set("description", state.description)
      formData.set("category", state.category || (state.orgType === "restaurant" ? "gastronomie" : "sonstiges"))
      formData.set("phone", state.phone)
      formData.set("email", state.email)
      formData.set("website_url", state.website)
      formData.set("address", state.address)
      formData.set("opening_hours", JSON.stringify(state.openingHours))

      if (state.logoFile) formData.set("logo_file", state.logoFile)
      if (state.coverFile) formData.set("cover_file", state.coverFile)

      const result = await submitBusiness(formData)

      if (result.success) {
        setStep(8)
      } else {
        setError(result.error || "Ein Fehler ist aufgetreten.")
      }
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten.")
    } finally {
      setIsSubmitting(false)
    }
  }
```

- [ ] **Step 3: Remove the final `return null` and verify compilation**

The last `return null` should remain as a fallback for impossible states but should never be hit.

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/business/OrgRegistrationWizard.tsx
git commit -m "feat(web): add review, submission, and CTA steps to wizard"
git push
```

---

### Task 6: Rewrite the erstellen page to mount the wizard

**Files:**
- Modify: `apps/web/src/app/app/gewerbe/erstellen/page.tsx`

- [ ] **Step 1: Replace the entire page with the new wizard**

Replace the full contents of `page.tsx`:

```tsx
"use client"

import { useActiveAccount } from "thirdweb/react"
import { OrgRegistrationWizard } from "@/components/business/OrgRegistrationWizard"
import { Store } from "lucide-react"

export default function CreateBusinessPage() {
  const account = useActiveAccount()

  if (!account?.address) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
        <div className="text-center">
          <Store className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Wallet nicht verbunden</p>
          <p className="text-sm text-gray-400 mt-1">
            Bitte verbinde deine Wallet, um ein Gewerbe zu registrieren.
          </p>
        </div>
      </div>
    )
  }

  return <OrgRegistrationWizard walletAddress={account.address} />
}
```

- [ ] **Step 2: Run the dev server and verify the wizard loads**

Run: `cd apps/web && pnpm dev`

Navigate to `http://localhost:3000/app/gewerbe/erstellen` and verify:
- Full-screen intro appears with Airbnb-style layout
- "Loslegen" advances to type selection
- All 8 steps navigate correctly
- "Beenden" links back to `/app/gewerbe`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/app/gewerbe/erstellen/page.tsx
git commit -m "feat(web): rewrite erstellen page to mount Airbnb-style wizard"
git push
```

---

### Task 7: Create the status page

**Files:**
- Create: `apps/web/src/app/app/gewerbe/status/page.tsx`

- [ ] **Step 1: Create the status page**

```tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useActiveAccount } from "thirdweb/react"
import { getBusinessesByOwner } from "@/app/actions/businesses"
import type { Business } from "@/types/business"
import { Loader2 } from "lucide-react"

const STATUS_CONFIG = {
  pending: {
    emoji: "⏳",
    bg: "bg-amber-50",
    border: "border-amber-200",
    title: "Registrierung eingereicht",
    subtitle: "Dein Gewerbe wird geprüft. Du wirst benachrichtigt, sobald es freigeschaltet ist.",
  },
  approved: {
    emoji: "✅",
    bg: "bg-green-50",
    border: "border-green-200",
    title: "Gewerbe freigeschaltet!",
    subtitle: "Dein Gewerbe ist jetzt im Verzeichnis sichtbar.",
  },
  rejected: {
    emoji: "❌",
    bg: "bg-red-50",
    border: "border-red-200",
    title: "Registrierung abgelehnt",
    subtitle: "Bitte überprüfe die Hinweise und versuche es erneut.",
  },
} as const

const TIPS = [
  {
    title: "Profil optimieren",
    description: "Tipps für bessere Fotos und Beschreibungen",
    href: "#",
  },
  {
    title: "Anzeigen erstellen",
    description: "So erreichst du die Röbeler Community",
    href: "#",
  },
  {
    title: "Bewertungen sammeln",
    description: "Mehr Sichtbarkeit durch Kundenbewertungen",
    href: "#",
  },
  {
    title: "Dashboard nutzen",
    description: "Behalte den Überblick über dein Gewerbe",
    href: "#",
  },
]

export default function BusinessStatusPage() {
  const account = useActiveAccount()
  const router = useRouter()
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchBusiness() {
      if (!account?.address) return

      const result = await getBusinessesByOwner(account.address)
      if (result.success && result.data && result.data.length > 0) {
        setBusiness(result.data[0])
      } else {
        router.push("/app/gewerbe/erstellen")
      }
      setLoading(false)
    }

    fetchBusiness()
  }, [account?.address, router])

  if (loading || !business) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
      </div>
    )
  }

  const config = STATUS_CONFIG[business.status]

  const timelineSteps = [
    {
      label: "Eingereicht",
      sublabel: new Date(business.created_at).toLocaleDateString("de-DE", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      done: true,
    },
    {
      label: "In Prüfung",
      sublabel: business.status === "pending" ? "Ausstehend" : "Abgeschlossen",
      done: business.status === "approved" || business.status === "rejected",
      active: business.status === "pending",
    },
    {
      label: "Freigeschaltet",
      sublabel: business.status === "approved" ? "Aktiv" : "Ausstehend",
      done: business.status === "approved",
    },
  ]

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Status banner */}
      <div className={`${config.bg} ${config.border} border rounded-xl p-5 flex items-start gap-4`}>
        <span className="text-2xl">{config.emoji}</span>
        <div>
          <div className="font-semibold text-gray-900">{config.title}</div>
          <div className="text-sm text-gray-600 mt-0.5">{config.subtitle}</div>
          {business.status === "rejected" && business.admin_notes && (
            <div className="text-sm text-red-600 mt-2 p-3 bg-white rounded-lg">
              {business.admin_notes}
            </div>
          )}
        </div>
      </div>

      {/* Approved: link to profile */}
      {business.status === "approved" && business.slug && (
        <Link
          href={`/app/gewerbe/${business.slug}`}
          className="block text-center bg-[#194383] hover:bg-[#143a72] text-white py-3 rounded-xl font-semibold transition-colors"
        >
          Zum Profil →
        </Link>
      )}

      {/* Timeline */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-5">Status</h2>
        <div className="flex flex-col">
          {timelineSteps.map((ts, i) => (
            <div key={ts.label} className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${
                    ts.done
                      ? "bg-green-500 text-white"
                      : ts.active
                        ? "bg-amber-400 text-white"
                        : "bg-gray-200 text-gray-400"
                  }`}
                >
                  {ts.done ? "✓" : "•"}
                </div>
                {i < timelineSteps.length - 1 && (
                  <div
                    className={`w-0.5 h-8 ${ts.done ? "bg-green-500" : "bg-gray-200"}`}
                  />
                )}
              </div>
              <div className="pb-6">
                <div className={`font-semibold text-sm ${ts.done || ts.active ? "text-gray-900" : "text-gray-400"}`}>
                  {ts.label}
                </div>
                <div className="text-xs text-gray-400">{ts.sublabel}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tips */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tipps für den Start</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TIPS.map((tip) => (
            <Link
              key={tip.title}
              href={tip.href}
              className="block p-5 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <div className="w-full h-24 bg-gray-100 rounded-lg mb-3 flex items-center justify-center text-gray-300 text-xs">
                Bild
              </div>
              <div className="font-semibold text-sm text-gray-900 mb-1">{tip.title}</div>
              <div className="text-xs text-gray-500">{tip.description}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 pb-8">
        <Link
          href="/app/gewerbe/bearbeiten"
          className="flex-1 text-center py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Profil bearbeiten
        </Link>
        <Link
          href="/app/gewerbe"
          className="flex-1 text-center py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Verzeichnis ansehen
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the page compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/app/gewerbe/status/page.tsx
git commit -m "feat(web): add business registration status page with timeline and tips"
git push
```

---

### Task 8: End-to-end verification

- [ ] **Step 1: Run the dev server**

Run: `cd apps/web && pnpm dev`

- [ ] **Step 2: Test the full wizard flow**

1. Navigate to `http://localhost:3000/app/gewerbe/erstellen`
2. Verify intro screen renders with Airbnb-style split layout
3. Click "Loslegen" → type selection grid appears
4. Select "Restaurant" → click "Weiter"
5. Verify category dropdown appears (conditional field)
6. Fill in name "Test Restaurant" → "Weiter"
7. Enter address → "Weiter"
8. Enter phone → "Weiter"
9. Skip photos → "Weiter"
10. Review screen shows all entered data
11. Click "Bearbeiten" on a section → navigates to correct step → "Weiter" returns to review
12. Click "Gewerbe einreichen" → submits to Supabase
13. CTA screen appears with split layout
14. Click "Überspringen" → status page loads

- [ ] **Step 3: Test the status page**

1. Navigate to `/app/gewerbe/status`
2. Verify amber banner shows "Registrierung eingereicht"
3. Verify timeline shows "Eingereicht" as done (green), "In Prüfung" as active (amber), "Freigeschaltet" as pending (grey)
4. Verify 4 tip cards render with image placeholders

- [ ] **Step 4: Test responsive layout**

1. Resize to mobile (375px width)
2. Verify intro stacks vertically (heading above steps)
3. Verify form steps are full-width
4. Verify CTA hides right image panel on mobile

- [ ] **Step 5: Test "Beenden" exit**

1. On intro, click "Beenden"
2. Verify redirect to `/app/gewerbe`

- [ ] **Step 6: Test with verein type**

1. Start wizard, select "Verein"
2. Verify category dropdown is NOT shown on info step
3. Verify opening hours is NOT shown on contact step

- [ ] **Step 7: Final commit if any fixes were needed**

```bash
git add -p  # stage only changed files
git commit -m "fix(web): address issues found during e2e verification"
git push
```
