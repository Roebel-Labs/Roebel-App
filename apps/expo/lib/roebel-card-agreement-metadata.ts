// Audit-trail metadata builder for Röbel Card partner agreement acceptance.
//
// Stored as JSONB in roebel_card_partners.agreement_metadata to harden the
// Textform (BGB §126b) record of when and how a partner clicked "accept".
// Not legally required to reach Textform threshold, but recommended for
// dispute resolution.
//
// Captures: public IP (best effort via ipify), platform, OS version, app
// version, locale, timestamp, acceptance flags, agreement version string.

import { Platform } from 'react-native';
import * as Application from 'expo-application';

export const AGREEMENT_VERSION = 'v1-2026-04-11';

export interface AgreementMetadata {
  ip: string | null;
  platform: string;
  os_version: string;
  app_version: string | null;
  native_build_version: string | null;
  locale: string;
  accepted_at: string; // ISO timestamp
  agb_accepted: boolean;
  authority_accepted: boolean;
  agreement_version: string;
}

interface BuildInput {
  agbAccepted: boolean;
  authorityAccepted: boolean;
}

/**
 * Best-effort public IP lookup via api.ipify.org with a 3s timeout.
 * Returns null on any failure — never throws.
 */
async function fetchPublicIp(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = (await res.json()) as { ip?: string };
    return json.ip ?? null;
  } catch {
    return null;
  }
}

/**
 * Assemble the audit metadata at the moment the user taps "Antrag absenden".
 * Call this inside the submit handler — after the user has ticked both
 * checkboxes — and persist the returned object on roebel_card_partners.
 */
export async function buildAgreementMetadata(
  input: BuildInput,
): Promise<AgreementMetadata> {
  const ip = await fetchPublicIp();

  return {
    ip,
    platform: Platform.OS,
    os_version: String(Platform.Version),
    app_version: Application.nativeApplicationVersion,
    native_build_version: Application.nativeBuildVersion,
    // Hardcoded: the app is German-first and expo-localization isn't installed.
    // TODO(i18n): read from expo-localization once the app supports multiple
    // locales.
    locale: 'de',
    accepted_at: new Date().toISOString(),
    agb_accepted: input.agbAccepted,
    authority_accepted: input.authorityAccepted,
    agreement_version: AGREEMENT_VERSION,
  };
}
