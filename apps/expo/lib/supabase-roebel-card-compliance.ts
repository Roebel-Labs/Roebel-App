// Supabase helper for employer-side §8 EStG Sachbezug compliance records.
//
// Reads the roebel_card_compliance table (one row per employer per month).
// PDFs are generated server-side by the admin dashboard or a Supabase
// edge function and referenced here via compliance_pdf_url — this app
// only displays the list and hands the URL to the browser for download.

import { supabase } from './supabase';

export interface ComplianceRow {
  id: string;
  employer_account_id: string;
  year: number;
  month: number;
  total_issued_cents: number;
  employee_count: number;
  compliance_pdf_url: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchComplianceByEmployer(
  employerAccountId: string,
): Promise<ComplianceRow[]> {
  const { data, error } = await supabase
    .from('roebel_card_compliance' as any)
    .select('*')
    .eq('employer_account_id', employerAccountId)
    .order('year', { ascending: false })
    .order('month', { ascending: false });

  if (error) {
    console.error('fetchComplianceByEmployer error:', error);
    return [];
  }
  return (data as ComplianceRow[]) ?? [];
}
