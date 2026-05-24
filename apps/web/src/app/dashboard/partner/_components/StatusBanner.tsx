"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import type { RoebelCardPartnerRow } from "@/lib/supabase-roebel-card-partners";

interface Props {
  partner: RoebelCardPartnerRow;
}

/**
 * Cross-cutting status banner for non-approved partners. Approved partners
 * see no banner — they get the clean dashboard. Rendered by the layout so it
 * shows on every tab when an approval is missing or has been revoked.
 */
export function StatusBanner({ partner }: Props) {
  if (partner.status === "approved") return null;

  if (partner.status === "pending") {
    return (
      <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-[10px] p-4 flex gap-3">
        <Loader2 className="h-5 w-5 text-amber-600 dark:text-amber-400 animate-spin flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Antrag in Prüfung
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Wir prüfen deinen Antrag in 2–3 Werktagen. Solange Zahlungen noch
            gesperrt sind, kannst du die Oberfläche schon erkunden.
          </p>
        </div>
      </div>
    );
  }

  const isRejected = partner.status === "rejected";
  return (
    <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-[10px] p-4 flex gap-3">
      <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-foreground">
          {isRejected ? "Antrag abgelehnt" : "Konto gesperrt"}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isRejected
            ? "Leider konnten wir deinen Antrag nicht bewilligen."
            : "Dein Partner-Konto ist derzeit gesperrt."}{" "}
          Bei Fragen{" "}
          <a
            href="mailto:partner@roebel.app"
            className="text-primary underline"
          >
            partner@roebel.app
          </a>
          .
        </p>
      </div>
    </div>
  );
}
