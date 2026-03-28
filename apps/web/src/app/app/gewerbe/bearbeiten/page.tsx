"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Store, Upload, Camera } from "lucide-react"
import { useActiveAccount } from "thirdweb/react"
import { getBusinessesByOwner, updateBusiness, uploadBusinessImage } from "@/app/actions/businesses"
import type { Business, BusinessCategory, OpeningHours } from "@/types/business"
import { BUSINESS_CATEGORIES, getCategoryLabel } from "@/types/business"
import { OpeningHoursEditor } from "@/components/business/OpeningHoursEditor"

export default function EditBusinessPage() {
  const account = useActiveAccount()
  const router = useRouter()

  const [business, setBusiness] = useState<Business | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<BusinessCategory>("sonstiges")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [address, setAddress] = useState("")
  const [openingHours, setOpeningHours] = useState<OpeningHours>({})

  // Image state
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      if (!account?.address) return
      setIsLoading(true)
      const result = await getBusinessesByOwner(account.address)
      if (result.success && result.data && result.data.length > 0) {
        const biz = result.data[0]
        setBusiness(biz)
        setName(biz.name)
        setDescription(biz.description || "")
        setCategory(biz.category)
        setPhone(biz.phone || "")
        setEmail(biz.email || "")
        setWebsiteUrl(biz.website_url || "")
        setAddress(biz.address || "")
        setOpeningHours(biz.opening_hours || {})
        setLogoUrl(biz.logo_url)
        setCoverUrl(biz.cover_image_url)
      }
      setIsLoading(false)
    }
    load()
  }, [account?.address])

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      setLogoPreview(URL.createObjectURL(file))
    }
  }

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setCoverFile(file)
      setCoverPreview(URL.createObjectURL(file))
    }
  }

  const handleSave = async () => {
    if (!business) return
    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      // Upload images if changed
      let newLogoUrl = logoUrl
      let newCoverUrl = coverUrl

      if (logoFile) {
        const formData = new FormData()
        formData.append("file", logoFile)
        formData.append("type", "logo")
        const uploadResult = await uploadBusinessImage(formData)
        if (uploadResult.success && uploadResult.url) {
          newLogoUrl = uploadResult.url
        } else {
          setError(uploadResult.error || "Fehler beim Logo-Upload.")
          setIsSaving(false)
          return
        }
      }

      if (coverFile) {
        const formData = new FormData()
        formData.append("file", coverFile)
        formData.append("type", "cover")
        const uploadResult = await uploadBusinessImage(formData)
        if (uploadResult.success && uploadResult.url) {
          newCoverUrl = uploadResult.url
        } else {
          setError(uploadResult.error || "Fehler beim Titelbild-Upload.")
          setIsSaving(false)
          return
        }
      }

      const result = await updateBusiness({
        id: business.id,
        name,
        description: description || undefined,
        category,
        phone: phone || undefined,
        email: email || undefined,
        website_url: websiteUrl || undefined,
        address: address || undefined,
        opening_hours: openingHours,
        logo_url: newLogoUrl || undefined,
        cover_image_url: newCoverUrl || undefined,
      })

      if (result.success) {
        setSuccessMessage("Gewerbe erfolgreich aktualisiert.")
        if (result.data) {
          setBusiness(result.data)
          setLogoUrl(result.data.logo_url)
          setCoverUrl(result.data.cover_image_url)
          setLogoFile(null)
          setCoverFile(null)
          setLogoPreview(null)
          setCoverPreview(null)
        }
      } else {
        setError(result.error || "Fehler beim Speichern.")
      }
    } catch (err) {
      console.error("Save error:", err)
      setError("Ein unerwarteter Fehler ist aufgetreten.")
    }
    setIsSaving(false)
  }

  if (!account?.address) {
    return (
      <div className="text-center py-12">
        <Store className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground font-medium">Wallet nicht verbunden</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="h-48 bg-muted rounded-xl" />
        <div className="h-40 bg-muted rounded" />
      </div>
    )
  }

  if (!business) {
    return (
      <div className="text-center py-12">
        <Store className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground font-medium">Kein Gewerbe gefunden</p>
        <Link
          href="/app/gewerbe/erstellen"
          className="inline-flex items-center gap-1 mt-4 text-sm text-primary hover:text-primary/80"
        >
          Gewerbe anmelden
        </Link>
      </div>
    )
  }

  const displayCover = coverPreview || coverUrl
  const displayLogo = logoPreview || logoUrl

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        href={`/app/gewerbe/${business.slug}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zum Gewerbe
      </Link>

      {/* Profile-style header with cover + logo */}
      <div>
        {/* Cover Image */}
        <div
          className="relative h-48 md:h-64 bg-muted rounded-xl overflow-hidden cursor-pointer group"
          onClick={() => coverInputRef.current?.click()}
        >
          {displayCover ? (
            <Image
              src={displayCover}
              alt="Titelbild"
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <Upload className="h-8 w-8" />
              <span className="text-sm">Titelbild hochladen</span>
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <Camera className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            onChange={handleCoverSelect}
            className="hidden"
          />
        </div>

        {/* Logo + Name */}
        <div className="relative px-4 -mt-10">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
            {/* Logo */}
            <div
              className="relative flex-shrink-0 w-20 h-20 rounded-xl bg-card border-4 border-white shadow-sm overflow-hidden flex items-center justify-center cursor-pointer group"
              onClick={() => logoInputRef.current?.click()}
            >
              {displayLogo ? (
                <Image
                  src={displayLogo}
                  alt="Logo"
                  width={80}
                  height={80}
                  className="object-cover w-full h-full"
                />
              ) : (
                <Store className="h-8 w-8 text-muted-foreground" />
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <Camera className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoSelect}
                className="hidden"
              />
            </div>

            <div className="flex-1 min-w-0 pb-1">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">
                {name || business.name}
              </h1>
              <span className="inline-block text-sm font-medium text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full mt-1">
                {getCategoryLabel(category)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      {successMessage && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{successMessage}</div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Kategorie</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as BusinessCategory)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {BUSINESS_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Beschreibung</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Adresse</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
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
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">E-Mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <OpeningHoursEditor value={openingHours} onChange={setOpeningHours} />

        <button
          onClick={handleSave}
          disabled={isSaving || !name.trim()}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-muted text-white rounded-lg text-sm font-semibold transition-colors"
        >
          {isSaving ? "Wird gespeichert..." : "Änderungen speichern"}
        </button>
      </div>
    </div>
  )
}
