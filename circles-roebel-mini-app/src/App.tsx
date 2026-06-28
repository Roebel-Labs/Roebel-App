import { useEffect, useRef, useState, type ReactNode } from "react";
import { onWalletChange } from "@aboutcircles/miniapp-sdk";
import { getAddress, isAddress, type Address } from "viem";
import { ROEBEL_GROUP } from "./lib/circles";
import { explorerAvatar } from "./lib/citizens";
import { initAnalytics, setAnalyticsWallet, track, startHeartbeat } from "./lib/analytics";
import { Coins, BallotBox, Home, ChevronLeft, ArrowUpRight } from "./components/icons";
import logoData from "./assets/Logo-data.png";
import InviteView from "./views/InviteView";
import TownView from "./views/TownView";
import GovernanceView from "./views/GovernanceView";
import EventInviteView from "./views/EventInviteView";
import DocumentaryView from "./views/DocumentaryView";
import PulseView from "./views/PulseView";

type Tab = "town" | "economy" | "governance";
// Invite + Event + Documentary are not top-level tabs — they live inside the Town
// tab as openable pages (see TownView's "Citizen tools" cards + the Documentary card).
type SubPage = "invite" | "event" | "documentary";
const TABS: { id: Tab; label: string; icon: typeof Coins }[] = [
  { id: "town", label: "Town", icon: Home },
  { id: "economy", label: "Economy", icon: Coins },
  { id: "governance", label: "Governance", icon: BallotBox },
];

const urlParam = (k: string) => {
  try {
    return new URLSearchParams(window.location.search).get(k);
  } catch {
    return null;
  }
};
// The Röbel app links here as `?inviter=<citizen address>` — use it as the initial inviter
// (and open the Event page inside the Town tab) even before the Circles host injects the wallet.
const urlInviter = (() => {
  const p = urlParam("inviter");
  return p && isAddress(p) ? getAddress(p) : null;
})();
// `?ref=<wallet>` — a referral link shared from inside the app (the GrowCard).
const urlRef = (() => {
  const p = urlParam("ref");
  return p && isAddress(p) ? getAddress(p) : null;
})();
// `?proposal=<proposal_id|tx hash>` — deep-link straight into a proposal's detail.
const urlProposal = urlParam("proposal");

export default function App() {
  const [tab, setTab] = useState<Tab>(urlProposal ? "governance" : "town");
  // A deep-link with ?inviter opens straight onto the Event page within the Town tab.
  const [subPage, setSubPage] = useState<SubPage | null>(urlInviter ? "event" : null);
  const [inviter, setInviter] = useState<Address | null>(urlInviter);
  const [connected, setConnected] = useState<Address | null>(null);
  const connectedOnce = useRef(false);
  const refLanded = useRef(false);

  // Analytics: app_open + visibility-aware heartbeat (time spent).
  useEffect(() => {
    initAnalytics({ ref: urlRef });
    track("app_open", {
      tab: urlProposal ? "governance" : "town",
      subPage: urlInviter ? "event" : null,
      hasInviter: !!urlInviter,
      hasRef: !!urlRef,
      hasProposal: !!urlProposal,
    });
    return startHeartbeat(25);
  }, []);

  // The Circles host injects the connected wallet (used by Invite/Event + analytics).
  useEffect(() => {
    const ret = onWalletChange((addr: string | null) => {
      const a = addr && isAddress(addr) ? getAddress(addr) : null;
      setConnected(a);
      setInviter(a ?? urlInviter);
      setAnalyticsWallet(a);
      if (a && !connectedOnce.current) {
        connectedOnce.current = true;
        track("wallet_connect", {});
        // Referral attribution: a new wallet connected inside the app via someone's link.
        if (urlRef && !refLanded.current && urlRef.toLowerCase() !== a.toLowerCase()) {
          refLanded.current = true;
          track("referral_landed", { ref: urlRef.toLowerCase() });
        }
      }
    });
    return () => {
      if (typeof ret === "function") (ret as () => void)();
    };
  }, []);

  const selectTab = (id: Tab) => {
    setTab(id);
    setSubPage(null);
    track("tab_view", { tab: id });
  };

  const openSub = (p: SubPage) => {
    setSubPage(p);
    track("tab_view", { tab: p });
  };
  const closeSub = () => setSubPage(null);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col">
      {/* Sticky brand + tab bar */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 px-4 pb-2.5 pt-3 backdrop-blur-md">
        <div className="mb-2.5 flex items-center gap-2.5">
          <img src={logoData} alt="Röbel Data" className="h-7 w-auto" />
          {inviter && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00498B]" />
              {inviter.slice(0, 6)}…{inviter.slice(-4)}
            </span>
          )}
        </div>

        <nav className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto rounded-[10px] bg-muted p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => selectTab(t.id)}
                className={`flex flex-1 min-w-[60px] flex-col items-center gap-1 rounded-[8px] py-1.5 text-[11px] font-medium transition ${
                  active ? "bg-card text-[#00498B] shadow-sm" : "text-muted-foreground hover:text-foreground"
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
        <div key={`${tab}:${subPage ?? ""}`} className="rc-rise">
          {tab === "town" &&
            (subPage === "invite" ? (
              <SubPage onBack={closeSub}>
                <InviteView inviter={inviter} />
              </SubPage>
            ) : subPage === "event" ? (
              <SubPage onBack={closeSub}>
                <EventInviteView inviter={inviter} />
              </SubPage>
            ) : subPage === "documentary" ? (
              // Documentary owns its own header/back (nested list ↔ detail nav),
              // so it is rendered outside the generic SubPage chrome.
              <DocumentaryView onBack={closeSub} />
            ) : (
              <TownView
                connected={connected}
                onOpenInvite={() => openSub("invite")}
                onOpenEvent={() => openSub("event")}
                onOpenDocumentary={() => openSub("documentary")}
              />
            ))}
          {tab === "economy" && <PulseView />}
          {tab === "governance" && <GovernanceView initialProposalId={urlProposal} />}
        </div>

        <footer className="mt-8 flex items-center justify-between border-t border-border/70 pt-4 text-[11px] text-muted-foreground">
          <span>Röbel / Müritz · Circles v2 on Gnosis</span>
          <a
            href={explorerAvatar(ROEBEL_GROUP)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-[#00498B] hover:underline"
          >
            On-chain proof
            <ArrowUpRight className="h-3 w-3" />
          </a>
        </footer>
      </main>
    </div>
  );
}

// Wraps a page opened from within the Town tab (Invite / Event) with a back affordance.
function SubPage({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="-ml-1.5 inline-flex items-center gap-1 rounded-[10px] px-1.5 py-1 text-[13px] font-medium text-muted-foreground transition hover:text-foreground active:scale-[0.98]"
      >
        <ChevronLeft className="h-4 w-4" />
        Town
      </button>
      {children}
    </div>
  );
}
