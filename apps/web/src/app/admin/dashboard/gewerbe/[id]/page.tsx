"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Store, CheckCircle, XCircle, Clock, MapPin, Phone, Mail, Globe, Save, Loader2 } from "lucide-react"
import { getAdminBusiness, approveBusiness, rejectBusiness, updateAdminBusinessLocation } from "@/app/actions/admin-businesses"
import type { Business } from "@/types/business"
import { getCategoryLabel, DAYS_OF_WEEK } from "@/types/business"
import { LocationPicker } from "@/components/admin/LocationPicker"
import { toast } from "sonner"

export default function AdminBusinessDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [business, setBusiness] = useState<Business | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [rejectNotes, setRejectNotes] = useState("")
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [locationLat, setLocationLat] = useState<number | null>(null)
  const [locationLng, setLocationLng] = useState<number | null>(null)
  const [savingLocation, setSavingLocation] = useState(false)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const result = await getAdminBusiness(id)
      if (result.success && result.data) {
        setBusiness(result.data)
        setLocationLat(result.data.latitude)
        setLocationLng(result.data.longitude)
      }
      setIsLoading(false)
    }
    load()
  }, [id])

  const handleApprove = async () => {
    if (!business) return
    const result = await approveBusiness(business.id)
    if (result.success && result.data) {
      setBusiness(result.data)
    }
  }

  const handleReject = async () => {
    if (!business) return
    const result = await rejectBusiness(business.id, rejectNotes || undefined)
    if (result.success && result.data) {
      setBusiness(result.data)
      setShowRejectForm(false)
    }
  }

  const handleSaveLocation = async () => {
    if (!business) return
    setSavingLocation(true)
    const result = await updateAdminBusinessLocation(business.id, {
      latitude: locationLat,
      longitude: locationLng,
    })
    if (result.success && result.data) {
      setBusiness(result.data)
      toast.success("Standort gespeichert")
    } else {
      toast.error(result.error || "Fehler beim Speichern")
    }
    setSavingLocation(false)
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-48 bg-muted rounded-xl" />
        <div className="h-6 bg-muted rounded w-1/3" />
      </div>
    )
  }

  if (!business) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Gewerbe nicht gefunden.</p>
      </div>
    )
  }

  const statusConfig = {
    pending: { icon: Clock, label: "In Prüfung", color: "text-amber-700 bg-amber-50" },
    published: { icon: CheckCircle, label: "Veröffentlicht", color: "text-green-700 bg-green-50" },
    rejected: { icon: XCircle, label: "Abgelehnt", color: "text-red-700 bg-red-50" },
  }

  const StatusIcon = statusConfig[business.status].icon

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/admin/dashboard/gewerbe"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Übersicht
      </Link>

      {/* Header */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {business.cover_image_url && (
          <div className="relative h-48 bg-muted">
            <Image
              src={business.cover_image_url}
              alt={business.name}
              fill
              className="object-cover"
            />
          </div>
        )}

        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-lg bg-muted border border-border overflow-hidden flex items-center justify-center flex-shrink-0">
                {business.logo_url ? (
                  <Image src={business.logo_url} alt="Logo" width={64} height={64} className="object-cover w-full h-full" />
                ) : (
                  <Store className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">{business.name}</h1>
                <p className="text-sm text-muted-foreground">{getCategoryLabel(business.category)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Eingereicht am {new Date(business.created_at).toLocaleDateString("de-DE")}
                </p>
              </div>
            </div>

            <span className={`inline-flex items-center gap-1 text-sm font-medium px-3 py-1 rounded-full ${statusConfig[business.status].color}`}>
              <StatusIcon className="h-4 w-4" />
              {statusConfig[business.status].label}
            </span>
          </div>

          {business.description && (
            <p className="mt-4 text-muted-foreground">{business.description}</p>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contact */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="font-semibold text-foreground mb-3">Kontaktdaten</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            {business.address && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                {business.address}
              </div>
            )}
            {business.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {business.phone}
              </div>
            )}
            {business.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {business.email}
              </div>
            )}
            {business.website_url && (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <a href={business.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                  {business.website_url}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Owner */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="font-semibold text-foreground mb-3">Inhaber</h3>
          <p className="text-sm text-muted-foreground font-mono break-all">{business.owner_wallet_address}</p>
        </div>
      </div>

      {/* Opening Hours */}
      {business.opening_hours && Object.keys(business.opening_hours).length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="font-semibold text-foreground mb-3">Öffnungszeiten</h3>
          <div className="space-y-1">
            {DAYS_OF_WEEK.map((day) => {
              const entry = business.opening_hours[day.value]
              return (
                <div key={day.value} className="flex justify-between text-sm py-1">
                  <span className="text-foreground">{day.label}</span>
                  <span className="text-muted-foreground">
                    {entry && !entry.closed ? `${entry.open} – ${entry.close}` : "Geschlossen"}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Location */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Standort</h3>
          <button
            onClick={handleSaveLocation}
            disabled={savingLocation}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {savingLocation ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Standort speichern
          </button>
        </div>
        <LocationPicker
          latitude={locationLat}
          longitude={locationLng}
          address={business.address || ""}
          onCoordinatesChange={(lat, lng) => {
            setLocationLat(lat)
            setLocationLng(lng)
          }}
        />
      </div>

      {/* Admin Actions */}
      {business.status === "pending" && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold text-foreground mb-4">Entscheidung</h3>

          <div className="flex gap-3">
            <button
              onClick={handleApprove}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              Genehmigen
            </button>
            <button
              onClick={() => setShowRejectForm(!showRejectForm)}
              className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-sm font-semibold transition-colors"
            >
              Ablehnen
            </button>
          </div>

          {showRejectForm && (
            <div className="mt-4 space-y-3">
              <textarea
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="Ablehnungsgrund (optional)..."
                rows={3}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
              <button
                onClick={handleReject}
                className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                Ablehnung bestätigen
              </button>
            </div>
          )}
        </div>
      )}

      {/* Admin Notes */}
      {business.admin_notes && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <h3 className="font-semibold text-amber-900 mb-2">Admin-Notiz</h3>
          <p className="text-sm text-amber-800">{business.admin_notes}</p>
        </div>
      )}
    </div>
  )
}
