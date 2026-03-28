"use client";

import Link from "next/link";
import Image from "next/image";
import { X, ShoppingBag } from "lucide-react";

interface ProductContextBannerProps {
  listingId: string;
  title: string;
  price: number;
  priceType: string;
  imageUrl?: string | null;
  condition?: string;
  onDismiss: () => void;
}

export function ProductContextBanner({
  listingId,
  title,
  price,
  priceType,
  imageUrl,
  condition,
  onDismiss,
}: ProductContextBannerProps) {
  return (
    <div className="mx-3 mt-2 bg-muted/50 border border-border rounded-lg p-3">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-md bg-muted overflow-hidden flex-shrink-0">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={title}
              width={48}
              height={48}
              className="object-cover w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ShoppingBag className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <Link
            href={`/app/marktplatz/${listingId}`}
            className="text-sm font-medium text-foreground hover:underline line-clamp-1"
          >
            {title}
          </Link>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span className="font-semibold text-foreground">
              {priceType === "free"
                ? "Kostenlos"
                : priceType === "negotiable"
                  ? `${price.toFixed(2)} € VB`
                  : `${price.toFixed(2)} €`}
            </span>
            {condition && <span>&middot; {condition}</span>}
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
