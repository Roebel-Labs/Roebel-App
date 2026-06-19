import { useEffect, useState } from "react";
import { TOWNS, META_GROUP_LABEL } from "../lib/towns";
import { getVerifiedSet } from "../lib/circlesData";
import RadialGraph, { type RadialNode } from "../components/RadialGraph";

export default function NetworkView() {
  const [verified, setVerified] = useState<number | null>(null);
  useEffect(() => {
    getVerifiedSet()
      .then((s) => setVerified(s.size))
      .catch(() => setVerified(0));
  }, []);

  const nodes: RadialNode[] = TOWNS.map((t) => ({
    id: t.id,
    label: t.name,
    tone: t.real ? "real" : "placeholder",
    dashed: !t.real,
    sub: t.real ? (verified == null ? "" : `${verified} verified`) : "soon",
  }));

  return (
    <div>
      <p className="text-sm text-slate-500 mb-3">
        From a town's money to a <strong>network of towns</strong>: a meta-group that trusts verified town currencies.
        Acceptance federates; minting stays local.
      </p>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <RadialGraph center={{ label: META_GROUP_LABEL, sub: "meta-group" }} nodes={nodes} />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        Röbel is the one live town today (navy). The dashed nodes are placeholders for future towns running the
        verified-citizen stack — each keeps its own supply and citizen gate. Real towns appear here automatically as they
        launch.
      </p>
    </div>
  );
}
