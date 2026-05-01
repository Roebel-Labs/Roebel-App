import { getBaseScanAddressUrl } from "@/lib/blockscout";
import { de } from "@/lib/translations/de";
import { formatAddress } from "@/lib/proposal-types";

const CONTRACT_ROWS = [
  {
    role: de.governance.roleGovernor,
    address: "0x84D8ab0FcA4D0689e2E3F036dc461942343c2a5b",
  },
  {
    role: de.governance.roleTimelock,
    address: "0xed1680AFf2A4235421b209A1bf8C7f5760149cc0",
  },
  {
    role: de.governance.roleCitizenNFT,
    address: "0xe2d39ffd2ee0Ccd753486047AEBec031F334b5b7",
  },
  {
    role: de.governance.roleAttesterNFT,
    address: "0xa06F09Cb406880512326318fbC09Cdb28631DA73",
  },
] as const;

export function VerifiableContractsCard() {
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-medium text-foreground">
        {de.governance.contractsTitle}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {de.governance.contractsLead}
      </p>

      <ul className="mt-4 divide-y divide-border">
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
    </section>
  );
}
