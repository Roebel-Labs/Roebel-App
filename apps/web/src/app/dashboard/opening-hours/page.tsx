"use client";

import Link from "next/link";
import { Clock, ExternalLink } from "lucide-react";

export default function OrgOpeningHoursPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-medium">Öffnungszeiten</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verwalte die Öffnungszeiten deines Gewerbes.
        </p>
      </div>

      <div className="bg-card border border-border rounded-[10px] p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Im Gewerbe-Editor verwalten</p>
            <p className="text-xs text-muted-foreground">
              Öffnungszeiten gehören zum Gewerbe-Profil.
            </p>
          </div>
        </div>
        <Link
          href="/app/gewerbe/bearbeiten"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
        >
          Gewerbe bearbeiten
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
