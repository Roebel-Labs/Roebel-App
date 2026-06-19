import { useEffect, useState } from "react";
import { onWalletChange } from "@aboutcircles/miniapp-sdk";
import { getAddress, isAddress, type Address } from "viem";
import InviteView from "./views/InviteView";
import TownView from "./views/TownView";
import FlowView from "./views/FlowView";
import NetworkView from "./views/NetworkView";

type Tab = "town" | "flow" | "network" | "invite";
const TABS: { id: Tab; label: string }[] = [
  { id: "town", label: "Town" },
  { id: "flow", label: "Flow" },
  { id: "network", label: "Network" },
  { id: "invite", label: "Invite" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("town");
  const [inviter, setInviter] = useState<Address | null>(null);

  // The Circles host injects the connected wallet (used by the Invite view).
  useEffect(() => {
    const ret = onWalletChange((addr: string | null) => setInviter(addr && isAddress(addr) ? getAddress(addr) : null));
    return () => {
      if (typeof ret === "function") (ret as () => void)();
    };
  }, []);

  return (
    <div className="min-h-full flex justify-center px-4 py-6">
      <div className="w-full max-w-xl">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-navy">Röbel Circles</h1>
          <p className="text-sm text-slate-500">A town's money on Circles — invite citizens and watch the economy grow.</p>
        </header>

        <nav className="mb-5 flex gap-1 rounded-xl bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                tab === t.id ? "bg-white text-navy shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "invite" && <InviteView inviter={inviter} />}
        {tab === "town" && <TownView />}
        {tab === "flow" && <FlowView />}
        {tab === "network" && <NetworkView />}

        <p className="mt-8 text-[11px] text-slate-400">Röbel/Müritz · Circles v2 on Gnosis · data is live &amp; public.</p>
      </div>
    </div>
  );
}
