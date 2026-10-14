import { supabase } from './supabase';
import { parseBalancingTx, parseHiddenTxs } from './treasury-history';

/**
 * Reads a single global key from the `app_settings` table. Returns null on
 * any error or when the key is unset.
 */
async function fetchAppSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.error(`fetch app_settings (${key}) error:`, error);
    return null;
  }
  return ((data as { value: string | null } | null)?.value ?? null) || null;
}

/**
 * Shared background audio track that loops under ALL event stories. Set by
 * admins in the web events dashboard. Falls back to null (no track).
 */
export function fetchEventStoriesAudioUrl(): Promise<string | null> {
  return fetchAppSetting('event_stories_audio_url');
}

/**
 * Remote kill switch for the XMTP DM rail. Missing key (or any fetch error)
 * counts as ENABLED so the feature works without seeding the table; setting
 * the key to 'false' flips every client back to Supabase-only sends without
 * an app update.
 */
export async function fetchXmtpDmsEnabled(): Promise<boolean> {
  const value = await fetchAppSetting('xmtp_dms_enabled');
  return value !== 'false';
}

/**
 * Pilot gate for the Netizen Workspace (Buzz) section in the Nostr settings.
 * Opposite default from the kill switches above: this is a NEW pilot surface,
 * so a missing key means OFF — only an explicit 'true' shows the export flow.
 */
export async function fetchBuzzWorkspaceEnabled(): Promise<boolean> {
  const value = await fetchAppSetting('buzz_workspace_enabled');
  return value === 'true';
}

/**
 * Kill switch for the Wochen-Radio narration in event stories. Missing key
 * counts as ENABLED; setting it to 'false' silences narration on every client
 * without an app update (the bed track keeps playing as before).
 */
export async function fetchEventRadioEnabled(): Promise<boolean> {
  const value = await fetchAppSetting('event_radio_enabled');
  return value !== 'false';
}

/**
 * Pilot gate for merchant stablecoin payments (Gnosis Pay Konto + acceptance
 * map). A NEW surface, so a missing key means OFF: only an explicit 'true' opens
 * it to everyone, and any other non-empty value is read as a comma-separated
 * wallet allowlist. Dev builds always see it.
 */
export async function isStablecoinPaymentsEnabled(opts?: {
  walletAddress?: string | null;
}): Promise<boolean> {
  if (__DEV__) return true;
  const value = await fetchAppSetting('stablecoin_payments_enabled');
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  if (!opts?.walletAddress) return false;
  return value
    .toLowerCase()
    .split(',')
    .map((entry) => entry.trim())
    .includes(opts.walletAddress.toLowerCase());
}

/** Org-side gate for Stripe Connect (Zahlungen einrichten). New surface: missing key = OFF; 'true' = all; else wallet allowlist. */
export async function isStripeConnectEnabled(opts?: { walletAddress?: string | null }): Promise<boolean> {
  if (__DEV__) return true;
  const value = await fetchAppSetting('stripe_connect_enabled');
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  if (!opts?.walletAddress) return false;
  return value.toLowerCase().split(',').map((e) => e.trim()).includes(opts.walletAddress.toLowerCase());
}
/** Citizen-side gate for buying tickets. Missing key = OFF. */
export async function isTicketSalesEnabled(): Promise<boolean> {
  if (__DEV__) return true;
  return (await fetchAppSetting('stripe_tickets_enabled')) === 'true';
}

/**
 * Kill switch for the Mecky Chat suite (profile Chat FAB). Missing key (or any fetch error) counts
 * as ENABLED; setting it to 'false' hides the entry on every client without an app update.
 */
export async function fetchChatSuiteEnabled(): Promise<boolean> {
  const value = await fetchAppSetting('chat_suite_enabled');
  return value !== 'false';
}

/**
 * Preview gate for passkey sovereign accounts (tranche 1). A NEW surface: missing key = OFF,
 * only an explicit 'true' enables it. The screen is additionally fenced to non-production
 * update channels (lib/passkey/gate.ts).
 */
export async function fetchPasskeyAccountsEnabled(): Promise<boolean> {
  return (await fetchAppSetting('passkey_accounts_enabled')) === 'true';
}

/**
 * Production rollout switch for passkey accounts. Missing key = OFF, only an explicit 'true'
 * opens the passkey surfaces on the production channel, and only together with
 * `passkey_accounts_enabled` and a binary ≥ 3.8.0 (lib/passkey/gate.ts).
 */
export async function fetchPasskeyAccountsEnabledProduction(): Promise<boolean> {
  return (await fetchAppSetting('passkey_accounts_enabled_production')) === 'true';
}

/**
 * Gate for NSP-14 org Safes. A NEW surface: missing key = OFF, only an
 * explicit 'true' enables it (lib/org-safe/gate.ts).
 */
export async function fetchOrgSafesEnabled(): Promise<boolean> {
  return (await fetchAppSetting('org_safes_enabled')) === 'true';
}

/** Production switch for org Safes, on top of `org_safes_enabled`. Missing key = OFF. */
export async function fetchOrgSafesEnabledProduction(): Promise<boolean> {
  return (await fetchAppSetting('org_safes_enabled_production')) === 'true';
}

/**
 * Tx hashes hidden from the Gemeinschaftskasse history (JSON array, lowercase).
 * Missing key, invalid JSON or any fetch error = [] (no filtering).
 */
export async function fetchTreasuryHistoryHiddenTxs(): Promise<string[]> {
  try {
    return parseHiddenTxs(await fetchAppSetting('treasury_history_hidden_txs'));
  } catch {
    return [];
  }
}

/**
 * The one tx whose history row absorbs the difference to the live treasury
 * total (see lib/treasury-history.ts). Missing key or any error = null.
 */
export async function fetchTreasuryHistoryBalancingTx(): Promise<string | null> {
  try {
    return parseBalancingTx(await fetchAppSetting('treasury_history_balancing_tx'));
  } catch {
    return null;
  }
}
