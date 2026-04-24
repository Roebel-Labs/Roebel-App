"use client";

import { useActiveAccount, ConnectButton } from "thirdweb/react";
import { client } from "@/app/client";
import { activeChain } from "@/lib/chains";
import { wallets } from "@/lib/wallet-config";
import Link from "next/link";
import Image from "next/image";
import { de } from "@/lib/translations/de";
import { useState } from "react";
import { usePathname } from "next/navigation";

export function Header() {
  const account = useActiveAccount();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => {
    return pathname === path || pathname?.startsWith(path + "/");
  };

  const navLinks = [
    { href: "/verifizierung", label: de.navigation.verification },
    { href: "/verifizierung/antraege", label: "Anträge" },
    { href: "/graph", label: "Bürger für Röbel" },
    { href: "/proposals", label: de.navigation.proposals },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card shadow-sm">
      <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <Image
              src="/logo.png"
              alt="Bürger für Röbel Logo"
              width={40}
              height={40}
              className="object-contain"
            />
            <div className="text-base sm:text-lg font-medium text-foreground">
              Bürger für Röbel
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex gap-1 flex-1 justify-center">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive(link.href)
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
            {account && (
              <Link
                href="/profile"
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive("/profile")
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Profil
              </Link>
            )}
          </nav>

          {/* Right Side - Connect Button + Mobile Menu */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
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
            </div>

            <div className="block sm:hidden">
              <ConnectButton
                client={client}
                chain={activeChain}
                wallets={wallets}
                connectModal={{
                  title: "Anmelden",
                  size: "compact",
                }}
                theme="light"
              />
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 sm:p-2 text-muted-foreground hover:text-foreground rounded-md transition-colors flex-shrink-0"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <nav className="lg:hidden mt-3 pb-3 border-t border-border pt-3 animate-in slide-in-from-top-2">
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isActive(link.href)
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              {account && (
                <Link
                  href="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isActive("/profile")
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  Profil
                </Link>
              )}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
