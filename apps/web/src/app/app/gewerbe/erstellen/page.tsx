"use client"

import Link from "next/link"
import { ArrowLeft, Store } from "lucide-react"
import { useActiveAccount } from "thirdweb/react"
import { BusinessSubmissionForm } from "@/components/business/BusinessSubmissionForm"

export default function CreateBusinessPage() {
  const account = useActiveAccount()

  if (!account?.address) {
    return (
      <div className="text-center py-12">
        <Store className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground font-medium">Wallet nicht verbunden</p>
        <p className="text-sm text-muted-foreground mt-1">
          Bitte verbinden Sie Ihre Wallet, um ein Gewerbe anzumelden.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link
        href="/app/gewerbe"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zum Verzeichnis
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Gewerbe anmelden</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registrieren Sie Ihr Unternehmen im Gewerbe-Verzeichnis von Röbel/Müritz.
        </p>
      </div>

      <BusinessSubmissionForm walletAddress={account.address} />
    </div>
  )
}
