import { createClient } from "@/lib/supabase/client";

export type EmployeeStatus = "invited" | "active" | "deactivated";
export type TopupMode = "manual" | "automatic";

export interface RoebelCardEmployeeRow {
  id: string;
  employer_account_id: string;
  card_id: string | null;
  employee_wallet_address: string | null;
  employee_label: string | null;
  invite_code: string;
  monthly_topup_cents: number;
  topup_mode: TopupMode;
  status: EmployeeStatus;
  created_at: string;
  activated_at: string | null;
  deactivated_at: string | null;
}

export async function fetchEmployeesByEmployerAccount(
  accountId: string,
): Promise<RoebelCardEmployeeRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("roebel_card_employees")
    .select("*")
    .eq("employer_account_id", accountId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchEmployeesByEmployerAccount error:", error);
    return [];
  }
  return (data ?? []) as RoebelCardEmployeeRow[];
}
