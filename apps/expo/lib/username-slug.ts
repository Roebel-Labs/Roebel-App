import { supabase } from './supabase';

const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugifyDisplayName(input: string): string {
  const base = input
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
  return base || 'user';
}

export async function ensureUniqueUsernameSlug(
  baseSlug: string,
  selfWalletAddress?: string,
): Promise<string> {
  const normalizedSelf = selfWalletAddress?.toLowerCase();
  let candidate = baseSlug;
  for (let suffix = 2; suffix < 1000; suffix++) {
    const { data, error } = await supabase
      .from('users')
      .select('wallet_address')
      .eq('username', candidate)
      .limit(1);
    if (error) throw error;
    const taken = (data ?? []).some(
      (row: { wallet_address: string }) =>
        row.wallet_address.toLowerCase() !== normalizedSelf,
    );
    if (!taken) return candidate;
    const suffixStr = `_${suffix}`;
    candidate = `${baseSlug.slice(0, 30 - suffixStr.length)}${suffixStr}`;
  }
  return `${baseSlug.slice(0, 24)}_${Date.now().toString(36).slice(-5)}`;
}
