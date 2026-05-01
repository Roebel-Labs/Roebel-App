import { cn } from "@/lib/utils";
import type { InterestCounts } from "@/app/actions/card-interest";

interface SocialProofCounterProps {
  counts: InterestCounts;
  className?: string;
}

const CITIZEN_THRESHOLD = 25;
const MERCHANT_THRESHOLD = 5;

export function SocialProofCounter({ counts, className }: SocialProofCounterProps) {
  const visible =
    counts.citizens >= CITIZEN_THRESHOLD || counts.merchants >= MERCHANT_THRESHOLD;
  if (!visible) return null;

  const citizenLabel = counts.citizens === 1 ? "Bürger" : "Bürger";
  const merchantLabel = counts.merchants === 1 ? "Geschäft" : "Geschäfte";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 rounded-full border border-border bg-card/80 px-4 py-2 text-sm text-muted-foreground backdrop-blur",
        className,
      )}
    >
      <span className="flex h-2 w-2 items-center justify-center">
        <span className="absolute h-2 w-2 animate-ping rounded-full bg-primary/60" aria-hidden />
        <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
      </span>
      <span>
        <strong className="font-semibold text-foreground">
          {counts.citizens.toLocaleString("de-DE")} {citizenLabel}
        </strong>
        <span className="mx-1.5 text-muted-foreground">·</span>
        <strong className="font-semibold text-foreground">
          {counts.merchants.toLocaleString("de-DE")} {merchantLabel}
        </strong>
        <span className="ml-1.5">haben bereits Interesse bekundet</span>
      </span>
    </div>
  );
}
