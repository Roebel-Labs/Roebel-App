import { ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { AdminUserRow } from "@/app/actions/users-admin";
import { formatWalletAddress } from "@/lib/user-types";

const DAY_MS = 24 * 60 * 60 * 1000;

const berlinDayFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
});

function formatVerifiedAt(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Citizens verified in the last 7 days, newest first. The timestamp is the
 * on-chain CitizenNFT mint (ground truth); falls back to the app-side
 * verification date when the chain scan is unavailable.
 */
export function VerifiedThisWeek({ rows }: { rows: AdminUserRow[] }) {
  const cutoff = Date.now() - 7 * DAY_MS;
  const today = berlinDayFmt.format(new Date());

  const recent = rows
    .map((r) => ({
      row: r,
      verifiedAt: r.verified_onchain_at ?? r.citizen_verification_date,
    }))
    .filter(
      (e): e is { row: AdminUserRow; verifiedAt: string } =>
        !!e.verifiedAt && new Date(e.verifiedAt).getTime() >= cutoff
    )
    .sort(
      (a, b) =>
        new Date(b.verifiedAt).getTime() - new Date(a.verifiedAt).getTime()
    );

  if (recent.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Diese Woche keine neuen Verifizierungen.
      </p>
    );
  }

  const todayCount = recent.filter(
    (e) => berlinDayFmt.format(new Date(e.verifiedAt)) === today
  ).length;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {recent.length} Verifizierung{recent.length === 1 ? "" : "en"} in den
        letzten 7 Tagen
        {todayCount > 0 ? ` · davon ${todayCount} heute` : ""}.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {recent.map(({ row: r, verifiedAt }) => {
          const name =
            r.username ||
            r.display_name ||
            formatWalletAddress(r.wallet_address);
          return (
            <li
              key={r.wallet_address}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <Avatar className="h-8 w-8 shrink-0">
                {r.profile_picture_url && (
                  <AvatarImage src={r.profile_picture_url} alt={name} />
                )}
                <AvatarFallback className="text-xs">
                  {(r.username ?? r.wallet_address).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 font-medium">
                  <span className="truncate max-w-[180px]">{name}</span>
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#00498B]" />
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatWalletAddress(r.wallet_address)}
                  {r.neighborhood ? ` · ${r.neighborhood}` : ""}
                </span>
              </div>
              {!r.is_verified_citizen && (
                <span className="hidden shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 sm:inline-flex dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  App-Sync ausstehend
                </span>
              )}
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatVerifiedAt(verifiedAt)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
