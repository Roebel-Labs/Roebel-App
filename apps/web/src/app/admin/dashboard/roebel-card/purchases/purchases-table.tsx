"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import type {
  PurchaseWithRelations,
  RoebelCardPurchaseStatus,
} from "@/types/roebel-card-voucher";
import { formatEuros } from "@/lib/format-euros";

interface VereineOption {
  id: string;
  name: string;
}

interface Props {
  purchases: PurchaseWithRelations[];
  totalCount: number;
  page: number;
  pageSize: number;
  vereineOptions: VereineOption[];
  initialFilters: {
    status: RoebelCardPurchaseStatus | "all";
    beneficiaryAccountId: string;
    walletSearch: string;
    from: string;
    to: string;
  };
}

const STATUS_LABELS: Record<RoebelCardPurchaseStatus | "all", string> = {
  all: "Alle",
  pending: "Ausstehend",
  paid: "Bezahlt",
  failed: "Fehlgeschlagen",
  refunded: "Erstattet",
};

export function PurchasesTable({
  purchases,
  totalCount,
  page,
  pageSize,
  vereineOptions,
  initialFilters,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState(initialFilters);
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const pushFilters = (overrides: Partial<typeof filters> = {}, nextPage = 1) => {
    const next = { ...filters, ...overrides };
    const qs = new URLSearchParams();
    if (next.status && next.status !== "all") qs.set("status", next.status);
    if (next.beneficiaryAccountId && next.beneficiaryAccountId !== "all") {
      qs.set("beneficiary", next.beneficiaryAccountId);
    }
    if (next.walletSearch) qs.set("wallet", next.walletSearch);
    if (next.from) qs.set("from", next.from);
    if (next.to) qs.set("to", next.to);
    if (nextPage > 1) qs.set("page", String(nextPage));
    const query = qs.toString();
    startTransition(() => {
      router.push(
        `/admin/dashboard/roebel-card/purchases${query ? `?${query}` : ""}`,
      );
    });
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Wallet-Adresse suchen…"
            value={filters.walletSearch}
            onChange={(e) =>
              setFilters((f) => ({ ...f, walletSearch: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") pushFilters();
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={filters.status}
          onValueChange={(value) => {
            const status = value as RoebelCardPurchaseStatus | "all";
            setFilters((f) => ({ ...f, status }));
            pushFilters({ status });
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map(
              (key) => (
                <SelectItem key={key} value={key}>
                  {STATUS_LABELS[key]}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <Select
          value={filters.beneficiaryAccountId}
          onValueChange={(value) => {
            setFilters((f) => ({ ...f, beneficiaryAccountId: value }));
            pushFilters({ beneficiaryAccountId: value });
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Begünstigter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Begünstigten</SelectItem>
            <SelectItem value="topf">Röbeler Topf</SelectItem>
            {vereineOptions.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => pushFilters()}
          disabled={isPending}
        >
          Anwenden
        </Button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground">
              <th className="text-left font-medium px-4 py-2">Datum</th>
              <th className="text-left font-medium px-4 py-2">Wallet</th>
              <th className="text-right font-medium px-4 py-2">Betrag</th>
              <th className="text-right font-medium px-4 py-2">Gebühr</th>
              <th className="text-right font-medium px-4 py-2">Gesamt</th>
              <th className="text-left font-medium px-4 py-2">Begünstigter</th>
              <th className="text-left font-medium px-4 py-2">Status</th>
              <th className="text-left font-medium px-4 py-2">Stripe</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  Keine Transaktionen gefunden
                </td>
              </tr>
            ) : (
              purchases.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                    {formatDate(p.paid_at ?? p.created_at)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {truncateWallet(p.purchaser_wallet_address)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {formatEuros(p.amount_cents)}
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground">
                    {formatEuros(p.fee_cents)}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">
                    {formatEuros(p.amount_cents + p.fee_cents)}
                  </td>
                  <td className="px-4 py-2">
                    {p.beneficiary_name ?? (
                      <Badge variant="secondary">Röbeler Topf</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-2">
                    {p.stripe_session_id ? (
                      <a
                        href={`https://dashboard.stripe.com/payments/${
                          p.stripe_payment_intent_id ?? ""
                        }`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline text-muted-foreground hover:text-foreground"
                      >
                        {p.stripe_session_id.slice(-8)}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          Seite {page} von {totalPages} · {totalCount} Transaktionen
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1 || isPending}
            onClick={() => pushFilters({}, page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            Zurück
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages || isPending}
            onClick={() => pushFilters({}, page + 1)}
          >
            Weiter
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: RoebelCardPurchaseStatus }) {
  const variant =
    status === "paid"
      ? "default"
      : status === "pending"
        ? "secondary"
        : "destructive";
  return <Badge variant={variant as any}>{STATUS_LABELS[status]}</Badge>;
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
