// apps/web/src/lib/miniapp/safeFetch.ts
// SSRF-safe fetch for builder-supplied manifest URLs (spec 2026-10-10 §4).
// Pure: DNS lookup and fetch are injectable for tests. Defaults use node:dns
// and global fetch. Known gap: DNS rebinding between our lookup and fetch's
// own resolution is not closed; acceptable for a 64 KB JSON read with no
// credentials attached.
import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import { WELL_KNOWN_PATH } from "./manifestFile";
import { MiniAppError } from "./types";

export type LookupFn = (host: string) => Promise<string[]>;
export type FetchFn = (
  url: string,
  init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> },
) => Promise<Response>;

const MAX_BYTES = 64 * 1024;
const MAX_REDIRECTS = 3;

function fail(message: string): never {
  throw new MiniAppError("invalid_params", message);
}

function v4Blocked(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return v4Blocked(ip);
  if (kind === 6) {
    const s = ip.toLowerCase();
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return v4Blocked(mapped[1]);
    return s === "::" || s === "::1" || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith("ff");
  }
  return true;
}

export function wellKnownUrlFor(input: string): { origin: string; url: string } {
  const raw = input.trim();
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    fail("Ungültige URL.");
  }
  if (u.protocol !== "https:") fail("Nur https-URLs werden unterstützt.");
  if (u.port) fail("Eigene Ports werden nicht unterstützt — bitte Standard-https (443) nutzen.");
  if (u.username || u.password) fail("URL darf keine Zugangsdaten enthalten.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) fail("Bitte eine Domain statt einer IP-Adresse angeben.");
  return { origin: u.origin, url: `${u.origin}${WELL_KNOWN_PATH}` };
}

const defaultLookup: LookupFn = async (host) =>
  (await dnsLookup(host, { all: true })).map((r) => r.address);

export async function fetchManifestJson(
  url: string,
  deps: { lookup?: LookupFn; fetch?: FetchFn; timeoutMs?: number } = {},
): Promise<unknown> {
  const lookup = deps.lookup ?? defaultLookup;
  const doFetch: FetchFn = deps.fetch ?? ((u, init) => fetch(u, init));
  const origin = new URL(url).origin;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 5000);

  try {
    let current = url;
    for (let hop = 0; ; hop++) {
      const host = new URL(current).hostname;
      let addrs: string[];
      try {
        addrs = await lookup(host);
      } catch {
        fail(`Domain ${host} wurde nicht gefunden.`);
      }
      if (addrs.length === 0 || addrs.some(isBlockedIp)) {
        fail(`${host} ist nicht öffentlich erreichbar.`);
      }

      let res: Response;
      try {
        res = await doFetch(current, {
          redirect: "manual",
          signal: controller.signal,
          headers: { accept: "application/json", "user-agent": "RoebelMiniAppIndexer/1.0" },
        });
      } catch {
        fail(`Manifest unter ${current} nicht erreichbar (Zeitüberschreitung oder Netzwerkfehler).`);
      }

      if (res.status >= 300 && res.status < 400) {
        if (hop >= MAX_REDIRECTS) fail("Zu viele Weiterleitungen beim Abruf des Manifests.");
        const next = new URL(res.headers.get("location") ?? "", current);
        if (next.origin !== origin) {
          fail(`Das Manifest leitet auf ${next.origin} weiter. Registriere bitte direkt ${next.origin}.`);
        }
        current = next.toString();
        continue;
      }
      if (!res.ok) fail(`Manifest nicht gefunden (${res.status}) unter ${current}.`);

      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("json")) fail(`Manifest muss JSON sein (content-type war "${type || "leer"}").`);

      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) fail("Manifest ist größer als 64 KB.");
      try {
        return JSON.parse(new TextDecoder().decode(buf));
      } catch {
        fail("Manifest ist kein gültiges JSON.");
      }
    }
  } finally {
    clearTimeout(timer);
  }
}
