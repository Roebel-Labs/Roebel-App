"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CitizenInterestModal } from "./CitizenInterestModal";
import { MerchantInterestModal } from "./MerchantInterestModal";

type Layout = "stack" | "row" | "row-compact";

interface InterestCTAButtonsProps {
  /** When true, renders only the primary citizen CTA (header / inline use). */
  citizenOnly?: boolean;
  /** When true, renders only the secondary merchant CTA. */
  merchantOnly?: boolean;
  /** Show citizen as outlined and merchant as primary instead of the default. */
  invertEmphasis?: boolean;
  /** Stack on mobile, row on sm+. row-compact uses size sm everywhere. */
  layout?: Layout;
  className?: string;
  /** Override the citizen button label (e.g. "Jetzt vormerken"). */
  citizenLabel?: string;
  /** Override the merchant button label. */
  merchantLabel?: string;
  /** Render an arrow icon on the primary CTA. */
  withArrow?: boolean;
}

export function InterestCTAButtons({
  citizenOnly = false,
  merchantOnly = false,
  invertEmphasis = false,
  layout = "row",
  className,
  citizenLabel = "Ich bin interessiert",
  merchantLabel = "Mein Geschäft anmelden",
  withArrow = false,
}: InterestCTAButtonsProps) {
  const [citizenOpen, setCitizenOpen] = useState(false);
  const [merchantOpen, setMerchantOpen] = useState(false);

  const showCitizen = !merchantOnly;
  const showMerchant = !citizenOnly;

  const isCompact = layout === "row-compact";
  const wrapperClass = cn(
    "flex w-full gap-3",
    layout === "stack" && "flex-col",
    layout === "row" && "flex-col sm:flex-row sm:items-center",
    layout === "row-compact" && "flex-row items-center",
    className,
  );

  const citizenVariant = invertEmphasis ? "outline" : "default";
  const merchantVariant = invertEmphasis ? "default" : "outline";

  return (
    <>
      <div className={wrapperClass}>
        {showCitizen && (
          <Button
            type="button"
            variant={citizenVariant}
            size={isCompact ? "sm" : "lg"}
            onClick={() => setCitizenOpen(true)}
            className={cn(
              !merchantOnly && !citizenOnly && layout === "row" && "sm:flex-1 sm:max-w-xs",
              "group",
            )}
          >
            <span>{citizenLabel}</span>
            {withArrow && (
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            )}
          </Button>
        )}
        {showMerchant && (
          <Button
            type="button"
            variant={merchantVariant}
            size={isCompact ? "sm" : "lg"}
            onClick={() => setMerchantOpen(true)}
            className={cn(
              !merchantOnly && !citizenOnly && layout === "row" && "sm:flex-1 sm:max-w-xs",
            )}
          >
            {merchantLabel}
          </Button>
        )}
      </div>

      <CitizenInterestModal open={citizenOpen} onOpenChange={setCitizenOpen} />
      <MerchantInterestModal open={merchantOpen} onOpenChange={setMerchantOpen} />
    </>
  );
}
