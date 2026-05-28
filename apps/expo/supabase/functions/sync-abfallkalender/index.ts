/**
 * Supabase Edge Function: sync-abfallkalender
 *
 * Fetches the Landkreis Mecklenburgische Seenplatte GeMoS WasteBox ICS feed
 * for each configured Ortsteil (Röbel = 12236) and upserts pickup dates into
 * `waste_collection`.
 *
 * Invoked weekly by pg_cron (see migration 20260528_waste_collection.sql).
 * Idempotent — keyed by (node_id, pickup_date, fraction).
 *
 * Source: https://mst.wastebox.gemos-management.de/
 * Operator: REMONDIS Seenplatte (collection); calendar by Landkreis MSE.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const NODE_IDS = [12236]; // Röbel an der Müritz
// Waste type IDs (GeMoS WasteBox):
//   31 Restabfallbehälter, 32 Gelbe Tonne, 33 Biotonne,
//   34 Papiertonne, 35 Weihnachtsbaum, 36 Schadstoffmobil
const WASTE_TYPES = '31,32,33,34,35,36';
const FEED_BASE = 'https://mst.wastebox.gemos-management.de/Gemos/WasteBox/Frontend/TourSchedule/Raw/Name';
const USER_AGENT = 'roebel-app/1.0 (+https://roebel.app)';

type Fraction =
  | 'restmuell'
  | 'bio'
  | 'papier'
  | 'gelbe_tonne'
  | 'schadstoff'
  | 'weihnachtsbaum';

interface WasteRow {
  node_id: number;
  pickup_date: string; // YYYY-MM-DD
  fraction: Fraction;
  summary: string;
  starts_at: string | null;
  ends_at: string | null;
  source_url: string;
  ics_uid: string | null;
  updated_at: string;
}

function classifyFraction(summary: string): Fraction | null {
  const s = summary.toLowerCase();
  if (s.includes('restabfall') || s.includes('restmüll') || s.includes('restmuell')) return 'restmuell';
  if (s.includes('biotonne') || s.includes('bioabfall')) return 'bio';
  if (s.includes('papiertonne') || s.includes('papier')) return 'papier';
  if (s.includes('gelbe tonne') || s.includes('gelber sack') || s.includes('wertstoff')) return 'gelbe_tonne';
  if (s.includes('schadstoff')) return 'schadstoff';
  if (s.includes('weihnachtsbaum') || s.includes('tannenbaum')) return 'weihnachtsbaum';
  return null;
}

// RFC 5545 line unfolding: a line that begins with whitespace continues the previous line.
function unfoldIcs(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

// Parse a DTSTART/DTEND value. Returns { date: 'YYYY-MM-DD', iso: ISO string or null }.
function parseDateValue(propertyLine: string): { date: string | null; iso: string | null } {
  // propertyLine looks like "DTSTART;VALUE=DATE:20260603" or "DTSTART;TZID=Europe/Berlin:20260606T090000"
  const colonIdx = propertyLine.indexOf(':');
  if (colonIdx === -1) return { date: null, iso: null };
  const value = propertyLine.slice(colonIdx + 1).trim();

  // DATE form: YYYYMMDD
  if (/^\d{8}$/.test(value)) {
    const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    return { date, iso: null };
  }

  // DATE-TIME form: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  const dtMatch = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (dtMatch) {
    const [, y, m, d, hh, mm, ss, z] = dtMatch;
    const date = `${y}-${m}-${d}`;
    const params = propertyLine.slice(0, colonIdx).toUpperCase();
    let iso: string;
    if (z === 'Z') {
      iso = `${date}T${hh}:${mm}:${ss}Z`;
    } else if (params.includes('TZID=EUROPE/BERLIN')) {
      // Treat as Europe/Berlin wall time. For simplicity, encode as +01:00 winter / +02:00 summer.
      // Crude DST: Apr–Oct → +02:00, else +01:00. Sufficient for display-only timestamps.
      const month = parseInt(m, 10);
      const offset = month >= 4 && month <= 10 ? '+02:00' : '+01:00';
      iso = `${date}T${hh}:${mm}:${ss}${offset}`;
    } else {
      iso = `${date}T${hh}:${mm}:${ss}Z`;
    }
    return { date, iso };
  }

  return { date: null, iso: null };
}

function parseIcs(text: string, sourceUrl: string, nodeId: number, now: string): WasteRow[] {
  const lines = unfoldIcs(text);
  const rows: WasteRow[] = [];
  let inEvent = false;
  let summary = '';
  let dtstartLine: string | null = null;
  let dtendLine: string | null = null;
  let uid: string | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      summary = '';
      dtstartLine = null;
      dtendLine = null;
      uid = null;
      continue;
    }
    if (line === 'END:VEVENT') {
      if (inEvent && summary && dtstartLine) {
        const fraction = classifyFraction(summary);
        const start = parseDateValue(dtstartLine);
        const end = dtendLine ? parseDateValue(dtendLine) : { date: null, iso: null };
        if (fraction && start.date) {
          rows.push({
            node_id: nodeId,
            pickup_date: start.date,
            fraction,
            summary,
            starts_at: start.iso,
            ends_at: end.iso,
            source_url: sourceUrl,
            ics_uid: uid,
            updated_at: now,
          });
        }
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    if (line.startsWith('SUMMARY')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) summary = unescapeText(line.slice(colonIdx + 1).trim());
    } else if (line.startsWith('DTSTART')) {
      dtstartLine = line;
    } else if (line.startsWith('DTEND')) {
      dtendLine = line;
    } else if (line.startsWith('UID')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) uid = line.slice(colonIdx + 1).trim();
    }
  }

  return rows;
}

async function fetchIcs(nodeId: number, year: number): Promise<{ ok: boolean; status: number; body: string; url: string }> {
  const url = `${FEED_BASE}/${year}/List/${nodeId}/${WASTE_TYPES}/Print/ics/Default/Abfuhrtermine.ics`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/calendar, text/plain;q=0.9, */*;q=0.5',
    },
  });
  const body = res.ok ? await res.text() : '';
  return { ok: res.ok, status: res.status, body, url };
}

serve(async (_req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const currentYear = new Date().getUTCFullYear();
  const years = [currentYear, currentYear + 1];

  const result = {
    inserted: 0,
    updated: 0,
    skipped_years: [] as string[],
    errors: [] as { node_id: number; year: number; reason: string }[],
    duration_ms: 0,
  };

  for (const nodeId of NODE_IDS) {
    for (const year of years) {
      try {
        const fetched = await fetchIcs(nodeId, year);
        if (!fetched.ok) {
          if (fetched.status === 404 || fetched.status === 400) {
            result.skipped_years.push(`${nodeId}/${year} (${fetched.status})`);
            continue;
          }
          result.errors.push({ node_id: nodeId, year, reason: `HTTP ${fetched.status}` });
          continue;
        }

        const rows = parseIcs(fetched.body, fetched.url, nodeId, new Date().toISOString());
        if (rows.length === 0) {
          result.skipped_years.push(`${nodeId}/${year} (empty)`);
          continue;
        }

        const { data, error } = await supabase
          .from('waste_collection')
          .upsert(rows, { onConflict: 'node_id,pickup_date,fraction', ignoreDuplicates: false })
          .select('id');

        if (error) {
          result.errors.push({ node_id: nodeId, year, reason: error.message });
          continue;
        }

        result.inserted += data?.length ?? 0;
      } catch (err) {
        result.errors.push({
          node_id: nodeId,
          year,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  result.duration_ms = Date.now() - startedAt;

  console.log('sync-abfallkalender result:', JSON.stringify(result));

  return new Response(JSON.stringify(result), {
    status: result.errors.length > 0 ? 500 : 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
