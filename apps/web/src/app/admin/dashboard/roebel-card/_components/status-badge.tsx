import { Badge } from "@/components/ui/badge";
import type { RoebelCardPurchaseStatus } from "@/types/roebel-card-voucher";

// Shared status badge for Röbel Card purchases — imported by the
// overview page and the purchases table so the German copy stays in
// one place.

export const STATUS_LABELS: Record<
  RoebelCardPurchaseStatus | "all",
  string
> = {
  all: "Alle",
  pending: "Ausstehend",
  paid: "Bezahlt",
  failed: "Fehlgeschlagen",
  refunded: "Erstattet",
};

export function StatusBadge({
  status,
}: {
  status: RoebelCardPurchaseStatus;
}) {
  const variant =
    status === "paid"
      ? "default"
      : status === "pending"
        ? "secondary"
        : "destructive";
  return (
    <Badge variant={variant as "default" | "secondary" | "destructive"}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
