/**
 * POST /api/mini-apps/import/inspect — prefill helper for the URL import flow
 * (e.g. an app built in Lovable/v0 or hosted on Vercel).
 *
 * Fetches the page server-side, extracts <title> / meta description / icon /
 * theme color, and checks the embed headers: the Röbel host loads mini apps in
 * a WebView/iframe, so X-Frame-Options: DENY/SAMEORIGIN or a restrictive CSP
 * frame-ancestors would break it — surfaced as a warning, not a blocker.
 *
 * Body: { url: string }  →  { title, description, iconUrl, themeColor,
 *                             embeddable, sdkDetected, warnings[] }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/miniapp/http";

export const runtime = "nodejs";

const bodySchema = z.object({ url: z.string().url().max(2000) });

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 600_000;

export async function POST(request: Request) {
  try {
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: "Ungültige URL." }, { status: 400 });
    }
    const url = new URL(body.data.url);
    if (url.protocol !== "https:") {
      return NextResponse.json(
        { error: "Nur https-URLs können eingereicht werden." },
        { status: 400 },
      );
    }
    // Basic SSRF guard: no raw IPs / localhost-ish hosts.
    if (/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|\[)/.test(url.hostname) ||
        /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) {
      return NextResponse.json({ error: "Interne Adressen sind nicht erlaubt." }, { status: 400 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": "RoebelMiniAppImport/1.0 (+https://www.roebel.app)" },
      });
    } finally {
      clearTimeout(timer);
    }

    const warnings: string[] = [];
    if (!res.ok) warnings.push(`Die Seite antwortet mit HTTP ${res.status}.`);

    // Embed headers — the host renders mini apps in an iframe/WebView.
    const xfo = (res.headers.get("x-frame-options") ?? "").toLowerCase();
    const csp = res.headers.get("content-security-policy") ?? "";
    let embeddable = true;
    if (xfo.includes("deny") || xfo.includes("sameorigin")) {
      embeddable = false;
      warnings.push(
        `X-Frame-Options: ${xfo.toUpperCase()} — die App kann so nicht im Röbel-Host eingebettet werden. Entferne den Header oder erlaube das Einbetten (frame-ancestors *).`,
      );
    }
    const fa = csp.match(/frame-ancestors\s+([^;]+)/i)?.[1]?.trim();
    if (fa && !fa.includes("*")) {
      embeddable = false;
      warnings.push(
        `CSP frame-ancestors ist auf "${fa}" beschränkt — für den Röbel-Host muss frame-ancestors * (oder die Röbel-Domains) erlaubt sein.`,
      );
    }

    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (bytes >= MAX_HTML_BYTES) {
          void reader.cancel().catch(() => {});
          break;
        }
      }
    }

    const pick = (re: RegExp): string | null => {
      const m = html.match(re);
      return m ? decodeEntities(m[1].trim()).slice(0, 300) : null;
    };
    const title =
      pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
      pick(/<title[^>]*>([^<]+)<\/title>/i);
    const description =
      pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
      pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    const themeColor = pick(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i);
    let iconUrl =
      pick(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i) ??
      pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      pick(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i);
    if (iconUrl && !/^https?:\/\//.test(iconUrl)) {
      try {
        iconUrl = new URL(iconUrl, res.url || url).toString();
      } catch {
        iconUrl = null;
      }
    }

    const sdkDetected = /@netizen-labs\/miniapp-sdk|miniapp-sdk[^"']*\.mjs/i.test(html);
    if (!sdkDetected) {
      warnings.push(
        "Das Netizen SDK wurde auf der Seite nicht erkannt. Ohne sdk.actions.ready() bleibt der Lade-Splash im Röbel-Host stehen. (Bei Single-Page-Apps mit Bundler kann die Erkennung fehlschlagen — dann ignorieren.)",
      );
    }

    return NextResponse.json({
      title,
      description,
      iconUrl,
      themeColor: themeColor && /^#[0-9a-fA-F]{6}$/.test(themeColor) ? themeColor : null,
      embeddable,
      sdkDetected,
      warnings,
      finalUrl: res.url || body.data.url,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError" || (e as Error)?.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Die Seite hat nicht rechtzeitig geantwortet (10s)." },
        { status: 504 },
      );
    }
    return jsonError(e);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
