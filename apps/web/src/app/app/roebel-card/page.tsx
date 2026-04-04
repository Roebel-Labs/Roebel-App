"use client";

import { useState, useEffect } from "react";
import { useActiveAccount } from "thirdweb/react";
import { getRoebelCard, getPointsHistory, getStampCards } from "@/app/actions/roebel-card";
import { TIER_THRESHOLDS, POINTS_RULES, type RoebelCard, type PointsLedgerEntry, type StampCard, type RoebelTier } from "@/types/roebel-card";
import {
  CreditCard,
  TrendingUp,
  ArrowUpCircle,
  ArrowDownCircle,
  Star,
  Award,
  Stamp,
  ChevronRight,
} from "lucide-react";
import Image from "next/image";

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

export default function RoebelCardPage() {
  const account = useActiveAccount();
  const [card, setCard] = useState<RoebelCard | null>(null);
  const [history, setHistory] = useState<PointsLedgerEntry[]>([]);
  const [stampCards, setStampCards] = useState<StampCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!account?.address) return;

    async function fetchAll() {
      setLoading(true);
      const [cardRes, historyRes, stampsRes] = await Promise.all([
        getRoebelCard(account!.address),
        getPointsHistory(account!.address),
        getStampCards(account!.address),
      ]);

      if (cardRes.success && cardRes.data) setCard(cardRes.data);
      if (historyRes.success && historyRes.data) setHistory(historyRes.data);
      if (stampsRes.success && stampsRes.data) setStampCards(stampsRes.data);
      setLoading(false);
    }
    fetchAll();
  }, [account?.address]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-48 bg-muted rounded-lg animate-pulse" />
        <div className="h-32 bg-muted rounded-lg animate-pulse" />
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-lg font-medium text-foreground mb-2">Röbel Card</h2>
          <p className="text-sm text-muted-foreground">
            Verbinde dein Wallet, um deine Röbel Card zu sehen.
          </p>
        </div>
      </div>
    );
  }

  const nextTier: RoebelTier | null =
    card.tier === "besucher" ? "burger" :
    card.tier === "burger" ? "supporter" :
    null;

  const nextThreshold = nextTier ? TIER_THRESHOLDS[nextTier].minPoints : null;
  const progress = nextThreshold
    ? Math.min((card.total_earned / nextThreshold) * 100, 100)
    : 100;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Main card */}
      <div className={`bg-gradient-to-br ${tierColors[card.tier]} rounded-xl p-6 text-white`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            <span className="text-sm font-semibold">Röbel Card</span>
          </div>
          <span className="text-sm bg-white/20 px-3 py-1 rounded-full font-medium">
            {tierLabels[card.tier]}
          </span>
        </div>

        <div className="mb-4">
          <p className="text-4xl font-bold">{card.points_balance}</p>
          <p className="text-sm text-white/70">Verfügbare Punkte</p>
        </div>

        <div className="flex gap-6 text-sm">
          <div>
            <p className="text-white/70">Verdient</p>
            <p className="font-semibold flex items-center gap-1">
              <ArrowUpCircle className="h-3.5 w-3.5 text-green-300" />
              {card.total_earned}
            </p>
          </div>
          <div>
            <p className="text-white/70">Ausgegeben</p>
            <p className="font-semibold flex items-center gap-1">
              <ArrowDownCircle className="h-3.5 w-3.5 text-red-300" />
              {card.total_spent}
            </p>
          </div>
          {card.streak_days > 0 && (
            <div>
              <p className="text-white/70">Streak</p>
              <p className="font-semibold flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5 text-orange-300" />
                {card.streak_days} Tage
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tier progress */}
      {nextTier && nextThreshold && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-foreground">Nächste Stufe</h3>
            <span className="text-xs text-muted-foreground">
              {card.total_earned} / {nextThreshold} Punkte
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{tierLabels[nextTier]}</span> — {TIER_THRESHOLDS[nextTier].description}
          </p>
        </div>
      )}

      {/* How to earn */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <Star className="h-4 w-4 text-primary" />
          Punkte verdienen
        </h3>
        <div className="space-y-2">
          {Object.entries(POINTS_RULES)
            .filter(([key]) => key !== "redeem")
            .map(([key, rule]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{rule.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{rule.cap}</span>
                  <span className="font-medium text-foreground bg-muted px-2 py-0.5 rounded-full text-xs">
                    +{rule.amount}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Stamp cards */}
      {stampCards.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Stamp className="h-4 w-4 text-primary" />
            Stempelkarten
          </h3>
          <div className="space-y-3">
            {stampCards.map((sc) => (
              <div key={sc.id} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <div className="h-10 w-10 rounded-full bg-card overflow-hidden flex items-center justify-center flex-shrink-0">
                  {sc.business_logo_url ? (
                    <Image
                      src={sc.business_logo_url}
                      alt={sc.business_name || ""}
                      width={40}
                      height={40}
                      className="object-cover"
                    />
                  ) : (
                    <Stamp className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {sc.business_name || "Partner"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {sc.stamps_collected}/{sc.stamps_required} Stempel — {sc.reward_description}
                  </p>
                  <div className="flex gap-0.5 mt-1">
                    {Array.from({ length: sc.stamps_required }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full ${
                          i < sc.stamps_collected ? "bg-primary" : "bg-border"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                {sc.is_completed && (
                  <Award className="h-5 w-5 text-green-600 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction history */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Verlauf</h3>
        {history.length > 0 ? (
          <div className="space-y-2">
            {history.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm text-foreground">{entry.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleDateString("de-DE", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className={`text-sm font-semibold ${
                  entry.amount > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                }`}>
                  {entry.amount > 0 ? "+" : ""}{entry.amount}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            Noch keine Transaktionen. Verdiene Punkte durch Abstimmungen, Events und mehr!
          </p>
        )}
      </div>
    </div>
  );
}
