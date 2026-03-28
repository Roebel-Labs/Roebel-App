"use client";

import Image from "next/image";
import { ExternalLink } from "lucide-react";
import type { PostLink } from "@/types/post";

interface LinkPreviewProps {
  link: PostLink;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function LinkPreview({ link }: LinkPreviewProps) {
  const hasImage = !!link.og_image;
  const hasContent = link.og_title || link.og_description;

  if (!hasContent && !hasImage) return null;

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mx-4 mb-3 rounded-lg border border-border overflow-hidden bg-muted hover:bg-accent transition-colors"
    >
      <div className={`flex ${hasImage ? "flex-row" : ""}`}>
        {hasImage && (
          <div className="relative w-24 h-24 flex-shrink-0">
            <Image
              src={link.og_image!}
              alt=""
              fill
              className="object-cover"
              sizes="96px"
            />
          </div>
        )}
        <div className="flex-1 min-w-0 p-3">
          {link.og_title && (
            <h4 className="text-sm font-semibold text-foreground line-clamp-1">
              {link.og_title}
            </h4>
          )}
          {link.og_description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {link.og_description}
            </p>
          )}
          <div className="flex items-center gap-1 mt-1">
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {getDomain(link.url)}
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}
