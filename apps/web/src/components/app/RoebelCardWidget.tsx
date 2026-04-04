"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useActiveAccount } from "thirdweb/react";
import { getRoebelCard } from "@/app/actions/roebel-card";
import { TIER_THRESHOLDS, type RoebelCard, type RoebelTier } from "@/types/roebel-card";
import { CreditCard, Star, ArrowRight, TrendingUp } from "lucide-react";

const tierColors: Record<RoebelTier, string> = {
  besucher: "from-slate-500 to-slate-600",
  burger: "from-[#194383] to-blue-700",
  supporter: "from-amber-500 to-orange-600",
};

const tierLabels: Record<RoebelTier, string> = {
  besucher: "Besucher",
  burger: "Bürger",
  supporter: "Supporter",
};

export function RoebelCardWidget() {
  const account = useActiveAccount();
  const [card, setCard] = useState<RoebelCard | null>(null);

  useEffect(() => {
    if (!account?.address) return;
    getRoebelCard(account.address).then((res) => {
      if (res.success && res.data) setCard(res.data);
    });
  }, [account?.address]);

  if (!card) return null;

  const nextTier: RoebelTier | null =
    card.tier === "besucher" ? "burger" :
    card.tier === "burger" ? "supporter" :
    null;

  const nextThreshold = nextTier ? TIER_THRESHOLDS[nextTier].minPoints : null;
  const progress = nextThreshold
    ? Math.min((card.total_earned / nextThreshold) * 100, 100)
    : 100;

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {/* Header with gradient */}
      <div className={`bg-gradient-to-r ${tierColors[card.tier]} px-4 py-3 text-white`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="text-xs font-medium">Röbel Card</span>
          </div>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
            {tierLabels[card.tier]}
          </span>
        </div>
        <p className="text-2xl font-bold mt-2">{card.points_balance}</p>
        <p className="text-xs text-white/70">Punkte</p>
      </div>

      {/* Progress to next tier */}
      {nextTier && nextThreshold && (
        <div className="px-4 py-3">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">
              Nächste Stufe: {tierLabels[nextTier]}
            </span>
            <span className="text-foreground font-medium">
              {card.total_earned}/{nextThreshold}
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Streak */}
      {card.streak_days > 0 && (
        <div className="px-4 pb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <TrendingUp className="h-3 w-3 text-orange-500" />
          <span>{card.streak_days} Tage Streak</span>
        </div>
      )}

      {/* Link */}
      <div className="px-4 pb-3">
        <Link
          href="/app/roebel-card"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
        >
          Details anzeigen <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
