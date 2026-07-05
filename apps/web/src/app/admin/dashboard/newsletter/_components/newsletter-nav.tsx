"use client"

import Link from "next/link"

export function NewsletterNav({ active }: { active: "ausgaben" | "abonnenten" }) {
  const base = "rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
  return (
    <div className="mb-6 flex gap-2">
      <Link
        href="/admin/dashboard/newsletter"
        className={`${base} ${active === "ausgaben" ? "bg-[#00498B] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
      >
        Ausgaben
      </Link>
      <Link
        href="/admin/dashboard/newsletter/abonnenten"
        className={`${base} ${active === "abonnenten" ? "bg-[#00498B] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
      >
        Abonnenten
      </Link>
    </div>
  )
}
