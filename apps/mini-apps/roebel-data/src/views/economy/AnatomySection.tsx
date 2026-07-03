// Economy — "On-chain anatomy". A compact, fully-technical reference for the Röbel
// Münzen Circles v2 group: a one-line explainer + a minimal list of the on-chain parts
// (group, RCRC token, mint policy, BaseTreasury, owner Safe), each linking to its
// explorer page. Fully-technical by design (the rest of the app hides Circles jargon).
import { GROUP_ANATOMY, GROUP_META } from "../../lib/groupAnatomy";
import { shortAddr } from "../../lib/format";
import { ChartCard } from "../../components/ui";
import { Coins, Scale, Vault, ShieldCheck, ExternalLink, Globe } from "../../components/icons";

const ICONS = { group: Globe, token: Coins, policy: Scale, treasury: Vault, owner: ShieldCheck } as const;

export function AnatomySection() {
  return (
    <ChartCard title="On-chain anatomy" subtitle="Röbel Münzen — a Circles v2 group currency on Gnosis. Verify every part on-chain.">
      <div className="space-y-3">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">{GROUP_META.name}</span> (symbol{" "}
          <span className="font-mono text-foreground">{GROUP_META.symbol}</span>) is a Circles v2{" "}
          <span className="font-medium text-foreground">BaseGroup</span>: it mints the group token{" "}
          <span className="font-medium text-foreground">RCRC</span> to trusted members, backed 1:1 by personal CRC in the{" "}
          <span className="font-medium text-foreground">BaseTreasury</span>, under a fixed{" "}
          <span className="font-medium text-foreground">mint policy</span>.
        </p>

        <ul className="divide-y divide-border/70">
          {GROUP_ANATOMY.map((p) => {
            const Icon = ICONS[p.role];
            const ref = p.tokenId ? `id ${p.tokenId.slice(0, 6)}…${p.tokenId.slice(-4)}` : shortAddr(p.address);
            return (
              <li key={p.role}>
                <a
                  href={p.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 py-2 transition hover:opacity-80"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-[#00498B]" />
                  <span className="text-[12px] font-medium text-foreground">{p.title}</span>
                  <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">{ref}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </ChartCard>
  );
}
