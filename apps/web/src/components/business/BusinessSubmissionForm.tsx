"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { submitBusiness } from "@/app/actions/submit-business"
import { BUSINESS_CATEGORIES } from "@/types/business"
import type { BusinessCategory, OpeningHours } from "@/types/business"
import { OpeningHoursEditor } from "./OpeningHoursEditor"
import { BusinessImageUpload } from "./BusinessImageUpload"

interface BusinessSubmissionFormProps {
  walletAddress: string
}

export function BusinessSubmissionForm({ walletAddress }: BusinessSubmissionFormProps) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<BusinessCategory>("sonstiges")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [address, setAddress] = useState("")
  const [openingHours, setOpeningHours] = useState<OpeningHours>({})
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)

  const handleLogoSelect = (file: File | null) => {
    setLogoFile(file)
    if (file) {
      setLogoPreview(URL.createObjectURL(file))
    } else {
      setLogoPreview(null)
    }
  }

  const handleCoverSelect = (file: File | null) => {
    setCoverFile(file)
    if (file) {
      setCoverPreview(URL.createObjectURL(file))
    } else {
      setCoverPreview(null)
    }
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Bitte geben Sie einen Namen ein.")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.set("owner_wallet_address", walletAddress)
      formData.set("name", name)
      formData.set("description", description)
      formData.set("category", category)
      formData.set("phone", phone)
      formData.set("email", email)
      formData.set("website_url", websiteUrl)
      formData.set("address", address)
      formData.set("opening_hours", JSON.stringify(openingHours))

      if (logoFile) {
        formData.set("logo_file", logoFile)
      }
      if (coverFile) {
        formData.set("cover_file", coverFile)
      }

      const result = await submitBusiness(formData)

      if (result.success) {
        router.push("/app/profile")
      } else {
        setError(result.error || "Ein Fehler ist aufgetreten.")
      }
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                s <= step
                  ? "bg-blue-600 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {s}
            </div>
            <span className={`text-sm hidden sm:block ${s <= step ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              {s === 1 ? "Grunddaten" : s === 2 ? "Kontakt & Zeiten" : "Bilder"}
            </span>
            {s < 3 && <div className="flex-1 h-px bg-muted" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Name des Gewerbes *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Bäckerei Müller"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Kategorie *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as BusinessCategory)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {BUSINESS_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Beschreibung
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Beschreiben Sie Ihr Gewerbe..."
              rows={4}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={!name.trim()}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-muted text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Weiter
          </button>
        </div>
      )}

      {/* Step 2: Contact & Hours */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Adresse</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Marktplatz 1, 17207 Röbel/Müritz"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Telefon</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+49 ..."
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="info@example.de"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Website</label>
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://www.example.de"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <OpeningHoursEditor value={openingHours} onChange={setOpeningHours} />

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-2.5 bg-muted hover:bg-accent text-foreground rounded-lg text-sm font-semibold transition-colors"
            >
              Zurück
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              Weiter
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Images */}
      {step === 3 && (
        <div className="space-y-4">
          <BusinessImageUpload
            label="Logo"
            currentUrl={null}
            onFileSelect={handleLogoSelect}
            previewUrl={logoPreview}
          />

          <BusinessImageUpload
            label="Titelbild"
            currentUrl={null}
            onFileSelect={handleCoverSelect}
            previewUrl={coverPreview}
          />

          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="flex-1 py-2.5 bg-muted hover:bg-accent text-foreground rounded-lg text-sm font-semibold transition-colors"
            >
              Zurück
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-muted text-white rounded-lg text-sm font-semibold transition-colors"
            >
              {isSubmitting ? "Wird eingereicht..." : "Gewerbe einreichen"}
            </button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Ihr Gewerbe wird nach der Einreichung von einem Administrator geprüft.
          </p>
        </div>
      )}
    </div>
  )
}
