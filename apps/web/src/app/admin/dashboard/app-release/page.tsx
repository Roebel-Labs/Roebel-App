"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Smartphone, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  getAppReleaseConfig,
  updateAppReleaseConfig,
  type AppReleaseConfig,
} from "@/app/actions/app-release"

const DEFAULT_CONFIG: AppReleaseConfig = {
  id: 1,
  ios_latest_version: "0.0.0",
  android_latest_version: "0.0.0",
  ios_store_url: "https://apps.apple.com/de/app/r%C3%B6bel/id6754984699",
  android_store_url:
    "https://play.google.com/store/apps/details?id=com.maxbrych.roebelonchain",
  title_de: "Update verfügbar",
  body_de:
    "Eine neue Version der Röbel App ist verfügbar. Aktualisiere jetzt, um die neuesten Funktionen und Verbesserungen zu erhalten.",
  cta_label_de: "Jetzt aktualisieren",
  dismiss_label_de: "Später",
  is_active: true,
  updated_at: new Date().toISOString(),
}

export default function AppReleasePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [config, setConfig] = useState<AppReleaseConfig>(DEFAULT_CONFIG)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const current = await getAppReleaseConfig()
      if (cancelled) return
      if (current) setConfig(current)
      setInitialLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const submitData = new FormData()
    submitData.append("ios_latest_version", config.ios_latest_version)
    submitData.append("android_latest_version", config.android_latest_version)
    submitData.append("ios_store_url", config.ios_store_url)
    submitData.append("android_store_url", config.android_store_url)
    submitData.append("title_de", config.title_de)
    submitData.append("body_de", config.body_de)
    submitData.append("cta_label_de", config.cta_label_de)
    submitData.append("dismiss_label_de", config.dismiss_label_de)
    submitData.append("is_active", String(config.is_active))

    const loadingToast = toast.loading("Wird gespeichert …")
    const result = await updateAppReleaseConfig(submitData)

    if (result.success) {
      toast.success("Gespeichert", {
        id: loadingToast,
        description: result.message,
      })
      if (result.data) setConfig(result.data as AppReleaseConfig)
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
    }
    setLoading(false)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-medium text-foreground">App Release</h1>
          <p className="text-muted-foreground mt-1">
            Steuere das „Update verfügbar“-Modal in der mobilen App.
          </p>
        </div>
      </div>

      {initialLoading ? (
        <div className="bg-card border border-border rounded-[10px] p-6">
          <p className="text-sm text-muted-foreground">Lade aktuelle Konfiguration …</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
            <div className="flex items-start gap-3">
              <Smartphone className="h-5 w-5 mt-1 text-muted-foreground" />
              <div className="flex-1">
                <h3 className="font-medium text-lg">Neueste Versionen</h3>
                <p className="text-sm text-muted-foreground">
                  Nutzer:innen, deren installierte App-Version niedriger ist als die
                  hier eingetragene, sehen beim Start das Update-Modal.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="ios_latest_version">iOS neueste Version</Label>
                <Input
                  id="ios_latest_version"
                  value={config.ios_latest_version}
                  onChange={(e) =>
                    setConfig({ ...config, ios_latest_version: e.target.value })
                  }
                  placeholder="z.B. 2.4.0"
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="android_latest_version">
                  Android neueste Version
                </Label>
                <Input
                  id="android_latest_version"
                  value={config.android_latest_version}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      android_latest_version: e.target.value,
                    })
                  }
                  placeholder="z.B. 2.4.0"
                  required
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="ios_store_url">iOS App Store URL</Label>
                <Input
                  id="ios_store_url"
                  value={config.ios_store_url}
                  onChange={(e) =>
                    setConfig({ ...config, ios_store_url: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="android_store_url">Google Play Store URL</Label>
                <Input
                  id="android_store_url"
                  value={config.android_store_url}
                  onChange={(e) =>
                    setConfig({ ...config, android_store_url: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
            <h3 className="font-medium text-lg">Modal-Texte (Deutsch)</h3>

            <div>
              <Label htmlFor="title_de">Titel</Label>
              <Input
                id="title_de"
                value={config.title_de}
                onChange={(e) => setConfig({ ...config, title_de: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="body_de">Beschreibung</Label>
              <Textarea
                id="body_de"
                value={config.body_de}
                onChange={(e) => setConfig({ ...config, body_de: e.target.value })}
                rows={4}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="cta_label_de">CTA-Button</Label>
                <Input
                  id="cta_label_de"
                  value={config.cta_label_de}
                  onChange={(e) =>
                    setConfig({ ...config, cta_label_de: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="dismiss_label_de">„Später“-Button</Label>
                <Input
                  id="dismiss_label_de"
                  value={config.dismiss_label_de}
                  onChange={(e) =>
                    setConfig({ ...config, dismiss_label_de: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-[10px] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-lg">Aktiv</h3>
                <p className="text-sm text-muted-foreground">
                  Wenn deaktiviert, wird das Modal niemals angezeigt — unabhängig von
                  den Versionsangaben.
                </p>
              </div>
              <Switch
                checked={config.is_active}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, is_active: checked })
                }
              />
            </div>
            {!config.is_active && (
              <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>
                  Das Update-Modal ist global deaktiviert und wird in der App nicht
                  erscheinen.
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={
                loading ||
                !config.ios_latest_version.trim() ||
                !config.android_latest_version.trim()
              }
            >
              <Save className="h-4 w-4 mr-2" />
              Speichern
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
