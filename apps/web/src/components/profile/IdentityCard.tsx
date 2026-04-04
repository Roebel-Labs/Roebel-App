"use client";

import { useState } from "react";
import Image from "next/image";
import { formatWalletAddress, getDaysSinceJoined } from "@/lib/user-types";
import { RoleBadge } from "@/components/profile/RoleBadge";
import type { AppMode } from "@/lib/context/AppModeContext";
import {
  CheckCircle,
  MapPin,
  Calendar,
  Star,
  Vote,
  QrCode,
  Award,
} from "lucide-react";

interface IdentityCardProps {
  user: {
    username?: string | null;
    wallet_address: string;
    profile_picture_url?: string | null;
    cover_image_url?: string | null;
    neighborhood?: string | null;
    role?: string | null;
    created_at: string;
    nft_balance?: number | string | null;
    total_votes_cast?: number | null;
    voting_streak?: number | null;
    gamification_points?: number | null;
  };
  activeMode: AppMode;
  isAttester?: boolean;
  votingPower?: number;
  onShowQR?: () => void;
}

export function IdentityCard({
  user,
  activeMode,
  isAttester,
  votingPower,
  onShowQR,
}: IdentityCardProps) {
  const [showBack, setShowBack] = useState(false);
  const hasCitizen = Number(user.nft_balance || 0) > 0;
  const daysSinceJoined = getDaysSinceJoined(user.created_at);

  // Mode-colored gradient
  const gradientClass =
    activeMode === "citizen"
      ? "from-[#194383] to-blue-700"
      : activeMode === "org"
        ? "from-gray-800 to-gray-900"
        : "from-slate-500 to-slate-600";

  const cardLabel =
    activeMode === "citizen"
      ? "Bürgerausweis"
      : activeMode === "org"
        ? "Partner Card"
        : "Tourist Card";

  return (
    <div
      className="relative rounded-xl overflow-hidden border border-border cursor-pointer select-none"
      onClick={() => setShowBack(!showBack)}
    >
      {!showBack ? (
        /* ---- FRONT ---- */
        <div className={`bg-gradient-to-br ${gradientClass} p-5 text-white min-h-[180px] flex flex-col justify-between`}>
          {/* Top row */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full border-2 border-white/30 bg-white/10 overflow-hidden relative flex-shrink-0">
                {user.profile_picture_url ? (
                  <Image
                    src={user.profile_picture_url}
                    alt={user.username || "Profile"}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/60 text-xl font-bold">
                    {(user.username || "?").charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-lg font-semibold leading-tight">
                  {user.username || formatWalletAddress(user.wallet_address)}
                </h2>
                {user.neighborhood && (
                  <p className="text-white/70 text-xs flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" />
                    {user.neighborhood}
                  </p>
                )}
              </div>
            </div>
            <RoleBadge role={user.role || "tourist"} />
          </div>

          {/* Bottom row */}
          <div className="flex items-end justify-between mt-4">
            <div className="flex items-center gap-4 text-xs text-white/70">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Seit {daysSinceJoined} Tagen
              </span>
              {hasCitizen && (
                <span className="flex items-center gap-1 text-green-300">
                  <CheckCircle className="h-3 w-3" />
                  Verifiziert
                </span>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{Number(user.gamification_points || 0)}</p>
              <p className="text-xs text-white/70">Punkte</p>
            </div>
          </div>

          {/* Tap hint */}
          <p className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[10px] text-white/40">
            Tippen zum Umdrehen
          </p>
        </div>
      ) : (
        /* ---- BACK ---- */
        <div className="bg-card p-5 min-h-[180px]">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">{cardLabel}</h3>
            {onShowQR && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShowQR();
                }}
                className="p-1.5 rounded-md hover:bg-accent transition-colors"
                title="QR-Code anzeigen"
              >
                <QrCode className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <p className="text-xl font-bold text-foreground">{Number(user.total_votes_cast || 0)}</p>
              <p className="text-xs text-muted-foreground">Abstimmungen</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-foreground">{Number(user.voting_streak || 0)}</p>
              <p className="text-xs text-muted-foreground">Streak</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-foreground">{Number(user.gamification_points || 0)}</p>
              <p className="text-xs text-muted-foreground">Punkte</p>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-2 text-xs">
            {hasCitizen && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Stimmrecht</span>
                <span className="text-foreground font-medium">
                  {votingPower && votingPower > 0 ? "Aktiviert" : "Nicht aktiviert"}
                </span>
              </div>
            )}
            {isAttester && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Bescheiniger</span>
                <span className="flex items-center gap-1 text-green-600">
                  <Award className="h-3 w-3" />
                  Aktiv
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Mitglied seit</span>
              <span className="text-foreground font-medium">
                {new Date(user.created_at).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
          </div>

          {/* Tap hint */}
          <p className="text-center text-[10px] text-muted-foreground/50 mt-3">
            Tippen zum Umdrehen
          </p>
        </div>
      )}
    </div>
  );
}
