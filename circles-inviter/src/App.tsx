import { useEffect, useState } from "react";
import { onWalletChange } from "@aboutcircles/miniapp-sdk";
import { getAddress, isAddress, type Address } from "viem";
import { ROEBEL_GROUP } from "./lib/circles";
import { explorerAvatar } from "./lib/citizens";
import InviteView from "./views/InviteView";
import TownView from "./views/TownView";
import NetworkView from "./views/NetworkView";
import EventInviteView from "./views/EventInviteView";
import PulseView from "./views/PulseView";

type Tab = "town" | "pulse" | "network" | "invite" | "event";
const TABS: { id: Tab; label: string }[] = [
  { id: "town", label: "Town" },
  { id: "pulse", label: "Pulse" },
  { id: "network", label: "Network" },
  { id: "invite", label: "Invite" },
  { id: "event", label: "Event" },
];

// The Röbel app links here as `?inviter=<citizen address>` — use it as the initial inviter
// (and jump straight to the Event tab) even before the Circles host injects the wallet.
const urlInviter = (() => {
  try {
    const p = new URLSearchParams(window.location.search).get("inviter");
    return p && isAddress(p) ? getAddress(p) : null;
  } catch {
    return null;
  }
})();

export default function App() {
  const [tab, setTab] = useState<Tab>(urlInviter ? "event" : "town");
  const [inviter, setInviter] = useState<Address | null>(urlInviter);

  // The Circles host injects the connected wallet (used by the Invite/Event views).
  useEffect(() => {
    const ret = onWalletChange((addr: string | null) => setInviter(addr && isAddress(addr) ? getAddress(addr) : urlInviter));
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
        {tab === "event" && <EventInviteView inviter={inviter} />}
        {tab === "town" && <TownView />}
        {tab === "pulse" && <PulseView />}
        {tab === "network" && <NetworkView />}

        <p className="mt-8 text-[11px] text-slate-400">
          Röbel/Müritz · Circles v2 on Gnosis ·{" "}
          <a href={explorerAvatar(ROEBEL_GROUP)} target="_blank" rel="noreferrer" className="text-navy hover:underline">
            on-chain proof ↗
          </a>
        </p>
      </div>
    </div>
  );
}
