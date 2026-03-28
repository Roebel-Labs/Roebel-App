"use client";

import { use } from "react";
import { Header } from "@/components/layout/Header";
import { usePublicProfile } from "@/hooks/usePublicProfile";
import { formatWalletAddress, getDaysSinceJoined } from "@/lib/user-types";
import { RoleBadge } from "@/components/profile/RoleBadge";
import Link from "next/link";

export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ wallet_address: string }>;
}) {
  const { wallet_address } = use(params);
  const { profile, isLoading, error } = usePublicProfile(wallet_address);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="animate-pulse space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-muted rounded-full" />
                <div className="space-y-2">
                  <div className="h-5 bg-muted rounded w-32" />
                  <div className="h-4 bg-muted rounded w-48" />
                </div>
              </div>
              <div className="h-24 bg-muted rounded-lg" />
              <div className="h-24 bg-muted rounded-lg" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-muted">
        <Header />
        <main className="container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-card border border-border rounded-lg p-8">
              <h2 className="text-xl font-medium mb-3 text-foreground">Profil nicht gefunden</h2>
              <p className="text-muted-foreground mb-6 text-sm">
                {error || "Dieses Profil existiert nicht oder ist nicht verfügbar."}
              </p>
              <Link
                href="/"
                className="inline-block bg-black hover:bg-foreground/90 text-white px-5 py-2 rounded-md font-medium transition-colors text-sm"
              >
                Zur Startseite
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const daysSinceJoined = getDaysSinceJoined(profile.created_at);
  const hasCitizen = Number(profile.nft_balance || 0) > 0;

  return (
    <div className="min-h-screen bg-muted">
      <Header />

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="max-w-2xl mx-auto">
          {/* Profile Header */}
          <div className="bg-card border border-border rounded-lg p-4 sm:p-6 mb-3 sm:mb-4">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="shrink-0">
                {profile.profile_picture_url ? (
                  <img
                    src={profile.profile_picture_url}
                    alt={profile.username || "Profile"}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-muted border border-border flex items-center justify-center">
                    <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-lg sm:text-xl font-medium text-foreground truncate">
                    {profile.username || formatWalletAddress(profile.wallet_address)}
                  </h1>
                  <RoleBadge role={profile.role} />
                </div>

                <p className="text-xs text-muted-foreground break-all mb-2">
                  {formatWalletAddress(profile.wallet_address)}
                </p>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {hasCitizen && (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Verifiziert
                    </span>
                  )}
                  <span>Seit {daysSinceJoined} Tagen Mitglied</span>
                </div>
              </div>
            </div>

            {/* Bio */}
            {profile.bio && (
              <p className="mt-4 text-sm text-foreground">{profile.bio}</p>
            )}
          </div>

          {/* Location & Interests */}
          {(profile.neighborhood || (profile.interests && profile.interests.length > 0) || (profile.vereine && profile.vereine.length > 0)) && (
            <div className="bg-card border border-border rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
              {profile.neighborhood && (
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm text-foreground">{profile.neighborhood}</span>
                </div>
              )}

              {profile.interests && profile.interests.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs text-muted-foreground mb-1.5">Interessen</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.interests.map((interest: string) => (
                      <span key={interest} className="px-2 py-0.5 bg-muted text-muted-foreground rounded-full text-xs">
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {profile.vereine && profile.vereine.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Vereine</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.vereine.map((verein: string) => (
                      <span key={verein} className="px-2 py-0.5 bg-muted text-muted-foreground rounded-full text-xs">
                        {verein}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Civic Participation (resident / official) */}
          {(profile.role === "resident" || profile.role === "official") && profile.total_votes_cast !== undefined && (
            <div className="bg-card border border-border rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
              <h2 className="text-sm sm:text-base font-medium text-foreground mb-3">Bürger-Aktivität</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-lg sm:text-xl font-semibold text-foreground">{profile.total_votes_cast || 0}</p>
                  <p className="text-xs text-muted-foreground">Abstimmungen</p>
                </div>
                <div className="text-center">
                  <p className="text-lg sm:text-xl font-semibold text-foreground">{profile.voting_streak || 0}</p>
                  <p className="text-xs text-muted-foreground">Streak</p>
                </div>
                <div className="text-center">
                  <p className="text-lg sm:text-xl font-semibold text-foreground">{profile.gamification_points || 0}</p>
                  <p className="text-xs text-muted-foreground">Punkte</p>
                </div>
              </div>
            </div>
          )}

          {/* Business Profile Placeholder */}
          {profile.role === "business" && (
            <div className="bg-card border border-border rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
              <h2 className="text-sm sm:text-base font-medium text-foreground mb-2">Gewerbe-Profil</h2>
              <p className="text-xs text-muted-foreground">
                Dienste und Bewertungen werden bald verfügbar sein.
              </p>
            </div>
          )}

          {/* Back link */}
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Zurück
          </Link>
        </div>
      </main>
    </div>
  );
}
