"use client"

import { useActiveAccount } from "thirdweb/react"
import { OrgRegistrationWizard } from "@/components/business/OrgRegistrationWizard"
import { Store } from "lucide-react"

export default function CreateBusinessPage() {
  const account = useActiveAccount()

  if (!account?.address) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
        <div className="text-center">
          <Store className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Wallet nicht verbunden</p>
          <p className="text-sm text-gray-400 mt-1">
            Bitte verbinde deine Wallet, um ein Gewerbe zu registrieren.
          </p>
        </div>
      </div>
    )
  }

  return <OrgRegistrationWizard walletAddress={account.address} />
}
