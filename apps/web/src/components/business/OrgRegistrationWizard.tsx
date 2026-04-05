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

  // Placeholder for steps 7-8 (implemented in Task 5)
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
