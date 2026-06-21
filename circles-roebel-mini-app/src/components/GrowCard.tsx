// Referral share — the shareable mini-app link (+ QR) carrying the connected
// wallet as ?ref. When a neighbour opens it inside the Circles app and connects,
// App.tsx attributes a `referral_landed` event to this wallet.
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Address } from "viem";
import { ChartCard, EmptyHint } from "./ui";
import { Copy, Share, Check } from "./icons";
import { track } from "../lib/analytics";

export default function GrowCard({ wallet }: { wallet: Address | null }) {
  const [copied, setCopied] = useState(false);
  const opened = useRef(false);
  const link = wallet ? `${window.location.origin}/?ref=${wallet.toLowerCase()}` : "";

  useEffect(() => {
    if (wallet && !opened.current) {
      opened.current = true;
      track("share_opened", {});
    }
  }, [wallet]);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* clipboard blocked */
    }
    setCopied(true);
    track("share_copied", {});
    setTimeout(() => setCopied(false), 1600);
  };

  const share = async () => {
    if (!link) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Join Röbel on Circles", text: "Join our town on Circles", url: link });
        track("share_native", {});
      } catch {
        /* dismissed */
      }
    } else {
      void copy();
    }
  };

  return (
    <ChartCard title="Grow Röbel" subtitle="Share the town wallet — bring a neighbour onchain.">
      {!wallet ? (
        <EmptyHint>Connect your wallet to get your invite link.</EmptyHint>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="shrink-0 rounded-[14px] border border-border bg-white p-3 shadow-sm">
            <QRCodeSVG value={link} size={116} level="M" fgColor="#0b1220" />
          </div>
          <div className="w-full min-w-0 flex-1">
            <div className="truncate rounded-[10px] border border-border bg-muted px-3 py-2 font-mono text-[12px] text-muted-foreground">{link}</div>
            <div className="mt-2.5 flex gap-2">
              <button
                onClick={copy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#194383] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4e99] active:scale-[0.99]"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy link"}
              </button>
              <button
                onClick={share}
                className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted active:scale-[0.99]"
              >
                <Share className="h-4 w-4" /> Share
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              When a neighbour opens this inside the Circles app and connects, it counts as your referral.
            </p>
          </div>
        </div>
      )}
    </ChartCard>
  );
}
