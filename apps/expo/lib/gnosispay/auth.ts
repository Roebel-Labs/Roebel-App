/**
 * Sign-In with Ethereum against Gnosis Pay, plus JWT storage.
 *
 * The signer is the citizen's thirdweb Gnosis smart account. Gnosis Pay verifies
 * it through ERC-1271, which requires the account to be DEPLOYED on Gnosis -- a
 * counterfactual account cannot sign in, and the call comes back UNAUTHORIZED.
 *
 * The JWT lives in expo-secure-store keyed by address. It is a bearer credential
 * for one user and is never logged.
 */
import * as SecureStore from 'expo-secure-store';

import { gpFetch } from './client';
import type { GpResult } from './types';

/** Registered in the Gnosis Pay partner dashboard. Must match exactly. */
export const GP_SIWE_DOMAIN = 'app.roebel.app';
const GP_SIWE_URI = 'https://app.roebel.app';

/** 24 h is the vendor maximum; we ask for it and re-sign on 401. */
const TOKEN_TTL_SECONDS = 24 * 60 * 60;

/** Refresh slack: a token this close to expiry is treated as already gone. */
const EXPIRY_SLACK_MS = 60_000;

export interface SigningAccount {
  address: string;
  signMessage: (args: { message: string }) => Promise<string>;
}

export function buildSiweMessage(params: {
  domain: string;
  address: string;
  nonce: string;
  issuedAt: string;
  uri: string;
  chainId?: number;
}): string {
  const chainId = params.chainId ?? 100;
  return [
    `${params.domain} wants you to sign in with your Ethereum account:`,
    params.address,
    '',
    'Sign in to Gnosis Pay',
    '',
    `URI: ${params.uri}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${params.issuedAt}`,
  ].join('\n');
}

function tokenKey(address: string): string {
  return `gp_jwt_${address.toLowerCase()}`;
}

export async function storeToken(
  address: string,
  token: string,
  expiresAtMs: number,
): Promise<void> {
  await SecureStore.setItemAsync(tokenKey(address), JSON.stringify({ token, expiresAtMs }));
}

export async function getStoredToken(address: string): Promise<string | null> {
  const raw = await SecureStore.getItemAsync(tokenKey(address));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { token?: string; expiresAtMs?: number };
    if (!parsed.token || typeof parsed.expiresAtMs !== 'number') return null;
    if (Date.now() > parsed.expiresAtMs - EXPIRY_SLACK_MS) return null;
    return parsed.token;
  } catch {
    return null;
  }
}

export async function clearToken(address: string): Promise<void> {
  await SecureStore.deleteItemAsync(tokenKey(address));
}

/**
 * Full SIWE round trip: nonce, sign, challenge. Stores and returns the JWT.
 * Callers holding a valid token should call getStoredToken first.
 */
export async function signIn(account: SigningAccount): Promise<GpResult<string>> {
  const nonceResult = await gpFetch<{ nonce: string } | string>('/api/v1/auth/nonce');
  if (!nonceResult.ok) return nonceResult;

  const nonce =
    typeof nonceResult.data === 'string' ? nonceResult.data : nonceResult.data.nonce;

  const message = buildSiweMessage({
    domain: GP_SIWE_DOMAIN,
    address: account.address,
    nonce,
    issuedAt: new Date().toISOString(),
    uri: GP_SIWE_URI,
  });

  const signature = await account.signMessage({ message });

  const challenge = await gpFetch<{ token: string }>('/api/v1/auth/challenge', {
    method: 'POST',
    body: { message, signature, ttlInSeconds: TOKEN_TTL_SECONDS },
  });
  if (!challenge.ok) return challenge;

  await storeToken(account.address, challenge.data.token, Date.now() + TOKEN_TTL_SECONDS * 1000);
  return { ok: true, data: challenge.data.token };
}
