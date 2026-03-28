"use client"

import { useState } from "react"
import {
  MARKETPLACE_CATEGORIES,
  SERVICE_CATEGORIES,
  BOARD_CATEGORIES,
  LISTING_CONDITIONS,
  PRICE_TYPES,
  SERVICE_PRICE_TYPES,
  BOARD_PRICE_TYPES,
} from "@/types/marketplace"
import type {
  ListingType,
  MarketplaceCategory,
  ServiceCategory,
  BoardCategory,
  ListingCondition,
  PriceType,
  ServicePriceType,
  BoardPriceType,
} from "@/types/marketplace"
import { NEIGHBORHOODS } from "@/lib/user-types"
import { MediaUploader } from "@/components/business/MediaUploader"

interface ListingFormProps {
  listingType?: ListingType
  onSubmit: (data: {
    title: string
    description: string
    price: number
    price_type: PriceType | ServicePriceType | BoardPriceType
    category: MarketplaceCategory | ServiceCategory | BoardCategory
    condition: ListingCondition | null
    neighborhood: string
    media_urls: string[]
  }) => void
  onCancel: () => void
  initialData?: {
    title?: string
    description?: string
    price?: number
    price_type?: PriceType | ServicePriceType | BoardPriceType
    category?: MarketplaceCategory | ServiceCategory | BoardCategory
    condition?: ListingCondition | null
    neighborhood?: string
    media_urls?: string[]
  }
  isSubmitting?: boolean
}

export function ListingForm({ listingType = "product", onSubmit, onCancel, initialData, isSubmitting }: ListingFormProps) {
  const isServiceMode = listingType === "service"
  const isBoardMode = listingType === "schwarzes_brett"

  const [title, setTitle] = useState(initialData?.title || "")
  const [description, setDescription] = useState(initialData?.description || "")
  const [price, setPrice] = useState(initialData?.price?.toString() || "")
  const [priceType, setPriceType] = useState<PriceType | ServicePriceType | BoardPriceType>(
    initialData?.price_type || (isBoardMode ? "free" : isServiceMode ? "per_hour" : "fixed")
  )
  const [category, setCategory] = useState<MarketplaceCategory | ServiceCategory | BoardCategory>(
    initialData?.category || (isBoardMode ? "sonstiges_brett" : isServiceMode ? "sonstiges_service" : "sonstiges")
  )
  const [condition, setCondition] = useState<ListingCondition>(
    (initialData?.condition as ListingCondition) || "gut"
  )
  const [neighborhood, setNeighborhood] = useState(initialData?.neighborhood || "")
  const [mediaUrls, setMediaUrls] = useState<string[]>(initialData?.media_urls || [])

  const isPriceless = priceType === "free" || priceType === "on_request"

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onSubmit({
      title,
      description,
      price: isPriceless ? 0 : parseFloat(price) || 0,
      price_type: priceType,
      category,
      condition: isServiceMode || isBoardMode ? null : condition,
      neighborhood,
      media_urls: mediaUrls,
    })
  }

  const categories = isBoardMode
    ? BOARD_CATEGORIES
    : isServiceMode
      ? SERVICE_CATEGORIES
      : MARKETPLACE_CATEGORIES
  const priceTypes = isBoardMode
    ? BOARD_PRICE_TYPES
    : isServiceMode
      ? SERVICE_PRICE_TYPES
      : PRICE_TYPES

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Titel *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            isBoardMode
              ? "Was suchen oder bieten Sie an?"
              : isServiceMode
                ? "Welche Dienstleistung bieten Sie an?"
                : "Was verkaufen Sie?"
          }
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
      </div>

      {/* Price + Price Type */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Preis</label>
          <div className="relative">
            <input
              type="number"
              value={isPriceless ? "" : price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0,00"
              min="0"
              step="0.01"
              disabled={isPriceless}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground"
            />
            {!isPriceless && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                &euro;
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Preisart</label>
          <select
            value={priceType}
            onChange={(e) => setPriceType(e.target.value as PriceType | ServicePriceType | BoardPriceType)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {priceTypes.map((pt) => (
              <option key={pt.value} value={pt.value}>
                {pt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Category + Condition */}
      <div className={`grid grid-cols-1 ${!isServiceMode && !isBoardMode ? "sm:grid-cols-2" : ""} gap-3 sm:gap-4`}>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Kategorie</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MarketplaceCategory | ServiceCategory | BoardCategory)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {categories.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {!isServiceMode && !isBoardMode && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Zustand</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as ListingCondition)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {LISTING_CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Beschreibung</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            isBoardMode
              ? "Beschreiben Sie Ihr Anliegen..."
              : isServiceMode
                ? "Beschreiben Sie Ihre Dienstleistung..."
                : "Beschreiben Sie den Artikel..."
          }
          rows={3}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      {/* Media Upload */}
      <MediaUploader
        mediaUrls={mediaUrls}
        videoUrl={null}
        onMediaChange={setMediaUrls}
        onVideoChange={() => {}}
        pathPrefix={isBoardMode ? "board-media/" : isServiceMode ? "service-media/" : "marketplace-media/"}
        hideVideo
      />

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Standort</label>
        <select
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Kein Standort angeben</option>
          {NEIGHBORHOODS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
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
          {isSubmitting
            ? "Wird gespeichert..."
            : isBoardMode
              ? "Aushang erstellen"
              : isServiceMode
                ? "Dienstleistung erstellen"
                : "Inserat erstellen"}
        </button>
      </div>
    </form>
  )
}
