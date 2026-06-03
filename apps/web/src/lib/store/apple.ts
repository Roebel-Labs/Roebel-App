import { gunzipSync } from "node:zlib";
import { SignJWT, importPKCS8 } from "jose";

/**
 * Fetch daily first-time downloads from the App Store Connect
 * Sales and Trends reports API.
 *
 * Requires env: APPLE_ASC_ISSUER_ID, APPLE_ASC_KEY_ID, APPLE_ASC_PRIVATE_KEY
 * (the .p8 contents), APPLE_ASC_VENDOR_NUMBER. When any are missing the
 * fetcher logs and returns [] so the feature degrades gracefully.
 */
export interface StoreDailyRow {
  date: string; // YYYY-MM-DD
  downloads: number;
  cumulative_total?: number | null;
}

// Product Type Identifiers that represent a first-time app download
// (free + paid, across device classes). Updates/redownloads use other codes.
const DOWNLOAD_PRODUCT_TYPES = new Set([
  "1",
  "1F",
  "1T",
  "1FB",
  "1EP",
  "1E",
  "1EU",
  "F1",
]);

const APP_STORE_API = "https://api.appstoreconnect.apple.com/v1/salesReports";

function normalizePrivateKey(raw: string): string {
  // Vercel env often stores the .p8 with literal "\n" — restore real newlines.
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

async function buildToken(
  issuerId: string,
  keyId: string,
  privateKeyPem: string
): Promise<string> {
  const key = await importPKCS8(normalizePrivateKey(privateKeyPem), "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(issuerId)
    .setAudience("appstoreconnect-v1")
    .setIssuedAt()
    .setExpirationTime("18m")
    .sign(key);
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse one daily SALES SUMMARY TSV and sum first-time-download Units. */
function sumDownloadsFromTsv(tsv: string): number {
  const lines = tsv.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return 0;
  const header = lines[0].split("\t");
  const unitsIdx = header.indexOf("Units");
  const typeIdx = header.indexOf("Product Type Identifier");
  if (unitsIdx === -1) return 0;
  let total = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const type = typeIdx >= 0 ? (cols[typeIdx] ?? "").trim() : "";
    if (typeIdx >= 0 && !DOWNLOAD_PRODUCT_TYPES.has(type)) continue;
    const units = Number(cols[unitsIdx]);
    if (Number.isFinite(units)) total += units;
  }
  return total;
}

export async function fetchAppleDownloads(daysBack = 60): Promise<StoreDailyRow[]> {
  const issuerId = process.env.APPLE_ASC_ISSUER_ID;
  const keyId = process.env.APPLE_ASC_KEY_ID;
  const privateKey = process.env.APPLE_ASC_PRIVATE_KEY;
  const vendorNumber = process.env.APPLE_ASC_VENDOR_NUMBER;

  if (!issuerId || !keyId || !privateKey || !vendorNumber) {
    console.warn("[store/apple] Missing App Store Connect env — skipping.");
    return [];
  }

  let token: string;
  try {
    token = await buildToken(issuerId, keyId, privateKey);
  } catch (err) {
    console.error("[store/apple] Failed to sign JWT:", err);
    return [];
  }

  const rows: StoreDailyRow[] = [];
  // Apple data lags ~1 day; skip "today".
  for (let i = 1; i <= daysBack; i++) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const reportDate = dateKey(day);
    const url =
      `${APP_STORE_API}?filter[frequency]=DAILY&filter[reportType]=SALES` +
      `&filter[reportSubType]=SUMMARY&filter[vendorNumber]=${encodeURIComponent(
        vendorNumber
      )}&filter[reportDate]=${reportDate}`;

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/a-gzip" },
      });
      if (res.status === 404) continue; // no report for that day yet
      if (!res.ok) {
        console.warn(`[store/apple] ${reportDate} → HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const tsv = gunzipSync(buf).toString("utf-8");
      rows.push({ date: reportDate, downloads: sumDownloadsFromTsv(tsv) });
    } catch (err) {
      console.warn(`[store/apple] ${reportDate} fetch failed:`, err);
    }
  }

  return rows;
}
