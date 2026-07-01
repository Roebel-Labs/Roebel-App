"use client";

import Link from "next/link";
import Image from "next/image";
import { ShoppingBag } from "lucide-react";
import { parseListingInquiry, formatListingPrice } from "@/lib/messaging/display";

interface ChatBubbleProps {
  content: string;
  isOwn: boolean;
  timestamp: Date | null;
}

export function ChatBubble({ content, isOwn, timestamp }: ChatBubbleProps) {
  const timeLabel = timestamp
    ? timestamp.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const product = parseListingInquiry(content);

  if (product) {
    return (
      <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-2`}>
        <div
          className={`max-w-[80%] sm:max-w-[70%] rounded-2xl overflow-hidden ${
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-muted text-foreground rounded-bl-md"
          }`}
        >
          <Link
            href={`/app/marktplatz/${product.listingId}`}
            className="block hover:opacity-90 transition-opacity"
          >
            {product.imageUrl && (
              <div className="h-32 w-full relative">
                <Image
                  src={product.imageUrl}
                  alt={product.title}
                  fill
                  className="object-cover"
                />
              </div>
            )}
            <div className="px-3.5 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <ShoppingBag className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
                <span className="text-[10px] uppercase tracking-wider opacity-70">
                  Marktplatz
                </span>
              </div>
              <p className="text-sm font-medium line-clamp-2">{product.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-bold">
                  {formatListingPrice(product.price, product.priceType)}
                </span>
                {product.condition && (
                  <span className="text-[10px] opacity-70">
                    &middot; {product.condition}
                  </span>
                )}
              </div>
            </div>
          </Link>
          {timeLabel && (
            <p className="text-[10px] px-3.5 pb-2 text-muted-foreground">
              {timeLabel}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-2`}>
      <div
        className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 ${
          isOwn
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md"
        }`}
      >
        <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
        {timeLabel && (
          <p
            className={`text-[10px] mt-1 ${
              isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
            }`}
          >
            {timeLabel}
          </p>
        )}
      </div>
    </div>
  );
}
