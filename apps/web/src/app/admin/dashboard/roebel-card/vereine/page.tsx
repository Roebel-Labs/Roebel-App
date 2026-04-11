import {
  getRoebelerTopf,
  listVereineContributions,
} from "@/app/actions/roebel-card-admin";
import { formatEuros } from "@/lib/format-euros";
import { Badge } from "@/components/ui/badge";
import { Coins } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RoebelCardVereinePage() {
  const [contributions, topf] = await Promise.all([
    listVereineContributions(),
    getRoebelerTopf(),
  ]);

  return (
    <div className="space-y-6">
      {/* Röbeler Topf card */}
      <div className="bg-card border border-border rounded-[10px] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-1">
              <Coins className="h-4 w-4" />
              Röbeler Topf
            </div>
            <h2 className="text-lg font-medium">
              Gemeinsamer Förder-Fund
            </h2>
          </div>
          <div className="text-3xl font-semibold text-foreground">
            {formatEuros(topf.fund?.balance_cents ?? 0)}
          </div>
        </div>

        {topf.recentEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Einzahlungen
          </p>
        ) : (
          <div>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Letzte Einzahlungen
            </h3>
            <ul className="divide-y divide-border text-sm">
              {topf.recentEntries.map((e) => (
                <li
                  key={e.id}
                  className="py-2 flex items-center justify-between"
                >
                  <div className="text-muted-foreground">
                    {formatDate(e.created_at)} ·{" "}
                    {e.purchase_wallet_address
                      ? truncateWallet(e.purchase_wallet_address)
                      : "—"}
                  </div>
                  <div className="font-medium">
                    +{formatEuros(e.amount_cents)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Vereine list */}
      <div>
        <h2 className="text-lg font-medium mb-3">Vereine</h2>
        <div className="bg-card border border-border rounded-[10px] overflow-hidden">
          {contributions.length === 0 ? (
            <p className="px-4 py-12 text-center text-muted-foreground text-sm">
              Noch keine Vereine mit Beiträgen
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground">
                  <th className="text-left font-medium px-4 py-2">Verein</th>
                  <th className="text-right font-medium px-4 py-2">
                    Ausstehend
                  </th>
                  <th className="text-right font-medium px-4 py-2">
                    Ausgezahlt
                  </th>
                  <th className="text-right font-medium px-4 py-2">Gesamt</th>
                  <th className="text-left font-medium px-4 py-2">
                    Zuletzt aktualisiert
                  </th>
                </tr>
              </thead>
              <tbody>
                {contributions.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <div className="font-medium">{c.account_name}</div>
                      <div className="text-xs text-muted-foreground">
                        <Badge variant="outline" className="mr-2">
                          {c.account_type}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatEuros(c.pending_amount_cents)}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {formatEuros(c.paid_amount_cents)}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {formatEuros(
                        c.pending_amount_cents + c.paid_amount_cents,
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">
                      {formatDate(c.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateWallet(wallet: string): string {
  if (wallet.length <= 14) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}
