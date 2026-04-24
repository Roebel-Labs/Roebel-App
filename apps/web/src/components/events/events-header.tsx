"use client"

import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Plus, Menu, X } from "lucide-react"
import { useState } from "react"
import { ConnectButton } from "thirdweb/react"
import { client } from "@/app/client"
import { activeChain } from "@/lib/chains"
import { wallets } from "@/lib/wallet-config"

export function EventsHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="bg-card border-b border-border">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity">
            <div className="relative h-7 w-7 md:h-8 md:w-8">
              <Image
                src="/logo.png"
                alt="Wappen Röbel/Müritz"
                fill
                className="object-contain"
                sizes="32px"
              />
            </div>
            <h1 className="text-xl md:text-xl font-medium tracking-tight text-foreground">Röbel App</h1>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <Link href="/" className="text-foreground hover:text-foreground transition-colors font-medium">
              Events
            </Link>
            <Link href="/submit" className="text-foreground hover:text-foreground transition-colors font-medium">
              Event einreichen
            </Link>
          </nav>

          <div className="flex items-center gap-2 md:gap-4">
            <ConnectButton
              client={client}
              chain={activeChain}
              wallets={wallets}
              connectModal={{
                title: "Bei Röbel/Müritz DAO anmelden",
                size: "compact",
              }}
              theme="light"
            />

            <Button asChild className="h-9 md:h-10 px-3 md:px-6 text-sm md:text-base">
              <Link href="/submit">
                <Plus className="h-4 w-4 md:mr-2" />
                <span className="hidden sm:inline">Hinzufügen</span>
              </Link>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <nav className="md:hidden pt-4 pb-2 border-t border-border mt-3">
            <div className="flex flex-col gap-3">
              <Link
                href="/"
                className="text-foreground hover:text-foreground transition-colors font-medium py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Events
              </Link>
              <Link
                href="/submit"
                className="text-foreground hover:text-foreground transition-colors font-medium py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Event einreichen
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  )
}
