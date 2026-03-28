"use client";

import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { Sun, Moon, Monitor, Bell, Shield, Wallet, Info } from "lucide-react";
import Link from "next/link";
import { useActiveAccount } from "thirdweb/react";
import { formatWalletAddress } from "@/lib/user-types";

function ThemeOption({
  value,
  label,
  icon: Icon,
  current,
  onSelect,
}: {
  value: string;
  label: string;
  icon: React.ElementType;
  current: string;
  onSelect: (value: string) => void;
}) {
  const isActive = current === value;
  return (
    <button
      onClick={() => onSelect(value)}
      className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
        isActive
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50 hover:bg-accent"
      }`}
    >
      <Icon className={`h-6 w-6 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
      <span className={`text-sm font-medium ${isActive ? "text-primary" : "text-foreground"}`}>
        {label}
      </span>
    </button>
  );
}

function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 bg-muted rounded-lg">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-base font-medium text-foreground">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function EinstellungenPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const account = useActiveAccount();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold text-foreground">Einstellungen</h1>
        <div className="bg-card border border-border rounded-lg p-5 animate-pulse">
          <div className="h-6 bg-muted rounded w-1/3 mb-4" />
          <div className="grid grid-cols-3 gap-3">
            <div className="h-24 bg-muted rounded-lg" />
            <div className="h-24 bg-muted rounded-lg" />
            <div className="h-24 bg-muted rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Einstellungen</h1>

      {/* Appearance / Theme */}
      <SettingsSection
        title="Erscheinungsbild"
        description="Wähle dein bevorzugtes Farbschema"
        icon={Sun}
      >
        <div className="grid grid-cols-3 gap-3">
          <ThemeOption
            value="light"
            label="Hell"
            icon={Sun}
            current={theme || "system"}
            onSelect={setTheme}
          />
          <ThemeOption
            value="dark"
            label="Dunkel"
            icon={Moon}
            current={theme || "system"}
            onSelect={setTheme}
          />
          <ThemeOption
            value="system"
            label="System"
            icon={Monitor}
            current={theme || "system"}
            onSelect={setTheme}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Aktuell aktiv: <span className="font-medium text-foreground">{resolvedTheme === "dark" ? "Dunkel" : "Hell"}</span>
        </p>
      </SettingsSection>

      {/* Notifications */}
      <SettingsSection
        title="Benachrichtigungen"
        description="Verwalte deine Benachrichtigungseinstellungen"
        icon={Bell}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-foreground">Push-Benachrichtigungen</p>
              <p className="text-xs text-muted-foreground">Erhalte Benachrichtigungen zu Veranstaltungen und Vorschlägen</p>
            </div>
            <Link
              href="/app/notifications"
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Verwalten
            </Link>
          </div>
        </div>
      </SettingsSection>

      {/* Privacy */}
      <SettingsSection
        title="Datenschutz"
        description="Steuere die Sichtbarkeit deines Profils"
        icon={Shield}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-foreground">Profil-Sichtbarkeit</p>
              <p className="text-xs text-muted-foreground">Lege fest, welche Informationen andere sehen können</p>
            </div>
            <Link
              href="/app/profile"
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Bearbeiten
            </Link>
          </div>
        </div>
      </SettingsSection>

      {/* Account */}
      <SettingsSection
        title="Konto"
        description="Wallet-Verbindung und Kontoinformationen"
        icon={Wallet}
      >
        <div className="space-y-3">
          {account?.address ? (
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-foreground">Verbundene Wallet</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {formatWalletAddress(account.address)}
                </p>
              </div>
              <span className="text-xs text-green-600 font-medium">Verbunden</span>
            </div>
          ) : (
            <div className="py-2">
              <p className="text-sm text-muted-foreground">Keine Wallet verbunden</p>
            </div>
          )}
        </div>
      </SettingsSection>

      {/* About */}
      <SettingsSection
        title="Über die App"
        description="Informationen und Hilfe"
        icon={Info}
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2">
            <p className="text-sm text-foreground">Version</p>
            <p className="text-xs text-muted-foreground">1.0.0</p>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-border">
            <p className="text-sm text-foreground">Hilfecenter</p>
            <Link
              href="/app/support"
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Öffnen
            </Link>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-border">
            <p className="text-sm text-foreground">Über uns</p>
            <Link
              href="/about"
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Mehr erfahren
            </Link>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-border">
            <p className="text-sm text-foreground">Datenschutzerklärung</p>
            <Link
              href="/datenschutz"
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Lesen
            </Link>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-border">
            <p className="text-sm text-foreground">Impressum</p>
            <Link
              href="/impressum"
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Lesen
            </Link>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
