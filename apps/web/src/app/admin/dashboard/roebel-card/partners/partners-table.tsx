"use client";

import { useState } from "react";
import { Clock, CheckCircle, XCircle, Ban, Store } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  approveRoebelCardPartner,
  rejectRoebelCardPartner,
} from "@/app/actions/roebel-card-admin";
import type { PartnerStatus, PartnerWithAccount } from "@/types/roebel-card-voucher";
import { RECHTSFORM_LABELS } from "@/types/roebel-card-voucher";

type FilterStatus = PartnerStatus | "all";

const STATUS_TABS: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "pending", label: "Ausstehend" },
  { value: "approved", label: "Genehmigt" },
  { value: "rejected", label: "Abgelehnt" },
  { value: "suspended", label: "Gesperrt" },
];

const STATUS_CONFIG: Record<
  PartnerStatus,
  { icon: React.ReactNode; label: string; variant: "secondary" | "default" | "destructive" }
> = {
  pending: {
    icon: <Clock className="h-3.5 w-3.5 text-amber-500" />,
    label: "Ausstehend",
    variant: "secondary",
  },
  approved: {
    icon: <CheckCircle className="h-3.5 w-3.5 text-green-500" />,
    label: "Genehmigt",
    variant: "default",
  },
  rejected: {
    icon: <XCircle className="h-3.5 w-3.5 text-red-500" />,
    label: "Abgelehnt",
    variant: "destructive",
  },
  suspended: {
    icon: <Ban className="h-3.5 w-3.5 text-red-500" />,
    label: "Gesperrt",
    variant: "destructive",
  },
};

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

export function PartnersTable({
  initialPartners,
}: {
  initialPartners: PartnerWithAccount[];
}) {
  const [partners, setPartners] = useState(initialPartners);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const filtered =
    filter === "all" ? partners : partners.filter((p) => p.status === filter);

  const pendingCount = partners.filter((p) => p.status === "pending").length;

  const handleApprove = async (id: string) => {
    setLoadingId(id);
    const result = await approveRoebelCardPartner(id);
    if (result.success) {
      setPartners((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, status: "approved" as PartnerStatus, approved_at: new Date().toISOString() }
            : p,
        ),
      );
    }
    setLoadingId(null);
  };

  const handleReject = async (id: string) => {
    setLoadingId(id);
    const result = await rejectRoebelCardPartner(id);
    if (result.success) {
      setPartners((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, status: "rejected" as PartnerStatus } : p,
        ),
      );
    }
    setLoadingId(null);
  };

  return (
    <div className="space-y-4">
      {/* Status filter tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              filter === tab.value
                ? "bg-card border border-b-white border-border text-foreground -mb-px"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.value === "pending" && pendingCount > 0 && (
              <span className="ml-1.5 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length > 0 ? (
        <div className="bg-card border border-border rounded-[10px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Organisation</th>
                  <th className="px-4 py-3 font-medium">Rechtsform</th>
                  <th className="px-4 py-3 font-medium">Kontoinhaber</th>
                  <th className="px-4 py-3 font-medium">IBAN</th>
                  <th className="px-4 py-3 font-medium">USt-IdNr.</th>
                  <th className="px-4 py-3 font-medium text-right">Umsatz</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Erstellt</th>
                  <th className="px-4 py-3 font-medium">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((partner) => {
                  const cfg = STATUS_CONFIG[partner.status];
                  const isLoading = loadingId === partner.id;

                  return (
                    <tr
                      key={partner.id}
                      className="border-t border-border hover:bg-muted/30 transition-colors"
                    >
                      {/* Organisation */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            {partner.account_avatar_url && (
                              <AvatarImage
                                src={partner.account_avatar_url}
                                alt={partner.account_name}
                              />
                            )}
                            <AvatarFallback className="text-xs font-medium">
                              {partner.account_name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-foreground truncate">
                            {partner.account_name}
                          </span>
                        </div>
                      </td>

                      {/* Rechtsform */}
                      <td className="px-4 py-3 text-muted-foreground">
                        {partner.rechtsform
                          ? RECHTSFORM_LABELS[partner.rechtsform]
                          : "—"}
                      </td>

                      {/* Kontoinhaber */}
                      <td className="px-4 py-3 text-foreground">
                        {partner.account_holder ?? "—"}
                      </td>

                      {/* IBAN */}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {partner.iban_last4
                          ? `••••${partner.iban_last4}`
                          : "—"}
                      </td>

                      {/* USt-IdNr. */}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {partner.vat_id ?? "—"}
                      </td>

                      {/* Umsatz */}
                      <td className="px-4 py-3 text-right text-foreground">
                        {formatEuros(partner.lifetime_volume_cents)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <Badge
                          variant={cfg.variant}
                          className="gap-1 whitespace-nowrap"
                        >
                          {cfg.icon}
                          {cfg.label}
                        </Badge>
                      </td>

                      {/* Erstellt */}
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(partner.created_at).toLocaleDateString(
                          "de-DE",
                        )}
                      </td>

                      {/* Aktionen */}
                      <td className="px-4 py-3">
                        {partner.status === "pending" && (
                          <div className="flex items-center gap-2">
                            <button
                              disabled={isLoading}
                              onClick={() => handleApprove(partner.id)}
                              className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                            >
                              Genehmigen
                            </button>
                            <button
                              disabled={isLoading}
                              onClick={() => handleReject(partner.id)}
                              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                            >
                              Ablehnen
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <Store className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Keine Partner gefunden.</p>
        </div>
      )}
    </div>
  );
}
