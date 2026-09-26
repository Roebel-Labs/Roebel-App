// Pack 'web' (risk 'read'): fetch_url — read one public web page as text.
// web_search stays the Anthropic server tool (runtime.ts).
//
// SSRF guard: https only, port 443, no credentials, and every connection
// (initial + each redirect hop) resolves DNS through a custom lookup that
// rejects private / loopback / link-local / reserved addresses — so the IP
// that is checked is the IP that is connected to (no DNS-rebinding gap).
// 1 MB body cap (after decompression), 10 s overall timeout, ≤ 5 redirects.
// HTML → readable text mirrors the Mecky comment-reply page fetch
// (apps/expo/supabase/functions/mecky-comment-reply), plus <article>/<main>
// preference.
import { lookup as dnsLookup } from "node:dns";
import type { LookupAddress } from "node:dns";
import https from "node:https";
import { isIP } from "node:net";
import zlib from "node:zlib";
import { z } from "zod";
import type { HarnessTool, ToolRegistry } from "../types";

export const FETCH_MAX_BYTES = 1_000_000;
export const FETCH_TIMEOUT_MS = 10_000;
export const FETCH_MAX_TEXT = 20_000;
const MAX_REDIRECTS = 5;

// ---- address guard ------------------------------------------------------------------

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4Blocked(ip: string): boolean {
  const n = v4ToInt(ip);
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (v4ToInt(base) & mask);
  });
}

/** Expand an IPv6 string to 8 16-bit groups (handles :: and embedded IPv4). */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = v4ToInt(v4[1]);
    s = s.slice(0, -v4[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  const fill = s.includes("::") ? 8 - h.length - t.length : 0;
  const groups = [...h, ...Array(Math.max(0, fill)).fill("0"), ...t].map((g) => parseInt(g || "0", 16));
  return groups.length === 8 && groups.every((g) => Number.isFinite(g)) ? groups : null;
}

/** True for any address a server-side fetch must never reach. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip.split("%")[0]);
  if (kind === 4) return v4Blocked(ip);
  if (kind !== 6) return true; // not an IP → refuse
  const g = v6Groups(ip);
  if (!g) return true;
  const embeddedV4 = () => `${g[6] >>> 8}.${g[6] & 0xff}.${g[7] >>> 8}.${g[7] & 0xff}`;
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return v4Blocked(embeddedV4()); // ::ffff:a.b.c.d
  if (g.slice(0, 6).every((x) => x === 0)) return true; // ::a.b.c.d (deprecated compat)
  if (g[0] === 0x64 && g[1] === 0xff9b) return v4Blocked(embeddedV4()); // NAT64
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard
  if (g[0] === 0x2002) return v4Blocked(`${g[1] >>> 8}.${g[1] & 0xff}.${g[2] >>> 8}.${g[2] & 0xff}`); // 6to4
  return false;
}

export class FetchUrlError extends Error {}

/** Syntactic checks before any network I/O. Returns the normalized URL. */
export function assertFetchableUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new FetchUrlError("Ungültige Adresse.");
  }
  if (u.protocol !== "https:") throw new FetchUrlError("Nur https-Adressen sind erlaubt.");
  if (u.username || u.password) throw new FetchUrlError("Adressen mit Zugangsdaten sind nicht erlaubt.");
  if (u.port && u.port !== "443") throw new FetchUrlError("Nur der Standard-Port 443 ist erlaubt.");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) throw new FetchUrlError("Ungültige Adresse.");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new FetchUrlError("Interne Adressen sind nicht erlaubt.");
  }
  if (isIP(host) && isPrivateAddress(host)) throw new FetchUrlError("Interne Adressen sind nicht erlaubt.");
  if (!isIP(host) && !host.includes(".")) throw new FetchUrlError("Interne Adressen sind nicht erlaubt.");
  return u;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** dns.lookup replacement that refuses private results (used by the https agent). */
export function guardedLookup(
  resolve: typeof dnsLookup = dnsLookup,
): (hostname: string, options: { all?: boolean } | number, cb: LookupCb) => void {
  return (hostname, options, cb) => {
    resolve(hostname, { all: true }, (err, addresses) => {
      if (err) return cb(err, "", 0);
      const list = addresses as LookupAddress[];
      if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
        const e = new FetchUrlError("Interne Adressen sind nicht erlaubt.") as NodeJS.ErrnoException;
        e.code = "EBLOCKED";
        return cb(e, "", 0);
      }
      const wantAll = typeof options === "object" && options?.all;
      if (wantAll) return cb(null, list);
      cb(null, list[0].address, list[0].family);
    });
  };
}

// ---- HTML → text -------------------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => safeCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeCodePoint(parseInt(n, 16)));
}

function safeCodePoint(n: number): string {
  try {
    return String.fromCodePoint(n);
  } catch {
    return " ";
  }
}

function metaContent(html: string, key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
    "i",
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1] ?? m[2] ?? "").trim() || null : null;
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|iframe|form)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/blockquote)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Readable text of an HTML page: title, description, main content (article/main preferred). */
export function htmlToReadable(html: string, maxText = FETCH_MAX_TEXT) {
  const title =
    metaContent(html, "og:title") ?? decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim() ?? null;
  const description = metaContent(html, "og:description") ?? metaContent(html, "description");
  const pick = (tag: string) => {
    const m = html.match(new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, "gi"));
    return m ? m.sort((a, b) => b.length - a.length)[0] : null;
  };
  const body = html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html;
  let text = "";
  for (const candidate of [pick("article"), pick("main")]) {
    if (!candidate) continue;
    const t = htmlToText(candidate);
    if (t.length >= 400) {
      text = t;
      break;
    }
  }
  if (!text) text = htmlToText(body);
  const truncated = text.length > maxText;
  if (truncated) text = `${text.slice(0, maxText)} […gekürzt]`;
  return { title: title || null, description: description || null, text, truncated };
}

// ---- fetch -------------------------------------------------------------------------

export interface FetchedPage {
  url: string;
  status: number;
  contentType: string;
  body: string;
  bytesCapped: boolean;
}

function charsetOf(contentType: string): string {
  const m = contentType.match(/charset=["']?([\w-]+)/i);
  const cs = (m?.[1] ?? "utf-8").toLowerCase();
  try {
    new TextDecoder(cs);
    return cs;
  } catch {
    return "utf-8";
  }
}

function requestOnce(u: URL, lookup: ReturnType<typeof guardedLookup>, signal: AbortSignal): Promise<{
  status: number;
  location: string | null;
  contentType: string;
  body: Buffer;
  capped: boolean;
}> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      u,
      {
        method: "GET",
        lookup: lookup as never,
        signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MeckyBot/1.0; +https://roebel.app) AppleWebKit/537.36 (KHTML, like Gecko)",
          "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,application/json;q=0.8,*/*;q=0.3",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        const contentType = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400 && location) {
          res.resume();
          return resolve({ status, location, contentType, body: Buffer.alloc(0), capped: false });
        }
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
        const chunks: Buffer[] = [];
        let size = 0;
        let capped = false;
        const finish = () => resolve({ status, location: null, contentType, body: Buffer.concat(chunks), capped });
        stream.on("data", (c: Buffer) => {
          if (capped) return;
          const room = FETCH_MAX_BYTES - size;
          if (c.length >= room) {
            chunks.push(c.subarray(0, room));
            size = FETCH_MAX_BYTES;
            capped = true;
            res.destroy();
            finish();
            return;
          }
          chunks.push(c);
          size += c.length;
        });
        stream.on("end", () => !capped && finish());
        stream.on("error", (e) => (capped ? undefined : reject(e)));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/** Guarded GET following ≤ 5 redirects, each hop re-validated. */
export async function guardedFetch(raw: string, opts: { resolve?: typeof dnsLookup } = {}): Promise<FetchedPage> {
  const lookup = guardedLookup(opts.resolve);
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let u = assertFetchableUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let r;
    try {
      r = await requestOnce(u, lookup, signal);
    } catch (e) {
      if (e instanceof FetchUrlError) throw e;
      if ((e as NodeJS.ErrnoException)?.code === "EBLOCKED") throw new FetchUrlError("Interne Adressen sind nicht erlaubt.");
      if ((e as Error)?.name === "AbortError" || (e as Error)?.name === "TimeoutError") {
        throw new FetchUrlError("Zeitüberschreitung beim Abrufen der Seite (10 s).");
      }
      throw new FetchUrlError(`Seite nicht abrufbar: ${(e as Error)?.message ?? String(e)}`);
    }
    if (r.location) {
      u = assertFetchableUrl(new URL(r.location, u).toString());
      continue;
    }
    return {
      url: u.toString(),
      status: r.status,
      contentType: r.contentType,
      body: new TextDecoder(charsetOf(r.contentType)).decode(r.body),
      bytesCapped: r.capped,
    };
  }
  throw new FetchUrlError("Zu viele Weiterleitungen.");
}

// ---- tool -------------------------------------------------------------------------

const input = z.object({
  url: z.string().min(8).max(2000).describe("Vollständige https-Adresse der Seite"),
});

export const fetchUrl: HarnessTool<z.infer<typeof input>> = {
  name: "fetch_url",
  pack: "web",
  risk: "read",
  description:
    "Liest eine öffentliche Webseite (nur https) und gibt Titel, Beschreibung und den lesbaren Text zurück (max. 20.000 Zeichen). Für Links, die der Mensch teilt, oder Quellen aus der Websuche.",
  inputSchema: input,
  summarize: ({ url }) => {
    try {
      return `Webseite lesen: ${new URL(url).hostname}`;
    } catch {
      return "Webseite lesen";
    }
  },
  execute: async ({ url }) => {
    try {
      const page = await guardedFetch(url);
      if (page.status >= 400) return { error: `Seite nicht abrufbar (HTTP ${page.status}).`, url: page.url };
      const type = page.contentType.toLowerCase();
      if (/text\/html|xhtml/.test(type) || (!type && /<html/i.test(page.body.slice(0, 2000)))) {
        const r = htmlToReadable(page.body);
        return {
          url: page.url,
          titel: r.title,
          beschreibung: r.description,
          text: r.text,
          gekuerzt: r.truncated || page.bytesCapped || undefined,
        };
      }
      if (/text\/|json|xml/.test(type)) {
        const truncated = page.body.length > FETCH_MAX_TEXT;
        return {
          url: page.url,
          inhaltstyp: type.split(";")[0],
          text: truncated ? `${page.body.slice(0, FETCH_MAX_TEXT)} […gekürzt]` : page.body,
          gekuerzt: truncated || page.bytesCapped || undefined,
        };
      }
      return { error: `Kein Textinhalt (${type.split(";")[0] || "unbekannt"}).`, url: page.url };
    } catch (e) {
      return { error: e instanceof FetchUrlError ? e.message : "Seite nicht abrufbar." };
    }
  },
};

export const TOOLS: HarnessTool[] = [fetchUrl];

export function register(registry: ToolRegistry): void {
  for (const t of TOOLS) registry.registerTool(t);
}
