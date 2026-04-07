"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Store, CheckCircle, Clock, XCircle, Eye } from "lucide-react"
import { getAdminBusinesses, approveBusiness, rejectBusiness } from "@/app/actions/admin-businesses"
import type { Business, BusinessStatus } from "@/types/business"
import { getCategoryLabel } from "@/types/business"

export default function AdminGewerbePage() {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<BusinessStatus | "all">("all")

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const result = await getAdminBusinesses(
        statusFilter === "all" ? undefined : statusFilter
      )
      if (result.success && result.data) {
        setBusinesses(result.data)
      }
      setIsLoading(false)
    }
    load()
  }, [statusFilter])

  const handleApprove = async (id: string) => {
    const result = await approveBusiness(id)
    if (result.success && result.data) {
      setBusinesses(businesses.map((b) => (b.id === id ? result.data! : b)))
    }
  }

  const handleReject = async (id: string) => {
    const notes = prompt("Ablehnungsgrund (optional):")
    const result = await rejectBusiness(id, notes || undefined)
    if (result.success && result.data) {
      setBusinesses(businesses.map((b) => (b.id === id ? result.data! : b)))
    }
  }

  const statusIcons = {
    pending: <Clock className="h-4 w-4 text-amber-500" />,
    published: <CheckCircle className="h-4 w-4 text-green-500" />,
    rejected: <XCircle className="h-4 w-4 text-red-500" />,
  }

  const statusLabels = {
    pending: "In Prüfung",
    published: "Veröffentlicht",
    rejected: "Abgelehnt",
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Store className="h-6 w-6" />
          Gewerbe-Verwaltung
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Prüfen und verwalten Sie Gewerbeanmeldungen.
        </p>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        {(["all", "pending", "published", "rejected"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              statusFilter === status
                ? "bg-card border border-b-white border-border text-foreground -mb-px"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {status === "all" ? "Alle" : statusLabels[status]}
            {status === "pending" && businesses.filter((b) => b.status === "pending").length > 0 && (
              <span className="ml-1.5 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">
                {businesses.filter((b) => b.status === "pending").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Business List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card rounded-lg border border-border p-4 animate-pulse">
              <div className="h-5 bg-muted rounded w-1/3 mb-2" />
              <div className="h-4 bg-muted rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : businesses.length > 0 ? (
        <div className="space-y-3">
          {businesses.map((business) => (
            <div
              key={business.id}
              className="bg-card rounded-lg border border-border p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {statusIcons[business.status]}
                  <div>
                    <h3 className="font-semibold text-foreground">{business.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {getCategoryLabel(business.category)}
                      </span>
                      <span className="text-xs text-muted-foreground">|</span>
                      <span className="text-xs text-muted-foreground">
                        {business.owner_wallet_address.slice(0, 6)}...{business.owner_wallet_address.slice(-4)}
                      </span>
                      <span className="text-xs text-muted-foreground">|</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(business.created_at).toLocaleDateString("de-DE")}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/dashboard/gewerbe/${business.id}`}
                    className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                    title="Details anzeigen"
                  >
                    <Eye className="h-4 w-4" />
                  </Link>

                  {business.status === "pending" && (
                    <>
                      <button
                        onClick={() => handleApprove(business.id)}
                        className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Genehmigen
                      </button>
                      <button
                        onClick={() => handleReject(business.id)}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Ablehnen
                      </button>
                    </>
                  )}
                </div>
              </div>

              {business.admin_notes && (
                <div className="mt-2 text-xs text-muted-foreground bg-muted p-2 rounded">
                  <strong>Notiz:</strong> {business.admin_notes}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Store className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Keine Gewerbe gefunden.</p>
        </div>
      )}
    </div>
  )
}
