import {
  RelayClient,
  buildEvent,
  deriveOrgIdentity,
  type NostrEvent,
  type OrgIdentity,
} from "@netizen-labs/nostr";
import { htmlToMarkdown } from "./html-to-md.js";
import {
  articleToSpec,
  businessToSpec,
  dealToSpec,
  eventToSpec,
  forumThreadToSpec,
  listingToSpec,
  menuToSpec,
  movieToSpec,
  newsToSpec,
  noticeToSpec,
  orgPostToSpec,
  orgToSpec,
  proposalToSpec,
  unixFromUpdatedAt,
  TOWN_SCOPE,
  type MenuInput,
  type PublishSpec,
} from "./mappers.js";
import { drainOutbox, resolvePubkeys } from "./outbox.js";
import { buergervotumToSpec, contractToSpec, payoutLineToSpec, taskToSpec } from "./vorhaben.js";

/**
 * One publish pass: public datasets → signed replaceable events on the relay.
 *
 * Stateless by design. Every pass rebuilds every publishable record; because
 * `created_at` is the row's `updated_at`, an unchanged row produces the exact
 * same event id and the relay counts it as a duplicate. No watermark to lose,
 * no publication table to drift — the relay's own replacement semantics are the
 * state. That is affordable because a town's public record is hundreds of rows,
 * not millions, and it means a wiped relay repopulates in one pass.
 *
 * Records sign under node-held organisation identities (deriveOrgIdentity), so
 * provenance is per-organisation from day one: the cinema's screenings are
 * signed by the cinema's key, an org's events by that org's key. The roster —
 * not the key — is the authority over who may cause such a publish; this
 * service only mirrors what the app already accepted as public.
 */

export type DatasetName =
  | "events" | "cinema" | "orgs" | "articles" | "marketplace" | "deals"
  | "news" | "businesses" | "notices" | "menus" | "proposals" | "forum" | "vorhaben";

/** One ledger row per published event that a spec asked to record. */
export interface LedgerRow {
  source_type: string;
  source_id: string;
  pubkey_hex: string;
  event_id: string;
  status: "published";
}

export interface PublisherDeps {
  nodeSecret: string;
  nodeId: string;
  datasets: DatasetName[];
  /** PostgREST read: table + query string (service key held by the caller). */
  fetchRows: (table: string, query: string) => Promise<Record<string, unknown>[]>;
  relayUrl: string;
  makeClient?: (url: string) => Pick<RelayClient, "publish" | "close">;
  /**
   * Upsert accepted events into the app's `nostr_publications` ledger
   * (keyed source_type + source_id). Optional; a failure is logged, never
   * fails the pass — the relay stays the source of truth.
   */
  recordPublications?: (rows: LedgerRow[]) => Promise<void>;
  /**
   * Mirror an image onto the node, content-addressed. Returns the public URL
   * to substitute, or null to keep the original (a failed mirror must degrade
   * to the centralized URL, not to a broken record).
   */
  mirrorMedia?: (url: string) => Promise<string | null>;
  /**
   * Called with every signing pubkey BEFORE anything is published. The caller
   * announces them to the allow-list here — announcing after publishing would
   * guarantee a fully-rejected first pass on every fresh node.
   */
  onPubkeys?: (pubkeys: string[]) => Promise<void>;
  log?: (message: string) => void;
  /**
   * Governor address for proposals ("100:0x5F5e…" format: chainId:address).
   * Required if datasets includes "proposals".
   */
  governor?: string;
  /**
   * PostgREST PATCH / POST. Both are needed for the `vorhaben` outbox drain
   * (signed_event / published_at write-back, stage ledger); without them the
   * drain is skipped and only the Vorhaben state events publish.
   */
  updateRow?: (table: string, query: string, body: Record<string, unknown>) => Promise<void>;
  insertRow?: (table: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface PublishSummary {
  built: number;
  accepted: number;
  duplicates: number;
  rejected: number;
  /** Every pubkey this pass signed with — the allow-list needs each of them. */
  pubkeys: string[];
}

/** Build the full spec list for one pass. Exposed for tests. */
export async function buildSpecs(
  deps: Pick<PublisherDeps, "datasets" | "fetchRows" | "nodeId" | "governor" | "log"> & { nodeSecret?: string },
): Promise<PublishSpec[]> {
  const specs: PublishSpec[] = [];
  // Vorhaben state first: the proposals dataset needs its task ids and freshness for the head tags.
  let vorhaben: VorhabenState | null = null;
  let vorhabenFailed = false;
  if (deps.datasets.includes("vorhaben")) {
    if (!deps.nodeSecret) throw new Error("datasets includes 'vorhaben' but no node secret was given to derive the town key");
    try {
      vorhaben = await loadVorhaben(deps.fetchRows, deriveOrgIdentity(deps.nodeSecret, deps.nodeId, TOWN_SCOPE).publicKey);
      specs.push(...vorhaben.specs);
    } catch (error) {
      // Isolated: the other datasets still publish. The proposal heads are
      // skipped too — a tag-less head would replace the tagged one on the relay.
      vorhabenFailed = true;
      deps.log?.(`vorhaben state load failed, skipping vorhaben + proposals this pass: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const wantsOrgs = deps.datasets.includes("orgs");
  const wantsEvents = deps.datasets.includes("events");

  // Events need the org set even when org profiles are not published: the
  // "personal accounts stay off the record" rule is enforced against it.
  // Menus also need it to scope org-owned restaurants correctly.
  let orgRows: Record<string, unknown>[] = [];
  if (wantsOrgs || wantsEvents || deps.datasets.includes("menus") || deps.datasets.includes("forum")) {
    orgRows = await deps.fetchRows(
      "accounts",
      "select=id,account_type,name,bio,avatar_url,cover_url,sub_type,opening_hours,slug,updated_at,created_at&account_type=eq.organisation",
    );
  }
  const orgIds = new Set(orgRows.map((r) => String(r.id)));

  // Consent lookup: wallet -> npub bindings joined with account ownership, so a
  // PERSONAL account's content publishes exactly when its owner accepted the
  // public record. One fetch, shared by events and marketplace.
  const wantsConsented = wantsEvents || deps.datasets.includes("marketplace");
  let optedWallets = new Map<string, string>();
  let ownerPubkeyByAccount = new Map<string, string>();
  if (wantsConsented) {
    const bindings = await deps.fetchRows(
      "nostr_identities",
      "select=wallet_address,pubkey_hex,revoked_at&revoked_at=is.null",
    );
    optedWallets = new Map(
      bindings
        .filter((b) => typeof b.wallet_address === "string" && typeof b.pubkey_hex === "string")
        .map((b) => [String(b.wallet_address).toLowerCase(), String(b.pubkey_hex)]),
    );
    const owners = await deps.fetchRows(
      "account_owners",
      "select=account_id,wallet_address",
    );
    for (const o of owners) {
      const pk = optedWallets.get(String(o.wallet_address ?? "").toLowerCase());
      if (pk && o.account_id) ownerPubkeyByAccount.set(String(o.account_id), pk);
    }
  }

  if (wantsOrgs) {
    for (const row of orgRows) {
      const spec = orgToSpec(row, deps.nodeId);
      if (spec) specs.push(spec);
    }
  }
  if (wantsEvents) {
    const rows = await deps.fetchRows(
      "events",
      "select=id,account_id,title,description,date,time,end_time,location,formatted_address,category,image_url,website_url,ticket_price,is_cancelled,status,updated_at,created_at&status=eq.approved",
    );
    for (const row of rows) {
      const spec = eventToSpec(row, orgIds, ownerPubkeyByAccount);
      if (spec) specs.push(spec);
    }
  }
  if (deps.datasets.includes("cinema")) {
    const rows = await deps.fetchRows(
      "movies",
      "select=id,title,description,date,time,fsk,cover_image_url,trailer_youtube_url,status,updated_at,created_at&status=eq.published",
    );
    for (const row of rows) {
      const spec = movieToSpec(row);
      if (spec) specs.push(spec);
    }
  }
  if (wantsOrgs && orgIds.size) {
    // Feed posts by organisation accounts, signed by each org's own key. The
    // citizen device never signs these — a person's key on an organisation's
    // words would be false attribution.
    const rows = await deps.fetchRows(
      "posts",
      `select=id,account_id,content,media_urls,status,created_at&feed_type=eq.main&status=eq.published&account_id=in.(${[...orgIds].join(",")})`,
    );
    for (const row of rows) {
      const spec = orgPostToSpec(row, orgIds);
      if (spec) specs.push(spec);
    }
  }
  if (deps.datasets.includes("forum") && orgIds.size) {
    // Forum threads (Themen) opened under organisation accounts — e.g. the
    // Bürgerrat recommendations posted by "Bürger für Röbel". Citizen threads
    // are signed on the citizen's own device and are not the node's to publish.
    const rows = await deps.fetchRows(
      "forum_threads",
      `select=id,account_id,title,body,category_slug,status,source,source_rank,source_score,source_citation,source_url,created_at&status=eq.published&account_id=in.(${[...orgIds].join(",")})`,
    );
    for (const row of rows) {
      const spec = forumThreadToSpec(row, orgIds);
      if (spec) specs.push(spec);
    }
  }
  if (deps.datasets.includes("articles")) {
    const rows = await deps.fetchRows(
      "blog_articles",
      "select=id,account_id,title,excerpt,content,cover_image_url,category,tags,status,published_at,ai_generated,updated_at,created_at&status=eq.published",
    );
    for (const row of rows) {
      const spec = articleToSpec(row, orgIds, htmlToMarkdown);
      if (spec) specs.push(spec);
    }
  }
  if (deps.datasets.includes("news")) {
    const rows = await deps.fetchRows(
      "news_articles",
      "select=id,slug,title,excerpt,content,cover_image_url,category,published_at,status,updated_at,created_at&status=eq.published",
    );
    for (const row of rows) {
      const spec = newsToSpec(row, htmlToMarkdown);
      if (spec) specs.push(spec);
    }
  }
  if (deps.datasets.includes("marketplace")) {
    const rows = await deps.fetchRows(
      "marketplace_listings",
      "select=id,account_id,title,description,price,price_type,category,condition,media_urls,neighborhood,listing_type,seller_wallet_address,status,updated_at,created_at",
    );
    for (const row of rows) {
      const spec = listingToSpec(row, orgIds, optedWallets);
      if (spec) specs.push(spec);
    }
  }
  const wantsDeals = deps.datasets.includes("deals");
  const wantsBusinesses = deps.datasets.includes("businesses");
  if (wantsDeals || wantsBusinesses) {
    const businesses = await deps.fetchRows(
      "businesses",
      "select=id,name,slug,description,category,logo_url,cover_image_url,address,opening_hours,website_url,status,updated_at,created_at&status=eq.published",
    );
    if (wantsBusinesses) {
      for (const row of businesses) {
        const spec = businessToSpec(row, deps.nodeId);
        if (spec) specs.push(spec);
      }
    }
    if (wantsDeals) {
      const nameById = new Map(
        businesses.filter((b) => b.id && typeof b.name === "string").map((b) => [String(b.id), String(b.name)]),
      );
      // The `businesses` fetch above is already status=eq.published, so this
      // Set of ids IS "businesses whose deals are allowed to publish" —
      // built from the SAME fetch (no second round trip) rather than a
      // fragile PostgREST embedded-resource filter on business_deals itself.
      // A deal owned by a business that fell out of that fetch (pending,
      // rejected, deleted) is filtered out in code, defense-in-depth style,
      // even though the deal row's own status/is_active flags say "active".
      const publishableBusinessIds = new Set(businesses.filter((b) => b.id).map((b) => String(b.id)));
      const rows = await deps.fetchRows(
        "business_deals",
        "select=id,business_id,title,description,deal_type,deal_value,image_url,media_urls,start_date,end_date,status,is_active,updated_at,created_at&status=eq.active&is_active=eq.true",
      );
      for (const row of rows) {
        const spec = dealToSpec(row, nameById, publishableBusinessIds);
        if (spec) specs.push(spec);
      }
    }
  }
  if (deps.datasets.includes("notices")) {
    const alerts = await deps.fetchRows(
      "service_alerts",
      "select=id,title,description,severity,status,updated_at,created_at&status=neq.draft",
    );
    for (const row of alerts) {
      const spec = noticeToSpec(row, "service_alert");
      if (spec) specs.push(spec);
    }
    // `announcements` stores its text in `description`; alias it to the
    // `content` key the notice mapper reads (PostgREST `alias:column`). A
    // literal `content` here 400s the fetch and, because a pass is
    // all-or-nothing, silently stops EVERY dataset from publishing.
    const announcements = await deps.fetchRows(
      "announcements",
      "select=id,title,content:description,is_active,updated_at,created_at",
    );
    for (const row of announcements) {
      const spec = noticeToSpec(row, "announcement");
      if (spec) specs.push(spec);
    }
  }
  if (deps.datasets.includes("menus")) {
    const restaurants = await deps.fetchRows(
      "restaurants",
      "select=id,name,slug,description,logo_url,address,account_id,status,updated_at,created_at&status=in.(approved,published)",
    );
    const cats = await deps.fetchRows(
      "menu_categories", "select=id,restaurant_id,name,sort_order,is_active",
    );
    const items = await deps.fetchRows(
      "menu_items", "select=id,category_id,name,description,price,is_available",
    );
    const itemsByCategory = new Map<string, Record<string, unknown>[]>();
    for (const i of items) {
      const key = String(i.category_id ?? "");
      if (!itemsByCategory.has(key)) itemsByCategory.set(key, []);
      itemsByCategory.get(key)!.push(i);
    }
    for (const r of restaurants) {
      const spec = menuToSpec(
        {
          restaurant: r,
          categories: cats.filter((c) => String(c.restaurant_id) === String(r.id)),
          itemsByCategory,
        },
        orgIds,
      );
      if (spec) specs.push(spec);
    }
  }
  if (deps.datasets.includes("proposals") && !vorhabenFailed) {
    if (!deps.governor) {
      // Deliberately loud: a configured dataset that silently publishes nothing is a lie.
      throw new Error("datasets includes 'proposals' but PROPOSAL_GOVERNOR is not set");
    }
    // The Vorhaben columns are only selected when the dataset is on, so a node
    // without the Vorhaben migration keeps publishing proposals unchanged.
    const rows = await deps.fetchRows(
      "proposals",
      "select=id,proposal_id,blockchain_proposal_id,proposal_number,title,summary,category,irys_content_id,state,created_at,updated_at" +
        (vorhaben ? ",vorhaben_enabled,lifecycle_stage,budget_amount,budget_asset,beneficiary_name" : ""),
    );
    for (const row of rows) {
      const id = String(row.id ?? "");
      const spec = vorhaben
        ? proposalToSpec(row, deps.governor, {
            townPubkey: vorhaben.townPubkey,
            taskIds: vorhaben.taskIds.get(id) ?? [],
            minCreatedAt: vorhaben.headFreshness.get(id),
          })
        : proposalToSpec(row, deps.governor);
      if (spec) specs.push(spec);
    }
  }
  return specs;
}

interface VorhabenState {
  townPubkey: string;
  specs: PublishSpec[];
  taskIds: Map<string, string[]>;
  /** Newest task createdAt per proposal uuid — the head must supersede its tasks. */
  headFreshness: Map<string, number>;
}

/** Exact sum of numeric(38,18) strings (no float drift on money). */
function sumDecimals(values: unknown[]): string {
  const SCALE = 18;
  let total = 0n;
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (!/^\d+(\.\d+)?$/.test(s)) continue;
    const [int, frac = ""] = s.split(".");
    total += BigInt(int + frac.slice(0, SCALE).padEnd(SCALE, "0"));
  }
  const raw = total.toString().padStart(SCALE + 1, "0");
  return `${raw.slice(0, -SCALE)}.${raw.slice(-SCALE)}`;
}

/**
 * The NSP-13 state events (32104 / 32108 / 32110 / 32111) rebuilt from the
 * current rows of every Vorhaben-enabled proposal. Stateless like every other
 * dataset: addressable events replace themselves, unchanged rows re-sign to
 * the same id.
 */
async function loadVorhaben(fetchRows: PublisherDeps["fetchRows"], townPubkey: string): Promise<VorhabenState> {
  const state: VorhabenState = { townPubkey, specs: [], taskIds: new Map(), headFreshness: new Map() };
  const proposals = await fetchRows(
    "proposals",
    "select=id,proposal_id,proposal_number,title,lifecycle_stage,for_votes,against_votes,abstain_votes,tally_address,tally_confirm_opened_at,updated_at&vorhaben_enabled=is.true",
  );
  const ids = proposals.map((p) => String(p.id ?? "")).filter((id) => /^[0-9A-Za-z-]+$/.test(id));
  if (!ids.length) return state;
  const inIds = `in.(${ids.join(",")})`;
  const keyById = new Map(proposals.map((p) => [String(p.id), String(p.proposal_id ?? "")]));

  const tasks = await fetchRows(
    "proposal_tasks",
    `select=id,proposal_id,title,description,acceptance_criteria,reward_amount,reward_asset,deadline,status,assignee_wallet,created_by_wallet,created_at,updated_at&proposal_id=${inIds}&order=created_at.asc`,
  );
  const contracts = await fetchRows(
    "proposal_contracts",
    `select=id,proposal_id,platform_fee_bps,platform_safe_address,created_at&proposal_id=${inIds}`,
  );
  // All lines (not only published states): the contract lists every line and its
  // totals must not dip while a line is mid-send; payoutLineToSpec drops the
  // unpublished states (sendend, gesendet) itself.
  const lines = await fetchRows(
    "proposal_payout_lines",
    `select=id,contract_id,proposal_id,role,recipient_wallet,recipient_label,amount,asset,rail,reference_type,reference_id,status,tx_hash,created_at,updated_at&proposal_id=${inIds}&order=created_at.asc`,
  );
  const hashes = await fetchRows(
    "proposal_wahlhelfer",
    `select=proposal_id,result_hash&result_hash=not.is.null&proposal_id=${inIds}`,
  );
  const pubkeys = await resolvePubkeys(fetchRows, [
    ...tasks.flatMap((t) => [t.assignee_wallet, t.created_by_wallet]),
    ...lines.map((l) => l.recipient_wallet),
  ]);
  const pk = (w: unknown) => (typeof w === "string" ? pubkeys.get(w.toLowerCase()) ?? null : null);

  const resultHash = new Map<string, string>();
  for (const h of hashes) if (typeof h.result_hash === "string" && !resultHash.has(String(h.proposal_id))) resultHash.set(String(h.proposal_id), h.result_hash);
  for (const p of proposals) {
    const hash = resultHash.get(String(p.id));
    const spec = buergervotumToSpec(hash ? { ...p, result_hash: hash } : p, townPubkey);
    if (spec) state.specs.push(spec);
  }

  for (const t of tasks) {
    const pid = String(t.proposal_id ?? "");
    const key = keyById.get(pid);
    if (!key) continue;
    const spec = taskToSpec(t, key, townPubkey, pk(t.assignee_wallet), pk(t.created_by_wallet));
    if (!spec) continue;
    state.specs.push(spec);
    state.taskIds.set(pid, [...(state.taskIds.get(pid) ?? []), String(t.id)]);
    state.headFreshness.set(pid, Math.max(state.headFreshness.get(pid) ?? 0, unixFromUpdatedAt(t)));
  }

  for (const c of contracts) {
    const pid = String(c.proposal_id ?? "");
    const key = keyById.get(pid);
    if (!key) continue;
    const own = lines.filter((l) => String(l.contract_id) === String(c.id));
    const assets = [...new Set(own.map((l) => String(l.asset ?? "")).filter(Boolean))].sort();
    const totals: Array<[string, string]> = assets.map((a) => [a, sumDecimals(own.filter((l) => l.asset === a).map((l) => l.amount))]);
    const freshness = own.reduce((m, l) => Math.max(m, unixFromUpdatedAt(l)), 0);
    const spec = contractToSpec(c, key, townPubkey, own.map((l) => String(l.id)), totals, freshness || undefined);
    if (spec) state.specs.push(spec);
    for (const l of own) {
      const lineSpec = payoutLineToSpec(l, key, townPubkey, pk(l.recipient_wallet));
      if (lineSpec) state.specs.push(lineSpec);
    }
  }
  return state;
}

/**
 * Swap image tags for node-mirrored, content-addressed URLs.
 *
 * Applied before signing so the substitution is part of the signed record: a
 * reader verifying the event verifies the mirrored URL. The hash in the URL is
 * the integrity check — any mirror serving those bytes serves that path.
 */
export async function mirrorSpecMedia(
  specs: PublishSpec[],
  mirror: (url: string) => Promise<string | null>,
): Promise<void> {
  const cache = new Map<string, string | null>();
  const mirrorUrl = async (url: string): Promise<string | null> => {
    if (!cache.has(url)) cache.set(url, await mirror(url));
    return cache.get(url) ?? null;
  };
  for (const spec of specs) {
    let rewritten = false;
    for (const tag of spec.tags) {
      if (tag[0] !== "image" || !tag[1]) continue;
      const mirrored = await mirrorUrl(tag[1]);
      if (mirrored && mirrored !== tag[1]) {
        tag[1] = mirrored;
        rewritten = true;
      }
    }
    // Profile images live INSIDE the kind 0 content JSON, not in tags.
    if (spec.kind === 0) {
      try {
        const profile = JSON.parse(spec.content) as Record<string, unknown>;
        for (const field of ["picture", "banner"]) {
          const url = profile[field];
          if (typeof url !== "string" || !url) continue;
          const mirrored = await mirrorUrl(url);
          if (mirrored && mirrored !== url) {
            profile[field] = mirrored;
            rewritten = true;
          }
        }
        if (rewritten) spec.content = JSON.stringify(profile);
      } catch {
        // not JSON — leave it alone
      }
    }
    // A rewritten URL IS a new version of the record. Without this bump the
    // mirrored event ties with the unmirrored one already on the relay at the
    // same created_at, and NIP-01's id tie-break picks a winner at random.
    // +1 is constant, so passes stay idempotent.
    if (rewritten) spec.createdAt += 1;
  }
}

/** Deterministically sign a spec under its scope's node-held identity. */
export function signSpec(
  spec: PublishSpec,
  identities: Map<string, OrgIdentity>,
  nodeSecret: string,
  nodeId: string,
): NostrEvent {
  let identity = identities.get(spec.scope);
  if (!identity) {
    identity = deriveOrgIdentity(nodeSecret, nodeId, spec.scope);
    identities.set(spec.scope, identity);
  }
  return buildEvent(identity.secretKey, spec.kind, spec.content, {
    createdAt: spec.createdAt,
    tags: spec.tags,
  });
}

export async function publishOnce(deps: PublisherDeps): Promise<PublishSummary> {
  const log = deps.log ?? (() => {});
  const specs = await buildSpecs(deps);
  if (deps.mirrorMedia) await mirrorSpecMedia(specs, deps.mirrorMedia);

  const identities = new Map<string, OrgIdentity>();
  const events = specs.map((s) => signSpec(s, identities, deps.nodeSecret, deps.nodeId));
  const drainEnabled = deps.datasets.includes("vorhaben") && !!deps.updateRow && !!deps.insertRow;
  const townPubkey = drainEnabled ? deriveOrgIdentity(deps.nodeSecret, deps.nodeId, TOWN_SCOPE).publicKey : "";
  const pubkeys = [...new Set([...events.map((e) => e.pubkey), ...(drainEnabled ? [townPubkey] : [])])];
  if (deps.onPubkeys) await deps.onPubkeys(pubkeys);

  const client = deps.makeClient
    ? deps.makeClient(deps.relayUrl)
    : new RelayClient(deps.relayUrl, { timeoutMs: 15_000 });

  let accepted = 0;
  let duplicates = 0;
  let rejected = 0;
  const ledgerRows: LedgerRow[] = [];
  try {
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      const result = await client.publish(event);
      if (result.ok && /duplicate/i.test(result.message)) duplicates += 1;
      else if (result.ok) accepted += 1;
      else {
        rejected += 1;
        log(`relay rejected ${event.kind}/${event.id.slice(0, 12)}…: ${result.message}`);
      }
      const ledger = specs[i]?.ledger;
      if (result.ok && ledger) {
        ledgerRows.push({
          source_type: ledger.sourceType,
          source_id: ledger.sourceId,
          pubkey_hex: event.pubkey,
          event_id: event.id,
          status: "published",
        });
      }
    }
    // The Vorhaben action log goes out after the state it refers to, over the
    // same connection. A drain failure is logged, never fails the pass.
    if (drainEnabled) {
      try {
        await drainOutbox({
          fetchRows: deps.fetchRows,
          updateRow: deps.updateRow!,
          insertRow: deps.insertRow!,
          publish: (e) => client.publish(e),
          sign: (s) => signSpec(s, identities, deps.nodeSecret, deps.nodeId),
          townPubkey,
          now: () => Math.floor(Date.now() / 1000),
          log,
        });
      } catch (error) {
        log(`outbox drain failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    client.close();
  }
  if (deps.recordPublications && ledgerRows.length) {
    try {
      await deps.recordPublications(ledgerRows);
    } catch (error) {
      log(`ledger write failed for ${ledgerRows.length} rows: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  log(`built ${specs.length}, accepted ${accepted}, duplicates ${duplicates}, rejected ${rejected}`);
  return { built: specs.length, accepted, duplicates, rejected, pubkeys };
}
