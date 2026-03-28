"use client"

import { use, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Store } from "lucide-react"
import { useActiveAccount } from "thirdweb/react"
import {
  getDealById,
  getBusinessesByOwner,
  updateDeal,
} from "@/app/actions/businesses"
import type { Business, BusinessDeal, DealType, DealStatus } from "@/types/business"
import { DealForm } from "@/components/business/DealForm"
import { AdPreview } from "@/components/business/AdPreview"

export default function EditDealPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const account = useActiveAccount()
  const [deal, setDeal] = useState<BusinessDeal | null>(null)
  const [business, setBusiness] = useState<Business | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Live preview state
  const [previewData, setPreviewData] = useState({
    title: "",
    description: "",
    deal_type: "discount" as DealType,
    deal_value: "",
    start_date: "",
    end_date: "",
    media_urls: [] as string[],
    video_url: null as string | null,
    status: "active" as DealStatus,
  })

  useEffect(() => {
    async function load() {
      if (!account?.address) return
      setIsLoading(true)

      // Load business
      const bizResult = await getBusinessesByOwner(account.address)
      if (!bizResult.success || !bizResult.data || bizResult.data.length === 0) {
        setError("Kein Gewerbe gefunden")
        setIsLoading(false)
        return
      }
      const biz = bizResult.data[0]
      setBusiness(biz)

      // Load deal
      const dealResult = await getDealById(id)
      if (!dealResult.success || !dealResult.data) {
        setError("Angebot nicht gefunden")
        setIsLoading(false)
        return
      }

      // Verify ownership
      if (dealResult.data.business_id !== biz.id) {
        setError("Kein Zugriff auf dieses Angebot")
        setIsLoading(false)
        return
      }

      setDeal(dealResult.data)
      setPreviewData({
        title: dealResult.data.title,
        description: dealResult.data.description || "",
        deal_type: dealResult.data.deal_type,
        deal_value: dealResult.data.deal_value || "",
        start_date: dealResult.data.start_date || "",
        end_date: dealResult.data.end_date || "",
        media_urls: dealResult.data.media_urls || [],
        video_url: dealResult.data.video_url || null,
        status: dealResult.data.status || "active",
      })
      setIsLoading(false)
    }
    load()
  }, [account?.address, id])

  const handleSave = async (data: {
    title: string
    description: string
    deal_type: DealType
    deal_value: string
    start_date: string
    end_date: string
    media_urls: string[]
    video_url: string | null
    status: DealStatus
  }) => {
    if (!deal) return
    setIsSubmitting(true)

    const result = await updateDeal({
      id: deal.id,
      title: data.title,
      description: data.description || undefined,
      deal_type: data.deal_type,
      deal_value: data.deal_value || undefined,
      start_date: data.start_date || undefined,
      end_date: data.end_date || undefined,
      media_urls: data.media_urls,
      video_url: data.video_url || undefined,
      status: data.status,
    })

    if (result.success) {
      setSaveSuccess(true)
      setTimeout(() => {
        router.push("/app/gewerbe/angebote")
      }, 1000)
    }
    setIsSubmitting(false)
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
      <div className="animate-pulse space-y-4 max-w-3xl">
        <div className="h-6 bg-muted rounded w-1/4" />
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="h-64 bg-muted rounded" />
      </div>
    )
  }

  if (error || !deal || !business) {
    return (
      <div className="text-center py-12 max-w-3xl">
        <Store className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground font-medium">{error || "Fehler beim Laden"}</p>
        <Link
          href="/app/gewerbe/angebote"
          className="inline-flex items-center gap-1 mt-4 text-sm text-primary hover:text-primary/80"
        >
          <ArrowLeft className="h-4 w-4" />
          Zum Anzeigen-Manager
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link
          href="/app/gewerbe/angebote"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Anzeigen-Manager
        </Link>
        <h1 className="text-xl font-bold text-foreground">Angebot bearbeiten</h1>
      </div>

      {saveSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
          Angebot erfolgreich gespeichert. Weiterleitung...
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-card rounded-xl border border-border p-4">
          <DealForm
            onSubmit={handleSave}
            onCancel={() => router.push("/app/gewerbe/angebote")}
            initialData={{
              title: deal.title,
              description: deal.description || undefined,
              deal_type: deal.deal_type,
              deal_value: deal.deal_value || undefined,
              start_date: deal.start_date || undefined,
              end_date: deal.end_date || undefined,
              media_urls: deal.media_urls || [],
              video_url: deal.video_url,
              status: deal.status,
            }}
            isSubmitting={isSubmitting}
          />
        </div>

        {/* Preview */}
        <div className="hidden lg:block">
          <AdPreview
            dealData={previewData}
            businessName={business.name}
            businessSlug={business.slug}
            businessLogoUrl={business.logo_url}
            businessCategory={business.category}
          />
        </div>
      </div>
    </div>
  )
}
