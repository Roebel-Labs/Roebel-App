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
