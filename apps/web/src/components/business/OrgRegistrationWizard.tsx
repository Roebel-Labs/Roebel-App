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
