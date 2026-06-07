// Minimal Supabase REST client for the coordinator service.
//
// We don't pull in @supabase/supabase-js because the coordinator Docker image
// is already large (zKeys are ~600 MB) and the SDK adds another ~20 MB.
// All we need is read/write against the coordinator_* tables we provisioned
// in supabase/migrations/20260425_coordinator_shamir.sql, with the service
// role key to bypass RLS.
//
// Env:
//   COORDINATOR_SUPABASE_URL          — https://<ref>.supabase.co
//   COORDINATOR_SUPABASE_SERVICE_KEY  — service_role key

const SUPABASE_URL = process.env.COORDINATOR_SUPABASE_URL;
const SUPABASE_KEY = process.env.COORDINATOR_SUPABASE_SERVICE_KEY;

function requireEnv() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      "COORDINATOR_SUPABASE_URL / COORDINATOR_SUPABASE_SERVICE_KEY not configured",
    );
  }
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

async function req(method, path, body) {
  requireEnv();
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${method} ${path} ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function insert(table, row) {
  const data = await req("POST", `/${table}`, row);
  return Array.isArray(data) ? data[0] : data;
}

async function update(table, filter, patch) {
  const data = await req("PATCH", `/${table}?${filter}`, patch);
  return Array.isArray(data) ? data[0] : data;
}

async function select(table, query = "") {
  return req("GET", `/${table}${query ? `?${query}` : ""}`);
}

async function audit({ event_type, actor_wallet, target_id, payload, tx_hash }) {
  return insert("coordinator_audit_log", {
    event_type,
    actor_wallet: actor_wallet ? actor_wallet.toLowerCase() : null,
    target_id: target_id ?? null,
    payload: payload ?? null,
    tx_hash: tx_hash ?? null,
  });
}

module.exports = { insert, update, select, audit, req };
