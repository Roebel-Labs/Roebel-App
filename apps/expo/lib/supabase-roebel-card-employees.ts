// Supabase helpers for the Sachbezug / employer side of the Röbel Card.
// Reads/writes roebel_card_employees and provisions rows in roebel_card.

import { supabase } from './supabase';

export type EmployeeStatus = 'invited' | 'active' | 'deactivated';
export type TopupMode = 'manual' | 'automatic';

export interface RoebelCardEmployeeRow {
  id: string;
  employer_account_id: string;
  card_id: string;
  employee_wallet_address: string | null;
  employee_label: string;
  invite_code: string;
  monthly_topup_cents: number;
  topup_mode: TopupMode;
  status: EmployeeStatus;
  created_at: string;
  activated_at: string | null;
  deactivated_at: string | null;
}

export interface EmployeeWithBalance extends RoebelCardEmployeeRow {
  /** Joined from roebel_card.balance_cents. */
  balance_cents: number;
}

export interface AddEmployeeInput {
  employerAccountId: string;
  employeeLabel: string;
  monthlyTopupCents: number;
  topupMode: TopupMode;
}

/**
 * No ambiguous characters (0/O, 1/I/L) — easier to read out loud.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode(): string {
  const pick = () =>
    Array.from({ length: 4 }, () =>
      CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
    ).join('');
  return `ROEB-${pick()}-${pick()}`;
}

export async function fetchEmployees(
  employerAccountId: string,
): Promise<EmployeeWithBalance[]> {
  const { data, error } = await supabase
    .from('roebel_card_employees' as any)
    .select('*, roebel_card!inner(balance_cents)')
    .eq('employer_account_id', employerAccountId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchEmployees error:', error);
    return [];
  }

  return (data as any[]).map((row) => {
    const { roebel_card: card, ...rest } = row;
    return {
      ...(rest as RoebelCardEmployeeRow),
      balance_cents: card?.balance_cents ?? 0,
    };
  });
}

/**
 * Provision a new Sachbezug card and link it to an employee invite.
 *
 * 1. Insert a roebel_card row with a synthetic wallet_address of the form
 *    "pending:<inviteCode>" — the employee claim flow (later session)
 *    replaces this with the real wallet.
 * 2. Insert the roebel_card_employees row linking the card to the employer.
 *
 * Not a DB transaction (no RPC wrapper yet) — if step 2 fails, step 1 leaves
 * an orphaned card. Good enough for MVP; later sessions can wrap this in an
 * `rpc('provision_employee_card', ...)` Postgres function for atomicity.
 */
export async function addEmployee(
  input: AddEmployeeInput,
): Promise<RoebelCardEmployeeRow> {
  const inviteCode = generateInviteCode();

  const { data: card, error: cardError } = await supabase
    .from('roebel_card' as any)
    .insert({
      wallet_address: `pending:${inviteCode}`,
      owner_account_id: input.employerAccountId,
      balance_cents: 0,
      status: 'active',
      label: `Sachbezug — ${input.employeeLabel}`,
    } as any)
    .select()
    .single();

  if (cardError) throw cardError;
  const cardRow = card as { id: string };

  const { data: employee, error: employeeError } = await supabase
    .from('roebel_card_employees' as any)
    .insert({
      employer_account_id: input.employerAccountId,
      card_id: cardRow.id,
      employee_label: input.employeeLabel,
      invite_code: inviteCode,
      monthly_topup_cents: input.monthlyTopupCents,
      topup_mode: input.topupMode,
      status: 'invited' as EmployeeStatus,
    } as any)
    .select()
    .single();

  if (employeeError) throw employeeError;
  return employee as RoebelCardEmployeeRow;
}

export async function deactivateEmployee(employeeId: string): Promise<void> {
  const builder = supabase.from('roebel_card_employees' as any) as any;
  const { error } = await builder
    .update({
      status: 'deactivated',
      deactivated_at: new Date().toISOString(),
    })
    .eq('id', employeeId);

  if (error) throw error;
}

/**
 * Employee-side: redeem a ROEB-XXXX-XXXX invite code.
 *
 * Calls the SECURITY DEFINER RPC in migration 20260416:
 *   - Finds the employee row by invite_code.
 *   - Rewrites the card's wallet_address from 'pending:<code>' to the
 *     caller's real wallet.
 *   - Flips the employee row to 'active' and stamps activated_at.
 *   - Links the employee to the employer org via account_owners
 *     (role = 'member') so the org shows up in their account switcher.
 *
 * Idempotent for re-claims by the same wallet (returns the row as-is).
 */
export async function claimEmployeeInvite(
  inviteCode: string,
): Promise<RoebelCardEmployeeRow> {
  const { data, error } = await supabase.rpc(
    'claim_roebel_card_employee_invite' as any,
    { p_invite_code: inviteCode } as any,
  );
  if (error) throw error;
  return data as RoebelCardEmployeeRow;
}

/**
 * Map RPC error-code strings from the claim flow to German user-facing
 * messages.
 */
export function claimErrorMessage(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? '';
  if (msg.includes('einladung_nicht_gefunden')) return 'Einladung nicht gefunden. Bitte prüfe den Code.';
  if (msg.includes('einladung_deaktiviert')) return 'Diese Einladung wurde deaktiviert.';
  if (msg.includes('einladung_bereits_eingeloest')) return 'Diese Einladung wurde bereits eingelöst.';
  if (msg.includes('code_erforderlich')) return 'Bitte gib einen Code ein.';
  if (msg.includes('nicht_authentifiziert')) return 'Bitte zuerst anmelden.';
  return 'Die Einladung konnte nicht eingelöst werden.';
}
