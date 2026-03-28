"use client";

import Link from "next/link";
import Image from "next/image";
import {
  Calendar,
  Newspaper,
  Heart,
  MessageCircle,
  Share2,
  Tag,
  ArrowRight,
} from "lucide-react";
import { trackAdClick } from "@/app/actions/local-ads";

interface FeedCardProps {
  type: "event" | "news" | "ad";
  id: string;
  title: string;
  description?: string;
  imageUrl?: string | null;
  date?: string;
  category?: string;
  slug?: string;
  // Ad-specific fields
  dealType?: string;
  dealValue?: string | null;
  businessName?: string;
  businessSlug?: string;
  businessLogoUrl?: string | null;
  isBoosted?: boolean;
  mediaUrls?: string[];
}

const dealTypeLabels: Record<string, string> = {
  discount: "Rabatt",
  special: "Spezialangebot",
  event: "Veranstaltung",
  new_product: "Neuheit",
  promotion: "Werbung",
};

const dealTypeColors: Record<string, string> = {
  discount: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400",
  special:
    "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  event: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  new_product:
    "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  promotion: "bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-400",
};

export function FeedCard({
  type,
  id,
  title,
  description,
  imageUrl,
  date,
  category,
  slug,
  dealType,
  dealValue,
  businessName,
  businessLogoUrl,
  isBoosted,
}: FeedCardProps) {
  // --- Ad rendering ---
  if (type === "ad") {
    const adHref = `/app/angebote/${id}`;

    const handleAdClick = () => {
      trackAdClick(id);
    };

    return (
      <div
        className={`bg-card rounded-lg border overflow-hidden ${
          isBoosted
            ? "border-yellow-300 dark:border-yellow-700 border-l-4"
            : "border-border"
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 pb-2">
          <div className="h-10 w-10 rounded-full bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
            {businessLogoUrl ? (
              <Image
                src={businessLogoUrl}
                alt={businessName || ""}
                width={40}
                height={40}
                className="object-cover w-full h-full"
              />
            ) : (
              <Tag className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground">
              {businessName || "Lokales Gewerbe"}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <span>Anzeige</span>
              {dealType && dealTypeLabels[dealType] && (
                <>
                  <span>&middot;</span>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                      dealTypeColors[dealType] ||
                      "bg-muted text-muted-foreground"
                    }`}
                  >
                    {dealTypeLabels[dealType]}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <Link href={adHref} onClick={handleAdClick} className="block">
          <div className="px-4 pb-3">
            <h3 className="font-semibold text-foreground mb-1">{title}</h3>
            {dealValue && (
              <p className="text-sm font-semibold text-green-600 dark:text-green-400 mb-1">
                {dealValue}
              </p>
            )}
            {description && (
              <p className="text-sm text-muted-foreground line-clamp-3">
                {description}
              </p>
            )}
          </div>

          {imageUrl && (
            <div className="relative w-full aspect-[4/3] max-h-[75vw] sm:max-h-[400px] overflow-hidden">
              <Image
                src={imageUrl}
                alt=""
                fill
                className="object-cover blur-xl scale-110"
                aria-hidden="true"
              />
              <Image
                src={imageUrl}
                alt={title}
                fill
                className="object-contain relative z-10"
              />
            </div>
          )}
        </Link>

        {/* CTA */}
        <div className="px-4 py-3 border-t border-border">
          <Link
            href={adHref}
            onClick={handleAdClick}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Zum Angebot
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // --- Event / News rendering ---
  const href =
    type === "event" ? `/app/events/${id}` : `/app/news/${slug || id}`;
  const TypeIcon = type === "event" ? Calendar : Newspaper;
  const typeLabel = type === "event" ? "Veranstaltung" : "Neuigkeit";

  const formattedDate = date
    ? new Date(date).toLocaleDateString("de-DE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-2">
        <div
          className={`h-10 w-10 rounded-full flex items-center justify-center ${
            type === "event"
              ? "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
              : "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400"
          }`}
        >
          <TypeIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{typeLabel}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            {formattedDate && <span>{formattedDate}</span>}
            {category && (
              <>
                <span>&middot;</span>
                <span>{category}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <Link href={href} className="block">
        <div className="px-4 pb-3">
          <h3 className="font-semibold text-foreground mb-1">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {description}
            </p>
          )}
        </div>

        {imageUrl && (
          <div className="relative w-full aspect-[4/3] max-h-[75vw] sm:max-h-[400px] overflow-hidden">
            <Image
              src={imageUrl}
              alt=""
              fill
              className="object-cover blur-xl scale-110"
              aria-hidden="true"
            />
            <Image
              src={imageUrl}
              alt={title}
              fill
              className="object-contain relative z-10"
            />
            {type === "event" && date && (() => {
              const eventDate = new Date(date);
              const day = eventDate.getDate();
              const month = eventDate.toLocaleDateString("de-DE", { month: "short" });
              return (
                <div className="absolute bottom-3 left-3 z-20 bg-card rounded-lg shadow-md overflow-hidden min-w-[48px]">
                  <div className="text-center px-2 py-1.5">
                    <div className="text-xl font-semibold text-foreground leading-none">
                      {day}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                      {month}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </Link>

      {/* Actions */}
      <div className="flex items-center gap-1 px-4 py-2 border-t border-border">
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-md text-sm transition-colors">
          <Heart className="h-4 w-4" />
        </button>
        <Link
          href={href}
          className="flex items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-md text-sm transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
        </Link>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-950 rounded-md text-sm transition-colors">
          <Share2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
