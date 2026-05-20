"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Store, CheckCircle, Clock, XCircle, Eye, Mail } from "lucide-react"
import {
  getAdminOrgRequests,
  approveOrgRequest,
  rejectOrgRequest,
  type OrgRequestRow,
  type OrgReviewStatus,
} from "@/app/actions/admin-businesses"
import { SUB_TYPE_LABELS, SUB_TYPE_EMOJI } from "@/types/account"

export default function AdminGewerbePage() {
  const [rows, setRows] = useState<OrgRequestRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<OrgReviewStatus | "all">("all")

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const result = await getAdminOrgRequests(
        statusFilter === "all" ? undefined : statusFilter
      )
      if (result.success && result.data) {
        setRows(result.data)
      }
      setIsLoading(false)
    }
    load()
  }, [statusFilter])

  const handleApprove = async (id: string) => {
    const result = await approveOrgRequest(id)
    if (result.success && result.data) {
      setRows((prev) => prev.map((r) => (r.id === id ? result.data! : r)))
    }
  }

  const handleReject = async (id: string) => {
    const notes = prompt("Ablehnungsgrund (optional):")
    const result = await rejectOrgRequest(id, undefined, notes || undefined)
    if (result.success && result.data) {
      setRows((prev) => prev.map((r) => (r.id === id ? result.data! : r)))
    }
  }

  const statusIcons: Record<OrgReviewStatus, React.ReactNode> = {
    pending: <Clock className="h-4 w-4 text-amber-500" />,
    published: <CheckCircle className="h-4 w-4 text-green-500" />,
    rejected: <XCircle className="h-4 w-4 text-red-500" />,
  }

  const statusLabels: Record<OrgReviewStatus, string> = {
    pending: "In Prüfung",
    published: "Veröffentlicht",
    rejected: "Abgelehnt",
  }

  const pendingCount = rows.filter((r) => r.derived_status === "pending").length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Store className="h-6 w-6" />
          Gewerbe-Verwaltung
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Prüfen und verwalten Sie neue Organisationen (Gewerbe, Vereine,
          Stadt-Konten, Journalist:innen).
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
            {status === "pending" && pendingCount > 0 && (
              <span className="ml-1.5 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Org Request List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card rounded-lg border border-border p-4 animate-pulse">
              <div className="h-5 bg-muted rounded w-1/3 mb-2" />
              <div className="h-4 bg-muted rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : rows.length > 0 ? (
        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="bg-card rounded-lg border border-border p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {statusIcons[row.derived_status]}
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground flex items-center gap-2 flex-wrap">
                      <span aria-hidden>
                        {row.sub_type ? SUB_TYPE_EMOJI[row.sub_type] : "🏢"}
                      </span>
                      <span>{row.name}</span>
                      {row.is_extern && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                          Extern
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {row.sub_type ? SUB_TYPE_LABELS[row.sub_type] : "Organisation"}
                      </span>
                      <span className="text-xs text-muted-foreground">|</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(row.created_at).toLocaleDateString("de-DE")}
                      </span>
                    </div>
                    {row.contact_email && (
                      <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5 mt-1">
                        <Mail className="h-3 w-3" />
                        {row.contact_email}
                      </p>
                    )}
                    {row.extern_reason && (
                      <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">
                        {row.extern_reason}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {row.business_id && (
                    <Link
                      href={`/admin/dashboard/gewerbe/${row.business_id}`}
                      className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                      title="Details anzeigen"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                  )}

                  {row.derived_status === "pending" && (
                    <>
                      <button
                        onClick={() => handleApprove(row.id)}
                        className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Genehmigen
                      </button>
                      <button
                        onClick={() => handleReject(row.id)}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Ablehnen
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Store className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Keine Konto-Anträge gefunden.</p>
        </div>
      )}
    </div>
  )
}
