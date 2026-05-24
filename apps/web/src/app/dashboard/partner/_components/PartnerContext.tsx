"use client";

import { createContext, useContext } from "react";
import type { RoebelCardPartnerRow } from "@/lib/supabase-roebel-card-partners";

const PartnerContext = createContext<RoebelCardPartnerRow | null>(null);

export function PartnerProvider({
  partner,
  children,
}: {
  partner: RoebelCardPartnerRow;
  children: React.ReactNode;
}) {
  return (
    <PartnerContext.Provider value={partner}>{children}</PartnerContext.Provider>
  );
}

export function usePartner(): RoebelCardPartnerRow {
  const value = useContext(PartnerContext);
  if (!value) {
    throw new Error(
      "usePartner must be used within a PartnerProvider — render this only inside the /dashboard/partner layout once the partner row is loaded.",
    );
  }
  return value;
}
