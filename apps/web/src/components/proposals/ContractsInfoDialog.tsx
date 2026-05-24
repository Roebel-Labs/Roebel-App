"use client";

import { Info } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getBaseScanAddressUrl } from "@/lib/blockscout";
import { formatAddress } from "@/lib/proposal-types";
import { de } from "@/lib/translations/de";

const CONTRACT_ROWS = [
  {
    role: de.governance.roleGovernor,
    address: "0xffCeE774e226f354f261B5Cd264ce1325385A926",
  },
  {
    role: de.governance.roleTimelock,
    address: "0xB297f779ffBE41689Ce35927AEFC415B00abf8E0",
  },
  {
    role: de.governance.roleCitizenNFT,
    address: "0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB",
  },
  {
    role: de.governance.roleAttesterNFT,
    address: "0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb",
  },
] as const;

export function ContractsInfoDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={de.governance.contractsTitle}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-colors hover:border-primary hover:text-primary"
        >
          <Info className="h-5 w-5" aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{de.governance.contractsTitle}</DialogTitle>
          <DialogDescription>
            {de.governance.contractsLead}
          </DialogDescription>
        </DialogHeader>

        <ul className="divide-y divide-border">
          {CONTRACT_ROWS.map(({ role, address }) => (
            <li
              key={address}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{role}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {formatAddress(address, 10, 8)}
                </p>
              </div>
              <a
                href={getBaseScanAddressUrl(address)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary hover:underline"
              >
                {de.governance.openOnBasescan} ↗
              </a>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">
          {de.governance.timelineFooter}
        </p>
      </DialogContent>
    </Dialog>
  );
}
