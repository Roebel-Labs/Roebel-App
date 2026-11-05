// CORS for the routes Röbel Studio calls from its Electron renderer (origin localhost / file://).
// `*` is safe: the studio authenticates with the Authorization header, and browsers never send
// cookies on a `*` response, so the admin-cookie path stays same-origin only.
import { NextResponse } from "next/server";

const HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "600",
};

export function withCors<T extends Response>(res: T): T {
  for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
  return res;
}

export function corsPreflight(): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }));
}
