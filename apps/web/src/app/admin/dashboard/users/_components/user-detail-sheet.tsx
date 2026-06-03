"use client";

import { ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AdminUserRow } from "@/app/actions/users-admin";
import {
  formatWalletAddress,
  getRoleInfo,
  type UserRoleOrTier,
} from "@/lib/user-types";

const numberFmt = new Intl.NumberFormat("de-DE");

const TIER_LABELS: Record<string, string> = {
  citizen: "Bürger",
  tourist: "Gast (Tourist)",
  guest: "Gast",
};

const VERIFICATION_LABELS: Record<string, string> = {
  pending: "Ausstehend",
  approved: "Verifiziert",
  rejected: "Abgelehnt",
};

const POINTS_TIER_LABELS: Record<string, string> = {
  besucher: "Besucher",
  burger: "Bürger",
  supporter: "Supporter",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium break-all">{value}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <div className="divide-y divide-border rounded-lg border border-border px-3">
        {children}
      </div>
    </div>
  );
}

export function UserDetailSheet({
  user,
  open,
  onOpenChange,
}: {
  user: AdminUserRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
      >
        {user && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3 text-left">
                <Avatar className="h-12 w-12">
                  {user.profile_picture_url && (
                    <AvatarImage
                      src={user.profile_picture_url}
                      alt={
                        user.username ||
                        user.display_name ||
                        formatWalletAddress(user.wallet_address)
                      }
                    />
                  )}
                  <AvatarFallback>
                    {(user.username ?? user.wallet_address)
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <SheetTitle className="flex items-center gap-1.5">
                    <span className="truncate">
                      {user.username ||
                        user.display_name ||
                        formatWalletAddress(user.wallet_address)}
                    </span>
                    {user.is_verified_citizen && (
                      <ShieldCheck className="h-4 w-4 shrink-0 text-[#194383]" />
                    )}
                  </SheetTitle>
                  <SheetDescription className="font-mono text-xs">
                    {formatWalletAddress(user.wallet_address, 10, 8)}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="outline">
                  {TIER_LABELS[user.tier] ??
                    getRoleInfo(user.tier as UserRoleOrTier).labelDe}
                </Badge>
                <Badge
                  variant={
                    user.verification_status === "approved"
                      ? "success"
                      : user.verification_status === "rejected"
                        ? "error"
                        : "pending"
                  }
                >
                  {VERIFICATION_LABELS[user.verification_status] ??
                    user.verification_status}
                </Badge>
                {user.is_extern && <Badge variant="secondary">Extern</Badge>}
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-5">
              <Section title="Kontakt (maskiert)">
                <Field
                  label="E-Mail"
                  value={
                    <span>
                      {user.email ?? "—"}
                      {user.email && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          {user.email_verified ? "✓" : "(unbestätigt)"}
                        </span>
                      )}
                    </span>
                  }
                />
                <Field
                  label="Telefon"
                  value={
                    <span>
                      {user.phone_number ?? "—"}
                      {user.phone_number && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          {user.phone_verified ? "✓" : "(unbestätigt)"}
                        </span>
                      )}
                    </span>
                  }
                />
                <Field label="Anmeldeart" value={user.auth_provider ?? "—"} />
              </Section>

              <Section title="Profil">
                <Field label="Ortsteil" value={user.neighborhood ?? "—"} />
                <Field
                  label="Interessen"
                  value={
                    user.interests.length ? user.interests.join(", ") : "—"
                  }
                />
                <Field
                  label="Vereine"
                  value={user.vereine.length ? user.vereine.join(", ") : "—"}
                />
                {user.bio && <Field label="Bio" value={user.bio} />}
              </Section>

              <Section title="Engagement & Governance">
                <Field
                  label="Stimmen gesamt"
                  value={numberFmt.format(user.total_votes_cast)}
                />
                <Field
                  label="Abstimmungs-Streak"
                  value={numberFmt.format(user.voting_streak)}
                />
                <Field
                  label="Letzte Abstimmung"
                  value={formatDateTime(user.last_vote_date)}
                />
                <Field
                  label="Gamification-Punkte"
                  value={numberFmt.format(user.gamification_points)}
                />
                <Field
                  label="NFT-Guthaben"
                  value={numberFmt.format(user.nft_balance)}
                />
                <Field
                  label="Delegiert"
                  value={user.has_delegated ? "Ja" : "Nein"}
                />
              </Section>

              <Section title="Röbel-Punkte-Karte">
                {user.points_balance === null ? (
                  <Field label="Status" value="Keine Karte" />
                ) : (
                  <>
                    <Field
                      label="Guthaben"
                      value={numberFmt.format(user.points_balance)}
                    />
                    <Field
                      label="Verdient gesamt"
                      value={numberFmt.format(user.points_total_earned ?? 0)}
                    />
                    <Field
                      label="Ausgegeben gesamt"
                      value={numberFmt.format(user.points_total_spent ?? 0)}
                    />
                    <Field
                      label="Stufe"
                      value={
                        user.points_tier
                          ? (POINTS_TIER_LABELS[user.points_tier] ??
                            user.points_tier)
                          : "—"
                      }
                    />
                    <Field
                      label="Taler"
                      value={numberFmt.format(user.taler_balance ?? 0)}
                    />
                    <Field
                      label="Aktivitäts-Streak"
                      value={`${numberFmt.format(user.points_streak_days ?? 0)} Tage`}
                    />
                    <Field
                      label="Zuletzt aktiv"
                      value={formatDateTime(user.points_last_activity_at)}
                    />
                  </>
                )}
              </Section>

              <Section title="Zeitstempel">
                <Field
                  label="Beigetreten"
                  value={formatDateTime(user.created_at)}
                />
                <Field
                  label="Zuletzt angemeldet"
                  value={formatDateTime(user.last_login_at)}
                />
              </Section>

              {user.verification_notes && (
                <Section title="Verifizierungs-Notizen">
                  <Field label="Notiz" value={user.verification_notes} />
                </Section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
