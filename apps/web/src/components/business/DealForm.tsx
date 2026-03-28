"use client"

import { useState } from "react"
import { DEAL_TYPES, DEAL_STATUSES } from "@/types/business"
import type { DealType, DealStatus } from "@/types/business"
import { MediaUploader } from "./MediaUploader"

interface DealFormProps {
  onSubmit: (data: {
    title: string
    description: string
    deal_type: DealType
    deal_value: string
    start_date: string
    end_date: string
    media_urls: string[]
    video_url: string | null
    status: DealStatus
  }) => void
  onCancel: () => void
  initialData?: {
    title?: string
    description?: string
    deal_type?: DealType
    deal_value?: string
    start_date?: string
    end_date?: string
    media_urls?: string[]
    video_url?: string | null
    status?: DealStatus
  }
  isSubmitting?: boolean
}

export function DealForm({ onSubmit, onCancel, initialData, isSubmitting }: DealFormProps) {
  const [title, setTitle] = useState(initialData?.title || "")
  const [description, setDescription] = useState(initialData?.description || "")
  const [dealType, setDealType] = useState<DealType>(initialData?.deal_type || "discount")
  const [dealValue, setDealValue] = useState(initialData?.deal_value || "")
  const [startDate, setStartDate] = useState(initialData?.start_date || "")
  const [endDate, setEndDate] = useState(initialData?.end_date || "")
  const [mediaUrls, setMediaUrls] = useState<string[]>(initialData?.media_urls || [])
  const [videoUrl, setVideoUrl] = useState<string | null>(initialData?.video_url || null)
  const [status, setStatus] = useState<DealStatus>(initialData?.status || "active")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onSubmit({
      title,
      description,
      deal_type: dealType,
      deal_value: dealValue,
      start_date: startDate,
      end_date: endDate,
      media_urls: mediaUrls,
      video_url: videoUrl,
      status,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Titel *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="z.B. 20% Rabatt auf alles"
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Art des Angebots</label>
          <select
            value={dealType}
            onChange={(e) => setDealType(e.target.value as DealType)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {DEAL_TYPES.map((dt) => (
              <option key={dt.value} value={dt.value}>
                {dt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as DealStatus)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {DEAL_STATUSES.filter((s) => s.value !== "expired").map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Wert / Betrag</label>
        <input
          type="text"
          value={dealValue}
          onChange={(e) => setDealValue(e.target.value)}
          placeholder="z.B. 20%, 5€, 2 für 1"
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Beschreibung</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Details zum Angebot..."
          rows={3}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      {/* Media Upload */}
      <MediaUploader
        mediaUrls={mediaUrls}
        videoUrl={videoUrl}
        onMediaChange={setMediaUrls}
        onVideoChange={setVideoUrl}
      />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Start</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Ende</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 bg-muted hover:bg-accent text-foreground rounded-lg text-sm font-semibold transition-colors"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={!title.trim() || isSubmitting}
          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-muted text-white rounded-lg text-sm font-semibold transition-colors"
        >
          {isSubmitting ? "Wird gespeichert..." : "Speichern"}
        </button>
      </div>
    </form>
  )
}
