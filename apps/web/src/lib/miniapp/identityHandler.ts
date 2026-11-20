// apps/web/src/lib/miniapp/identityHandler.ts
// Pure request handler for POST /api/mini-apps/identity (identity_get / identity_set).
// Dependencies are injected so node:test can load it (no `server-only`, no `@/` alias).
import { credentialMatches } from "@netizen-labs/miniapp-sdk/host";
import type { Credential, MiniAppIdentityRequest } from "@netizen-labs/miniapp-sdk";
import type { VerifyFail, VerifyOk } from "../signed-request/verify";
import type { CredentialAnswer, CredentialSource } from "./credentialSource";
import { EMPTY_GRANT, clampGrant, type GrantRow, type GrantStore } from "./grants";

type HeaderBag = { get(name: string): string | null };
export type IdentityAction = "identity_get" | "identity_set";

export interface IdentityApp {
  id: string;
  slug: string;
  status: string;
  manifestVersion: "1" | "2";
  identity: MiniAppIdentityRequest | null;
}

export interface IdentityDeps {
  verify: (body: unknown, headers: HeaderBag) => Promise<VerifyOk<IdentityAction> | VerifyFail>;
  getApp(ref: string): Promise<IdentityApp | null>;
  /** null when MINIAPP_SUBJECT_SECRET is missing. */
  store: GrantStore | null;
  credentials: CredentialSource;
  take(wallet: string): Promise<boolean>;
}

export interface IdentityTypeInfo {
  name: string;
  orgName?: string;
  imageUrl?: string;
  /** The account holds this type privately (consent sheet only). */
  private?: boolean;
}

export interface IdentityState {
  subject: string;
  asked: string[];
  granted: { profile: boolean; address: boolean; credentials: string[] };
  credentials: Credential[];
  types: Record<string, IdentityTypeInfo | null>;
}

export interface IdentityResult {
  status: number;
  json: Record<string, unknown>;
}

class CredentialsUnavailable extends Error {}

const fail = (status: number, code: string, message?: string): IdentityResult => ({
  status,
  json: { ok: false, code, ...(message ? { message } : {}) },
});

/** The SDK's Credential: the `private` flag never leaves the node. */
function toCredential(a: CredentialAnswer): Credential {
  return {
    type: a.type,
    kind: a.kind,
    ...(a.org ? { org: a.org } : {}),
    name: a.name,
    ...(a.imageUrl ? { imageUrl: a.imageUrl } : {}),
    validUntil: a.validUntil,
    recognised: a.recognised,
  };
}

async function buildState(
  app: IdentityApp,
  wallet: string,
  grant: GrantRow,
  store: GrantStore,
  source: CredentialSource,
): Promise<IdentityState> {
  const refs = (app.identity?.credentials ?? []).map((c) => c.type);
  const subject = await store.subject(app.id, wallet);
  let answers: CredentialAnswer[];
  let described: Awaited<ReturnType<CredentialSource["describe"]>>[];
  try {
    [answers, described] = await Promise.all([
      refs.length > 0 ? source.held(wallet, refs) : Promise.resolve([]),
      Promise.all(refs.map((r) => source.describe(r))),
    ]);
  } catch {
    throw new CredentialsUnavailable();
  }

  const credentials = answers
    .filter((a) => grant.credentials.some((g) => credentialMatches(g, a)))
    .map(toCredential);

  const types: Record<string, IdentityTypeInfo | null> = {};
  refs.forEach((ref, i) => {
    const d = described[i];
    if (!d) {
      types[ref] = null;
      return;
    }
    const heldPrivately = answers.some((a) => a.private && credentialMatches(ref, a));
    types[ref] = {
      name: d.name,
      ...(d.orgName ? { orgName: d.orgName } : {}),
      ...(d.imageUrl ? { imageUrl: d.imageUrl } : {}),
      ...(heldPrivately ? { private: true } : {}),
    };
  });

  return {
    subject,
    asked: grant.asked,
    granted: { profile: grant.profile, address: grant.address, credentials: grant.credentials },
    credentials,
    types,
  };
}

export async function handleIdentityRequest(body: unknown, headers: HeaderBag, deps: IdentityDeps): Promise<IdentityResult> {
  const v = await deps.verify(body, headers);
  if (!v.ok) return fail(v.status, v.code, v.message);

  const store = deps.store;
  if (!store) return fail(503, "identity_unavailable");

  const ref = typeof v.payload.app === "string" ? v.payload.app.trim() : "";
  const app = ref ? await deps.getApp(ref) : null;
  if (!app) return fail(404, "not_found");
  if (app.status === "suspended") return fail(403, "forbidden");

  // The wallet is the verified one, never anything from the payload.
  if (!(await deps.take(v.wallet))) return fail(429, "rate_limited");

  if (app.manifestVersion !== "2") {
    if (v.action === "identity_set") return fail(400, "invalid_params", "Diese Mini-App nutzt Manifest-Version 1.");
    const state: IdentityState = {
      subject: v.wallet.toLowerCase(),
      asked: [],
      granted: { profile: true, address: true, credentials: [] },
      credentials: [],
      types: {},
    };
    return { status: 200, json: state as unknown as Record<string, unknown> };
  }

  const identity = app.identity ?? undefined;
  try {
    let grant: GrantRow;
    if (v.action === "identity_set") {
      const input = v.payload.grant;
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return fail(400, "invalid_params", "grant fehlt.");
      }
      grant = clampGrant(identity, input as Record<string, unknown>);
      await store.put(app.id, v.wallet, grant);
    } else {
      const stored = await store.get(app.id, v.wallet);
      // Re-clamp: the manifest may have dropped an item since the grant was stored.
      grant = stored ? clampGrant(identity, stored) : EMPTY_GRANT;
    }
    const state = await buildState(app, v.wallet, grant, store, deps.credentials);
    return { status: 200, json: state as unknown as Record<string, unknown> };
  } catch (e) {
    if (e instanceof CredentialsUnavailable) return fail(503, "credentials_unavailable");
    throw e;
  }
}
