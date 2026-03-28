"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft,
  Plus,
  Store,
  Trash2,
  Eye,
  MousePointerClick,
  Zap,
  Pencil,
  BarChart3,
  X,
} from "lucide-react"
import { useActiveAccount } from "thirdweb/react"
import {
  getBusinessesByOwner,
  getBusinessDeals,
  createDeal,
  updateDeal,
  deleteDeal,
} from "@/app/actions/businesses"
import type { Business, BusinessDeal, DealType, DealStatus } from "@/types/business"
import { getDealTypeLabel } from "@/types/business"
import { DealForm } from "@/components/business/DealForm"
import { AdStatusBadge } from "@/components/business/AdStatusBadge"
import { AdPreview } from "@/components/business/AdPreview"
import { AdAnalyticsDashboard } from "@/components/business/AdAnalyticsDashboard"
import { BoostAdModal } from "@/components/business/BoostAdModal"

type TabKey = "alle" | "active" | "draft" | "paused" | "stats"
type SortKey = "newest" | "views" | "clicks"

const TABS: { key: TabKey; label: string }[] = [
  { key: "alle", label: "Alle" },
  { key: "active", label: "Aktiv" },
  { key: "draft", label: "Entwurf" },
  { key: "paused", label: "Pausiert" },
  { key: "stats", label: "Statistiken" },
]

export default function AdManagerPage() {
  const account = useActiveAccount()
  const [business, setBusiness] = useState<Business | null>(null)
  const [deals, setDeals] = useState<BusinessDeal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>("alle")
  const [sortBy, setSortBy] = useState<SortKey>("newest")
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [boostDealTitle, setBoostDealTitle] = useState<string | null>(null)

  // Form state for live preview
  const [formData, setFormData] = useState({
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

      const bizResult = await getBusinessesByOwner(account.address)
      if (bizResult.success && bizResult.data && bizResult.data.length > 0) {
        const biz = bizResult.data[0]
        setBusiness(biz)

        const dealsResult = await getBusinessDeals(biz.id)
        if (dealsResult.success && dealsResult.data) {
          setDeals(dealsResult.data)
        }
      }
      setIsLoading(false)
    }
    load()
  }, [account?.address])

  const filteredDeals = useMemo(() => {
    let filtered = deals
    if (activeTab === "active") filtered = deals.filter((d) => d.status === "active")
    else if (activeTab === "draft") filtered = deals.filter((d) => d.status === "draft")
    else if (activeTab === "paused") filtered = deals.filter((d) => d.status === "paused")

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "views":
          return (b.views_count || 0) - (a.views_count || 0)
        case "clicks":
          return (b.clicks_count || 0) - (a.clicks_count || 0)
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })
  }, [deals, activeTab, sortBy])

  const handleCreateDeal = async (data: {
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
    if (!business) return
    setIsSubmitting(true)

    const result = await createDeal({
      business_id: business.id,
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

    if (result.success && result.data) {
      setDeals([result.data, ...deals])
      setShowForm(false)
    }
    setIsSubmitting(false)
  }

  const handleToggleStatus = async (deal: BusinessDeal) => {
    const newStatus = deal.status === "active" ? "paused" : "active"
    const result = await updateDeal({ id: deal.id, status: newStatus })
    if (result.success && result.data) {
      setDeals(deals.map((d) => (d.id === deal.id ? result.data! : d)))
    }
  }

  const handleDeleteDeal = async (dealId: string) => {
    const result = await deleteDeal(dealId)
    if (result.success) {
      setDeals(deals.filter((d) => d.id !== dealId))
    }
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
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="h-10 bg-muted rounded" />
        <div className="h-20 bg-muted rounded" />
        <div className="h-20 bg-muted rounded" />
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

  return (
    <div className="max-w-3xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/app/gewerbe/${business.slug}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Zum Gewerbe
          </Link>
          <h1 className="text-xl font-bold text-foreground">Anzeigen-Manager</h1>
        </div>
        <button
          onClick={() => { setShowForm(!showForm) }}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          Neues Angebot
        </button>
      </div>

      {/* Create Form + Preview */}
      {showForm && (
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Neues Angebot erstellen</h3>
            <button onClick={() => setShowForm(false)} className="p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DealForm
              onSubmit={handleCreateDeal}
              onCancel={() => setShowForm(false)}
              isSubmitting={isSubmitting}
            />
            <div className="hidden lg:block">
              <AdPreview
                dealData={formData}
                businessName={business.name}
                businessSlug={business.slug}
                businessLogoUrl={business.logo_url}
                businessCategory={business.category}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-blue-600 text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.key !== "stats" && tab.key !== "alle" && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({deals.filter((d) =>
                  tab.key === "active" ? d.status === "active" :
                  tab.key === "draft" ? d.status === "draft" :
                  d.status === "paused"
                ).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Statistics Tab */}
      {activeTab === "stats" ? (
        <AdAnalyticsDashboard deals={deals} />
      ) : (
        <>
          {/* Sort bar */}
          {filteredDeals.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{filteredDeals.length} Anzeige{filteredDeals.length !== 1 ? "n" : ""}</p>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="text-xs border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="newest">Neueste</option>
                <option value="views">Meiste Aufrufe</option>
                <option value="clicks">Meiste Klicks</option>
              </select>
            </div>
          )}

          {/* Deals list */}
          {filteredDeals.length > 0 ? (
            <div className="space-y-3">
              {filteredDeals.map((deal) => {
                const firstImage = deal.media_urls?.[0] || deal.image_url
                return (
                  <div
                    key={deal.id}
                    className={`bg-card rounded-xl border p-4 transition-opacity ${
                      deal.status === "paused" || deal.status === "expired" ? "border-border opacity-60" : "border-border"
                    }`}
                  >
                    <div className="flex gap-3">
                      {/* Thumbnail */}
                      {firstImage && (
                        <div className="w-16 h-16 rounded-lg bg-muted overflow-hidden flex-shrink-0 relative">
                          <Image src={firstImage} alt={deal.title} fill className="object-cover" />
                          {deal.media_urls && deal.media_urls.length > 1 && (
                            <span className="absolute bottom-0.5 right-0.5 text-[9px] font-medium bg-black/60 text-white px-1 rounded">
                              +{deal.media_urls.length - 1}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="font-semibold text-foreground text-sm truncate">{deal.title}</h3>
                          <AdStatusBadge status={deal.status} />
                          {deal.is_boosted && (
                            <span className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
                              <Zap className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{getDealTypeLabel(deal.deal_type)}</span>
                          {deal.deal_value && (
                            <span className="font-medium text-green-600">{deal.deal_value}</span>
                          )}
                        </div>

                        {/* Analytics row */}
                        <div className="flex items-center gap-4 mt-1.5">
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Eye className="h-3 w-3" />
                            {deal.views_count || 0}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <MousePointerClick className="h-3 w-3" />
                            {deal.clicks_count || 0}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-start gap-0.5 flex-shrink-0">
                        <Link
                          href={`/app/gewerbe/angebote/${deal.id}`}
                          className="p-1.5 text-muted-foreground hover:text-primary transition-colors"
                          title="Bearbeiten"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => handleToggleStatus(deal)}
                          className={`p-1.5 transition-colors ${
                            deal.status === "active"
                              ? "text-green-600 hover:text-amber-600"
                              : "text-muted-foreground hover:text-green-600"
                          }`}
                          title={deal.status === "active" ? "Pausieren" : "Aktivieren"}
                        >
                          {deal.status === "active" ? (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => setBoostDealTitle(deal.title)}
                          className="p-1.5 text-muted-foreground hover:text-yellow-500 transition-colors"
                          title="Bewerben"
                        >
                          <Zap className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteDeal(deal.id)}
                          className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors"
                          title="Entfernen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8 bg-card rounded-xl border border-border">
              <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground font-medium">
                {activeTab === "alle" ? "Noch keine Angebote erstellt" : "Keine Anzeigen in diesem Status"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Erstellen Sie ein Angebot, um es Ihren Kunden anzuzeigen.
              </p>
            </div>
          )}
        </>
      )}

      {/* Boost Modal */}
      {boostDealTitle && (
        <BoostAdModal
          dealTitle={boostDealTitle}
          onClose={() => setBoostDealTitle(null)}
        />
      )}
    </div>
  )
}
