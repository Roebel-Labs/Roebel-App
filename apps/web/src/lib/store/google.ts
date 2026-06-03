import { SignJWT, importPKCS8 } from "jose";
import type { StoreDailyRow } from "./apple";

/**
 * Fetch daily device installs from the Google Play statistics export, which
 * Play Console writes to a Cloud Storage bucket. We read the monthly
 * "installs overview" CSV for the current + previous month.
 *
 * Requires env: GOOGLE_PLAY_SA_JSON (service-account JSON), GOOGLE_PLAY_GCS_BUCKET
 * (e.g. "pubsite_prod_1234567890"), GOOGLE_PLAY_PACKAGE
 * (e.g. "com.maxbrych.roebelonchain"). Missing env → logs and returns [].
 */

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const key = await importPKCS8(sa.private_key.replace(/\\n/g, "\n"), "RS256");
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/devstorage.read_only",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`token exchange failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("no access_token in response");
  return json.access_token;
}

/** Play export CSVs are UTF-16LE with a BOM. Decode + parse. */
function parseOverviewCsv(buf: ArrayBuffer): StoreDailyRow[] {
  const text = new TextDecoder("utf-16le").decode(buf).replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  const dateIdx = header.indexOf("Date");
  const dailyIdx = header.findIndex((h) => h === "Daily Device Installs");
  const totalIdx = header.findIndex((h) => h === "Total User Installs");
  if (dateIdx === -1 || dailyIdx === -1) return [];

  const rows: StoreDailyRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    const date = cols[dateIdx];
    if (!date) continue;
    const downloads = Number(cols[dailyIdx]);
    const total = totalIdx >= 0 ? Number(cols[totalIdx]) : NaN;
    rows.push({
      date,
      downloads: Number.isFinite(downloads) ? downloads : 0,
      cumulative_total: Number.isFinite(total) ? total : null,
    });
  }
  return rows;
}

async function fetchOverview(
  token: string,
  bucket: string,
  object: string
): Promise<StoreDailyRow[]> {
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
    bucket
  )}/o/${encodeURIComponent(object)}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return []; // month file not present yet
  if (!res.ok) {
    console.warn(`[store/google] ${object} → HTTP ${res.status}`);
    return [];
  }
  return parseOverviewCsv(await res.arrayBuffer());
}

function yyyymm(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function fetchGoogleInstalls(): Promise<StoreDailyRow[]> {
  const saJson = process.env.GOOGLE_PLAY_SA_JSON;
  const bucket = process.env.GOOGLE_PLAY_GCS_BUCKET;
  const pkg = process.env.GOOGLE_PLAY_PACKAGE;

  if (!saJson || !bucket || !pkg) {
    console.warn("[store/google] Missing Play export env — skipping.");
    return [];
  }

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(saJson) as ServiceAccount;
  } catch {
    console.error("[store/google] GOOGLE_PLAY_SA_JSON is not valid JSON.");
    return [];
  }

  try {
    const token = await getAccessToken(sa);
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const months = [yyyymm(prev), yyyymm(now)];
    const all: StoreDailyRow[] = [];
    for (const ym of months) {
      const object = `stats/installs/installs_${pkg}_${ym}_overview.csv`;
      all.push(...(await fetchOverview(token, bucket, object)));
    }
    return all;
  } catch (err) {
    console.error("[store/google] Failed to fetch installs:", err);
    return [];
  }
}
