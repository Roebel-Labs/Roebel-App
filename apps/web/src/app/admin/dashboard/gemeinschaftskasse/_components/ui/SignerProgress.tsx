"use client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Check } from "lucide-react";
import { initials } from "../MemberRow";
import type { TxOwnerState } from "@/lib/gemeinschaftskasse/constants";

/** Shows every owner as a chip — green + ✓ once they've approved (off-chain
 *  signature or on-chain approveHash), muted while still pending — plus an n/m
 *  progress bar. This is the signature element of the redesign: at a glance you
 *  see who has freed the transaction and who is still needed. */
export function SignerProgress({
  owners,
  threshold,
  youAddress,
}: {
  owners: TxOwnerState[];
  threshold: number;
  youAddress?: string;
}) {
  const signed = owners.filter((o) => o.signed).length;
  const pct = threshold > 0 ? Math.min(100, (signed / threshold) * 100) : 0;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Freigaben</span>
        <span className="text-xs font-medium tabular-nums">
          {signed} / {threshold}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {owners.map((o) => {
          const you = youAddress && o.address.toLowerCase() === youAddress.toLowerCase();
          const tip = o.signed
            ? `${o.name} hat freigegeben (${o.via === "onchain" ? "On-Chain-Freigabe" : "Signatur"})`
            : `${o.name} — Freigabe ausstehend`;
          return (
            <span
              key={o.address}
              title={tip}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${
                o.signed
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-border bg-muted/30 text-muted-foreground"
              }`}
            >
              <span className="relative inline-flex">
                <Avatar className="h-5 w-5">
                  {o.avatarUrl && <AvatarImage src={o.avatarUrl} alt={o.name} />}
                  <AvatarFallback className="text-[9px]">{initials(o.name)}</AvatarFallback>
                </Avatar>
                {o.signed && (
                  <Check className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 p-[1px] text-white" />
                )}
              </span>
              <span className="max-w-[7rem] truncate">{you ? "Du" : o.name}</span>
            </span>
          );
        })}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-[#00498B] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
