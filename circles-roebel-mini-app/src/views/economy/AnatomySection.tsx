// Economy — "On-chain anatomy". Explains + visualizes the Röbel Münzen Circles v2 group
// structure (BaseGroup, RCRC group token, mint policy, BaseTreasury backing, owner Safe)
// with explorer links, plus a lightweight non-interactive trust-relations mini-graph.
// Fully-technical by design: this section deliberately surfaces the Circles layer (the
// rest of the app keeps the friendly "Röbel Münzen" name and hides protocol jargon).
import { useEffect, useMemo, useState } from "react";
import { getTrustGraph, type TrustGraph } from "../../lib/circlesData";
import { GROUP_ANATOMY, GROUP_META } from "../../lib/groupAnatomy";
import { shortAddr, fmtInt } from "../../lib/format";
import { C } from "../../lib/chartTheme";
import { ChartCard, Skeleton } from "../../components/ui";
import { Coins, Scale, Vault, ShieldCheck, ExternalLink, Globe } from "../../components/icons";

const ICONS = { group: Globe, token: Coins, policy: Scale, treasury: Vault, owner: ShieldCheck } as const;

export function AnatomySection({ verified }: { verified: Set<string> }) {
  const [graph, setGraph] = useState<TrustGraph | null>(null);

  // Progressive: the intro + map + links render instantly from static constants;
  // only the mini-graph waits on the (best-effort) trust fetch.
  useEffect(() => {
    let alive = true;
    getTrustGraph(verified)
      .then((g) => alive && setGraph(g))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [verified]);

  const stats = useMemo(() => {
    const nodes = graph?.nodes ?? [];
    return {
      trusted: nodes.filter((n) => n.trusted).length,
      verified: nodes.filter((n) => n.tone === "verified").length,
    };
  }, [graph]);

  const group = GROUP_ANATOMY.find((p) => p.role === "group")!;
  const chips = GROUP_ANATOMY.filter((p) => p.role !== "group");

  return (
    <ChartCard title="On-chain anatomy" subtitle="Röbel Münzen is a Circles v2 group currency on Gnosis — verify every part on-chain.">
      <div className="space-y-4">
        {/* Technical intro */}
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Röbel Münzen</span> (on-chain symbol{" "}
          <span className="font-mono text-foreground">RTLR</span>) is a Circles v2{" "}
          <span className="font-medium text-foreground">BaseGroup</span>. The group mints a group token —{" "}
          <span className="font-medium text-foreground">RCRC</span> — to its trusted members, backed 1:1 by personal CRC
          locked in the <span className="font-medium text-foreground">BaseTreasury</span>. A{" "}
          <span className="font-medium text-foreground">mint policy</span> governs who may mint. Membership is a{" "}
          <span className="font-medium text-foreground">trust relation</span>: when the group trusts a citizen, that
          citizen can mint and spend Röbel Münzen.
        </p>

        {/* Anatomy map: group hub → connector → role chips */}
        <div>
          <a
            href={group.href}
            target="_blank"
            rel="noreferrer"
            className="mx-auto flex w-full max-w-[280px] items-center gap-3 rounded-[12px] border-2 border-[#00498B] bg-[#00498B] px-3.5 py-3 text-white transition hover:opacity-95"
          >
            <Globe className="h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-bold leading-tight">{GROUP_META.name}</div>
              <div className="text-[10px] text-white/70">
                BaseGroup · {GROUP_META.symbol} · {shortAddr(group.address)}
              </div>
            </div>
            <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-white/70" />
          </a>

          {/* connector */}
          <div className="mx-auto my-1 h-3 w-px bg-border" />
          <div className="mx-auto mb-2.5 h-px w-[78%] max-w-[280px] bg-border" />

          <div className="grid grid-cols-2 gap-2.5">
            {chips.map((p) => {
              const Icon = ICONS[p.role];
              return (
                <a
                  key={p.role}
                  href={p.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col gap-1 rounded-[10px] border border-border bg-card p-2.5 transition hover:border-[#00498B]/40 hover:shadow-sm"
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-[#00498B]" />
                    <span className="text-[12px] font-semibold text-foreground">{p.title}</span>
                    <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {p.tokenId ? `id ${p.tokenId.slice(0, 6)}…${p.tokenId.slice(-4)}` : shortAddr(p.address)}
                  </span>
                  <span className="text-[11px] leading-snug text-muted-foreground">{p.blurb}</span>
                </a>
              );
            })}
          </div>
        </div>

        {/* Trust relations — lightweight mini-graph */}
        <div className="border-t border-border/70 pt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-foreground">Trust relations</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {graph ? `${fmtInt(stats.trusted)} trusted · ${fmtInt(stats.verified)} verified` : "…"}
            </span>
          </div>
          {graph ? <TrustMiniGraph graph={graph} /> : <Skeleton className="h-52" />}
          <p className="mt-1 text-center text-[11px] text-muted-foreground">
            The group trusts each member · full interactive graph on the Town tab.
          </p>
        </div>
      </div>
    </ChartCard>
  );
}

/** Non-interactive radial: navy hub + a dot per member (navy = verified/attester). */
function TrustMiniGraph({ graph }: { graph: TrustGraph }) {
  const members = graph.nodes;
  const cx = 110;
  const cy = 110;
  const R = 84;
  const navy = (t: string) => t === "verified" || t === "attester";
  const pts = members.map((m, i) => {
    const a = (i / Math.max(members.length, 1)) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, node: m };
  });

  if (!members.length) {
    return (
      <div className="flex h-52 items-center justify-center rounded-[10px] border border-dashed border-border text-[12px] text-muted-foreground">
        no members yet
      </div>
    );
  }

  return (
    <svg viewBox="0 0 220 220" className="mx-auto block h-52 w-full max-w-[260px]">
      {pts.map((p, i) => (
        <line
          key={`l${i}`}
          x1={cx}
          y1={cy}
          x2={p.x}
          y2={p.y}
          stroke={navy(p.node.tone) ? C.navy : C.grayLt}
          strokeWidth={1}
          opacity={p.node.trusted ? 0.5 : 0.22}
          strokeDasharray={p.node.trusted ? undefined : "3 3"}
        />
      ))}
      {pts.map((p, i) => (
        <circle
          key={`c${i}`}
          cx={p.x}
          cy={p.y}
          r={navy(p.node.tone) ? 5 : 4}
          fill={navy(p.node.tone) ? C.navy : C.white}
          stroke={navy(p.node.tone) ? C.navy : C.grayLt}
          strokeWidth={1.5}
        />
      ))}
      <circle cx={cx} cy={cy} r={20} fill={C.navy} />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="9" fontWeight="700">
        {GROUP_META.symbol}
      </text>
    </svg>
  );
}
