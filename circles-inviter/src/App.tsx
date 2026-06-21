import { useEffect, useState } from "react";
import { onWalletChange } from "@aboutcircles/miniapp-sdk";
import { getAddress, isAddress, type Address } from "viem";
import { ROEBEL_GROUP } from "./lib/circles";
import { explorerAvatar } from "./lib/citizens";
import { Coins, Activity, Globe, UserPlus, Ticket, ArrowUpRight } from "./components/icons";
import InviteView from "./views/InviteView";
import TownView from "./views/TownView";
import NetworkView from "./views/NetworkView";
import EventInviteView from "./views/EventInviteView";
import PulseView from "./views/PulseView";

type Tab = "town" | "pulse" | "network" | "invite" | "event";
const TABS: { id: Tab; label: string; icon: typeof Coins }[] = [
  { id: "town", label: "Town", icon: Coins },
  { id: "pulse", label: "Pulse", icon: Activity },
  { id: "network", label: "Network", icon: Globe },
  { id: "invite", label: "Invite", icon: UserPlus },
  { id: "event", label: "Event", icon: Ticket },
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
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col">
      {/* Sticky brand + tab bar */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 px-4 pb-2.5 pt-3 backdrop-blur-md">
        <div className="mb-2.5 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#2b5aa8] to-[#194383] text-white shadow-[0_6px_16px_-6px_rgba(25,67,131,0.7)]">
            <Coins className="h-5 w-5" />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="font-display text-[17px] font-extrabold tracking-tight text-foreground">Röbel Circles</h1>
            <p className="truncate text-[11px] text-muted-foreground">A town's money on Circles · Gnosis</p>
          </div>
          {inviter && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {inviter.slice(0, 6)}…{inviter.slice(-4)}
            </span>
          )}
        </div>

        <nav className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto rounded-[12px] bg-muted p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-1 min-w-[60px] flex-col items-center gap-1 rounded-[9px] py-1.5 text-[11px] font-medium transition ${
                  active ? "bg-card text-[#194383] shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 px-4 pb-12 pt-4">
        <div key={tab} className="rc-rise">
          {tab === "invite" && <InviteView inviter={inviter} />}
          {tab === "event" && <EventInviteView inviter={inviter} />}
          {tab === "town" && <TownView />}
          {tab === "pulse" && <PulseView />}
          {tab === "network" && <NetworkView />}
        </div>

        <footer className="mt-8 flex items-center justify-between border-t border-border/70 pt-4 text-[11px] text-muted-foreground">
          <span>Röbel / Müritz · Circles v2 on Gnosis</span>
          <a
            href={explorerAvatar(ROEBEL_GROUP)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-[#194383] hover:underline"
          >
            On-chain proof
            <ArrowUpRight className="h-3 w-3" />
          </a>
        </footer>
      </main>
    </div>
  );
}
