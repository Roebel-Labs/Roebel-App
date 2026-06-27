export const DAO_BRAND = "#00498B";

export const DAO_CHART_COLORS = {
  primary: DAO_BRAND,
  primarySoft: "#3a6cb8",
  success: "#16a34a",
  warning: "#f59e0b",
  destructive: "#dc2626",
  muted: "#94a3b8",
  attester: "#f59e0b",
  citizen: "#00498B",
} as const;

export const PROPOSAL_STATE_COLORS: Record<number, string> = {
  0: "#f59e0b",
  1: "#16a34a",
  2: "#94a3b8",
  3: "#dc2626",
  4: "#00498B",
  5: "#6366f1",
  6: "#64748b",
  7: "#8b5cf6",
};

export const REQUEST_STATUS_COLORS: Record<number, string> = {
  0: "#f59e0b",
  1: "#3a6cb8",
  2: "#dc2626",
  3: "#16a34a",
};

export const REQUEST_STATUS_LABELS: Record<number, string> = {
  0: "Wartend",
  1: "Genehmigt",
  2: "Abgelehnt",
  3: "Ausgeführt",
};
