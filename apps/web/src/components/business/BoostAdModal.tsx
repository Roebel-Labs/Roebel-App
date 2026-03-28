"use client"

import { useState } from "react"
import { X, Star, Zap, Bell } from "lucide-react"

interface BoostAdModalProps {
  dealTitle: string
  onClose: () => void
}

const boostOptions = [
  { days: 7, label: "7 Tage" },
  { days: 14, label: "14 Tage" },
  { days: 30, label: "30 Tage" },
]

export function BoostAdModal({ dealTitle, onClose }: BoostAdModalProps) {
  const [selectedDays, setSelectedDays] = useState(7)
  const [notifyRequested, setNotifyRequested] = useState(false)

  const handleNotify = () => {
    setNotifyRequested(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card rounded-xl shadow-xl max-w-md w-full p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
            <Zap className="h-5 w-5 text-yellow-600" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Anzeige hervorheben</h3>
            <p className="text-xs text-muted-foreground">Mehr Reichweite für Ihr Angebot</p>
          </div>
        </div>

        <div className="bg-muted rounded-lg p-3 mb-4">
          <p className="text-sm font-medium text-foreground">{dealTitle}</p>
        </div>

        {/* Duration selector */}
        <div className="mb-4">
          <p className="text-sm font-medium text-foreground mb-2">Laufzeit wählen</p>
          <div className="grid grid-cols-3 gap-2">
            {boostOptions.map((option) => (
              <button
                key={option.days}
                onClick={() => setSelectedDays(option.days)}
                className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors border ${
                  selectedDays === option.days
                    ? "border-yellow-400 bg-yellow-50 text-yellow-800"
                    : "border-border text-muted-foreground hover:border-border"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Benefits preview */}
        <div className="mb-5">
          <p className="text-sm font-medium text-foreground mb-2">Vorteile</p>
          <ul className="space-y-1.5">
            <li className="flex items-center gap-2 text-xs text-muted-foreground">
              <Star className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
              &ldquo;Gesponsert&rdquo;-Badge auf Ihrer Anzeige
            </li>
            <li className="flex items-center gap-2 text-xs text-muted-foreground">
              <Star className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
              Priorität im Gewerbe-Verzeichnis
            </li>
            <li className="flex items-center gap-2 text-xs text-muted-foreground">
              <Star className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
              Hervorgehobene Platzierung auf der Angebote-Seite
            </li>
          </ul>
        </div>

        {/* Coming soon notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p className="text-sm font-medium text-amber-800">Demnächst verfügbar</p>
          <p className="text-xs text-amber-600 mt-0.5">
            Die Boost-Funktion wird bald freigeschaltet. Lassen Sie sich benachrichtigen!
          </p>
        </div>

        {/* Actions */}
        {notifyRequested ? (
          <div className="flex items-center gap-2 justify-center py-2 text-green-600">
            <Bell className="h-4 w-4" />
            <span className="text-sm font-medium">Sie werden benachrichtigt!</span>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-accent transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleNotify}
              className="flex-1 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <Bell className="h-4 w-4" />
              Benachrichtigen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
