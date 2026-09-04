/**
 * The only place that knows the Gnosis Pay base URL and how one of its
 * responses becomes a GpResult. Callers pass a path; nothing above this file
 * builds a URL or reads `response.status`.
 *
 * Partner identifiers come from EXPO_PUBLIC_GNOSISPAY_* (see .env.example).
 * They are identifiers, not secrets -- the per-user SIWE JWT is the credential.
 */
import Constants from 'expo-constants';

import type { GpErrorCode, GpResult } from './types';

type Extra = {
  GNOSISPAY_API_URL?: string;
  GNOSISPAY_PARTNER_ID?: string;
  GNOSISPAY_APP_ID?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export const GP_API_URL =
  extra.GNOSISPAY_API_URL ??
  process.env.EXPO_PUBLIC_GNOSISPAY_API_URL ??
  'https://api.gnosispay.com';

export const GP_PARTNER_ID =
  extra.GNOSISPAY_PARTNER_ID ?? process.env.EXPO_PUBLIC_GNOSISPAY_PARTNER_ID ?? '';

export const GP_APP_ID =
  extra.GNOSISPAY_APP_ID ?? process.env.EXPO_PUBLIC_GNOSISPAY_APP_ID ?? '';

function codeForStatus(status: number): GpErrorCode {
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status === 409) return 'ALREADY_DONE';
  if (status === 422) return 'KYC_REQUIRED';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER_ERROR';
  return 'BAD_REQUEST';
}

/** Content type, tolerating fetch stubs and responses without headers. */
function readContentType(response: Response): string {
  try {
    return response.headers?.get?.('content-type')?.toLowerCase() ?? '';
  } catch {
    return '';
  }
}

export async function gpFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown; token?: string | null },
): Promise<GpResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init?.token) headers.Authorization = `Bearer ${init.token}`;
  if (init?.body !== undefined) headers['Content-Type'] = 'application/json';

  try {
    const response = await fetch(`${GP_API_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });

    // Not every endpoint answers JSON: GET /api/v1/auth/nonce returns the nonce
    // as bare `text/plain`. Calling response.json() on that throws, which would
    // silently become an empty object and produce a SIWE message reading
    // "Nonce: undefined" -- rejected by the server as a 401.
    const contentType = readContentType(response);
    let payload: unknown = null;
    try {
      if (contentType && !contentType.includes('json')) {
        const text = await response.text();
        payload = text.length > 0 ? text : null;
      } else {
        payload = await response.json();
      }
    } catch {
      payload = null;
    }

    if (response.status >= 200 && response.status < 300) {
      return { ok: true, data: (payload ?? {}) as T };
    }

    const message =
      typeof payload === 'string' && payload.trim().length > 0
        ? payload.trim()
        : ((payload as { message?: string } | null)?.message ?? `HTTP ${response.status}`);
    return { ok: false, code: codeForStatus(response.status), message };
  } catch (error) {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Netzwerkfehler',
    };
  }
}
