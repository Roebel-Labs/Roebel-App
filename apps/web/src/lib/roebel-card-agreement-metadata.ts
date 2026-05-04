// Audit-trail metadata builder for Röbel Card partner agreement acceptance.
//
// JSONB shape mirrors apps/expo/lib/roebel-card-agreement-metadata.ts so the
// admin dashboard can read web and mobile submissions uniformly. Source values
// are taken from the browser instead of expo APIs.

export const AGREEMENT_VERSION = "v1-2026-04-11";

export interface AgreementMetadata {
  ip: string | null;
  platform: string;
  os_version: string;
  app_version: string | null;
  native_build_version: string | null;
  locale: string;
  accepted_at: string;
  agb_accepted: boolean;
  authority_accepted: boolean;
  agreement_version: string;
}

interface BuildInput {
  agbAccepted: boolean;
  authorityAccepted: boolean;
}

async function fetchPublicIp(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("https://api.ipify.org?format=json", {
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

interface UserAgentInfo {
  os: string;
  osVersion: string;
}

function parseUserAgent(ua: string): UserAgentInfo {
  if (/Windows NT ([\d.]+)/.test(ua)) {
    return { os: "Windows", osVersion: RegExp.$1 };
  }
  if (/Mac OS X ([\d_.]+)/.test(ua)) {
    return { os: "macOS", osVersion: RegExp.$1.replace(/_/g, ".") };
  }
  if (/Android ([\d.]+)/.test(ua)) {
    return { os: "Android", osVersion: RegExp.$1 };
  }
  if (/iPhone OS ([\d_]+)/.test(ua) || /iPad; CPU OS ([\d_]+)/.test(ua)) {
    return { os: "iOS", osVersion: RegExp.$1.replace(/_/g, ".") };
  }
  if (/Linux/.test(ua)) {
    return { os: "Linux", osVersion: "" };
  }
  return { os: "unknown", osVersion: "" };
}

export async function buildAgreementMetadata(
  input: BuildInput,
): Promise<AgreementMetadata> {
  const ip = await fetchPublicIp();
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const { os, osVersion } = parseUserAgent(ua);
  const rawLocale =
    typeof navigator !== "undefined" ? navigator.language : "de-DE";
  const locale = (rawLocale.split("-")[0] || "de").toLowerCase();

  return {
    ip,
    platform: "web",
    os_version: osVersion ? `${os} ${osVersion}` : os,
    app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? "web",
    native_build_version: null,
    locale,
    accepted_at: new Date().toISOString(),
    agb_accepted: input.agbAccepted,
    authority_accepted: input.authorityAccepted,
    agreement_version: AGREEMENT_VERSION,
  };
}
