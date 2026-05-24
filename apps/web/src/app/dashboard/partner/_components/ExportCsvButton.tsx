"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  RoebelCardChargeRow,
  RoebelCardChargeStatus,
} from "@/lib/supabase-roebel-card-partners";

const STATUS_LABELS: Record<RoebelCardChargeStatus, string> = {
  pending: "Ausstehend",
  approved: "Bestätigt",
  declined: "Abgelehnt",
  expired: "Abgelaufen",
  reversed: "Storniert",
};

interface Props {
  charges: RoebelCardChargeRow[];
  filename?: string;
}

/**
 * Client-side CSV download. Uses semicolon as separator (Excel-de friendly)
 * and prepends a UTF-8 BOM so the umlauts in status labels survive being
 * opened in Excel.
 */
export function ExportCsvButton({ charges, filename }: Props) {
  const handleClick = () => {
    const today = new Date().toISOString().slice(0, 10);
    const name = filename ?? `roebel-card-transaktionen-${today}.csv`;
    const csv = toCsv(charges);
    const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={charges.length === 0}
    >
      <Download className="h-4 w-4 mr-2" />
      CSV exportieren
    </Button>
  );
}

function toCsv(rows: RoebelCardChargeRow[]): string {
  const headers = [
    "ID",
    "Datum",
    "Betrag (EUR)",
    "Status",
    "Notiz",
    "Karten-ID",
    "Bestätigt am",
    "Abgelehnt am",
  ];
  const lines = [headers.join(";")];
  for (const c of rows) {
    lines.push(
      [
        c.id,
        toIso(c.created_at),
        (c.amount_cents / 100).toFixed(2).replace(".", ","),
        STATUS_LABELS[c.status],
        c.partner_note ?? "",
        c.card_id,
        toIso(c.approved_at),
        toIso(c.declined_at),
      ]
        .map(csvCell)
        .join(";"),
    );
  }
  return lines.join("\r\n");
}

function csvCell(value: string | null): string {
  const v = value ?? "";
  if (v.includes(";") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function toIso(value: string | null): string {
  if (!value) return "";
  try {
    return new Date(value).toISOString();
  } catch {
    return value;
  }
}
