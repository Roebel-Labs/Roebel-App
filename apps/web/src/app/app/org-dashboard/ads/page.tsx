"use client";

import Link from "next/link";
import { Tag, ExternalLink } from "lucide-react";

export default function OrgAdsPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-medium">Angebote & Ads</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verwalte Deals, Aktionen und lokale Anzeigen.
        </p>
      </div>

      <div className="bg-card border border-border rounded-[10px] p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
            <Tag className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Im Gewerbe-Bereich verwalten</p>
            <p className="text-xs text-muted-foreground">
              Angebote sind an dein Gewerbe-Profil gebunden.
            </p>
          </div>
        </div>
        <Link
          href="/app/gewerbe/angebote"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
        >
          Angebote verwalten
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
