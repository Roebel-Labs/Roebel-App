// Public community data (read-only). Shared by the public Röbel MCP
// connector (app/api/roebel/[transport]/route.ts) and the chat harness
// roebel pack. Only published/approved/active content; queries never select
// wallet addresses, emails or phone numbers for output.
import { looksLikeWallet } from "./shape";
import { sanitizeSearch, tenantSite, type Db } from "./tenant";

/** Tenant id, or the harness tenant (its appOrigin drives deep links). */
export type TenantRef = string | { id: string; appOrigin?: string };

function site(t: TenantRef) {
  return typeof t === "string" ? tenantSite(t) : tenantSite(t.id, t.appOrigin);
}

function todayBerlin(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

// ---- search --------------------------------------------------------------------

export async function searchRoebel(db: Db, tenant: TenantRef, args: { query: string }) {
  const SITE = site(tenant).origin;
  const q = sanitizeSearch(args.query.trim());
  const like = `%${q}%`;
  const [events, news, businesses, listings, proposals, deals] = await Promise.all([
    db
      .from("events")
      .select("id, title, description, date, location")
      .eq("status", "approved")
      .or(`title.ilike.${like},description.ilike.${like},location.ilike.${like}`)
      .order("date", { ascending: false })
      .limit(5),
    db
      .from("news_articles")
      .select("title, slug, excerpt, published_at")
      .eq("status", "published")
      .or(`title.ilike.${like},excerpt.ilike.${like}`)
      .order("published_at", { ascending: false })
      .limit(5),
    db
      .from("businesses")
      .select("name, slug, description, category")
      .eq("status", "published")
      .or(`name.ilike.${like},description.ilike.${like}`)
      .limit(5),
    db
      .from("marketplace_listings")
      .select("id, title, description, price, listing_type")
      .eq("status", "active")
      .or(`title.ilike.${like},description.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(5),
    db
      .from("proposals")
      .select("proposal_id, proposal_number, title, summary, state")
      .or(`title.ilike.${like},summary.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(5),
    db
      .from("business_deals")
      .select("id, title, description, businesses!inner(name)")
      .eq("is_active", true)
      .or(`title.ilike.${like},description.ilike.${like}`)
      .limit(5),
  ]);
  return {
    events: (events.data ?? []).map((e) => ({ ...e, url: `${SITE}/app/events/${e.id}` })),
    news: (news.data ?? []).map((n) => ({ ...n, url: `${SITE}/app/news/${n.slug}` })),
    businesses: (businesses.data ?? []).map((b) => ({ ...b, url: `${SITE}/app/gewerbe/${b.slug}` })),
    marketplace: (listings.data ?? []).map((m) => ({ ...m, url: `${SITE}/app/marktplatz/${m.id}` })),
    proposals: (proposals.data ?? []).map((p) => ({ ...p, url: `${SITE}/app/proposals/${p.proposal_id}` })),
    deals: deals.data ?? [],
  };
}

/** Orgs (Vereine, Gastro, Unternehmen …) matching a query — used by the harness search. */
export async function searchOrgs(db: Db, tenant: TenantRef, args: { query: string; limit?: number }) {
  const SITE = site(tenant).origin;
  const q = sanitizeSearch(args.query.trim());
  const { data } = await db
    .from("accounts")
    .select("name, slug, sub_type, bio")
    .eq("account_type", "organisation")
    .not("slug", "is", null)
    .or(`name.ilike.%${q}%,bio.ilike.%${q}%`)
    .limit(args.limit ?? 5);
  return (data ?? []).map((a) => ({ ...a, url: `${SITE}/app/orgs/${a.slug}` }));
}

// ---- events --------------------------------------------------------------------

export async function listEvents(
  db: Db,
  tenant: TenantRef,
  args: { limit: number; upcoming: boolean; query?: string; from?: string; to?: string },
) {
  const SITE = site(tenant).origin;
  let q = db
    .from("events")
    .select("id, title, description, date, time, end_time, location, category, ticket_price, is_cancelled")
    .eq("status", "approved");
  if (args.query) {
    const like = `%${sanitizeSearch(args.query)}%`;
    q = q.or(`title.ilike.${like},description.ilike.${like},location.ilike.${like}`);
  }
  if (args.from) q = q.gte("date", args.from);
  if (args.to) q = q.lte("date", args.to);
  if (args.upcoming) {
    if (!args.from) q = q.gte("date", new Date().toISOString().slice(0, 10));
    q = q.order("date", { ascending: true });
  } else {
    q = q.order("date", { ascending: false });
  }
  const { data, error } = await q.limit(args.limit);
  if (error) throw new Error(error.message);
  return { events: (data ?? []).map((e) => ({ ...e, url: `${SITE}/app/events/${e.id}` })) };
}

export async function getEvent(db: Db, tenant: TenantRef, args: { id: string }) {
  const SITE = site(tenant).origin;
  const { data, error } = await db
    .from("events")
    .select(
      "id, title, description, date, time, end_time, location, formatted_address, category, ticket_price, max_attendees, website_url, organizer_name, is_cancelled, is_recurring, livestream_url, image_url, accounts:account_id(name, slug)",
    )
    .eq("status", "approved")
    .eq("id", args.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [{ count: interested }, { data: ticketTypes }] = await Promise.all([
    db.from("event_interests").select("id", { count: "exact", head: true }).eq("event_id", args.id),
    db
      .from("ticket_types")
      .select("name, price_cents, currency, capacity, sales_start, sales_end")
      .eq("event_id", args.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);
  const org = (Array.isArray(data.accounts) ? data.accounts[0] : data.accounts) as
    | { name: string; slug: string | null }
    | null;
  const { accounts: _accounts, ...rest } = data as typeof data & { accounts: unknown };
  return {
    ...rest,
    veranstalter:
      [org?.name, data.organizer_name].find((n) => n && !looksLikeWallet(n)) ?? null,
    veranstalter_url: org?.slug ? `${SITE}/app/orgs/${org.slug}` : null,
    interessiert: interested ?? 0,
    tickets: (ticketTypes ?? []).map((t) => ({
      name: t.name,
      preis: `${(t.price_cents / 100).toFixed(2).replace(".", ",")} ${String(t.currency ?? "eur").toUpperCase()}`,
      kontingent: t.capacity,
      verkauf_bis: t.sales_end,
    })),
    url: `${SITE}/app/events/${data.id}`,
  };
}

// ---- news ----------------------------------------------------------------------

export async function listNews(db: Db, tenant: TenantRef, args: { limit: number }) {
  const SITE = site(tenant).origin;
  const { data, error } = await db
    .from("news_articles")
    .select("title, slug, excerpt, category, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(args.limit);
  if (error) throw new Error(error.message);
  return { articles: (data ?? []).map((n) => ({ ...n, url: `${SITE}/app/news/${n.slug}` })) };
}

/** Org blog articles (Vereine/Gewerbe schreiben selbst). */
export async function listBlogArticles(db: Db, tenant: TenantRef, args: { limit: number }) {
  const SITE = site(tenant).origin;
  const { data, error } = await db
    .from("blog_articles")
    .select("id, title, excerpt, category, published_at, accounts!blog_articles_account_id_fkey(name)")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(args.limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((b) => {
    const acc = (Array.isArray(b.accounts) ? b.accounts[0] : b.accounts) as { name: string } | null;
    return {
      id: b.id,
      title: b.title,
      excerpt: b.excerpt,
      category: b.category,
      published_at: b.published_at,
      von: acc?.name ?? null,
      url: `${SITE}/app/blog/${b.id}`,
    };
  });
}

export async function getNewsArticle(db: Db, tenant: TenantRef, args: { slug: string }) {
  const SITE = site(tenant).origin;
  const { data, error } = await db
    .from("news_articles")
    .select("title, slug, excerpt, content, category, tags, author_name, published_at")
    .eq("status", "published")
    .eq("slug", args.slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { ...data, url: `${SITE}/app/news/${data.slug}` };
}

/** Org blog article by id (fallback for get_news_article). */
export async function getBlogArticle(db: Db, tenant: TenantRef, args: { id: string }) {
  const SITE = site(tenant).origin;
  if (!/^[0-9a-f-]{36}$/i.test(args.id)) return null;
  const { data, error } = await db
    .from("blog_articles")
    .select("id, title, excerpt, content, category, published_at, accounts!blog_articles_account_id_fkey(name)")
    .eq("status", "published")
    .eq("id", args.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const acc = (Array.isArray(data.accounts) ? data.accounts[0] : data.accounts) as { name: string } | null;
  const { accounts: _a, ...rest } = data as typeof data & { accounts: unknown };
  return { ...rest, von: acc?.name ?? null, url: `${SITE}/app/blog/${data.id}` };
}

// ---- proposals -------------------------------------------------------------------

export async function listProposals(db: Db, tenant: TenantRef, args: { limit: number }) {
  const SITE = site(tenant).origin;
  const { data, error } = await db
    .from("proposals")
    .select(
      "proposal_id, proposal_number, title, summary, category, state, for_votes, against_votes, abstain_votes, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(args.limit);
  if (error) throw new Error(error.message);
  return {
    proposals: (data ?? []).map((p) => ({ ...p, url: `${SITE}/app/proposals/${p.proposal_id}` })),
  };
}

/** OpenZeppelin Governor ProposalState → German label. */
export const PROPOSAL_STATE_LABEL: Record<number, string> = {
  0: "Ausstehend",
  1: "Abstimmung läuft",
  2: "Abgebrochen",
  3: "Abgelehnt",
  4: "Angenommen",
  5: "In Warteschlange",
  6: "Abgelaufen",
  7: "Umgesetzt",
};

// ---- businesses, orgs, deals, marketplace ----------------------------------------

export async function listBusinesses(db: Db, tenant: TenantRef, args: { limit: number; category?: string }) {
  const SITE = site(tenant).origin;
  let q = db
    .from("businesses")
    .select("name, slug, description, category, address, website_url, opening_hours, is_roebel_partner")
    .eq("status", "published")
    .order("is_featured", { ascending: false });
  if (args.category) q = q.eq("category", args.category);
  const { data, error } = await q.limit(args.limit);
  if (error) throw new Error(error.message);
  return { businesses: (data ?? []).map((b) => ({ ...b, url: `${SITE}/app/gewerbe/${b.slug}` })) };
}

export const ORG_KIND_LABEL: Record<string, string> = {
  verein: "Verein",
  restaurant: "Gastronomie",
  unternehmen: "Unternehmen",
  fraktion: "Fraktion",
  stadt: "Stadt/Verwaltung",
  gewerbe: "Gewerbe",
};

export type OrgKind = "verein" | "restaurant" | "unternehmen" | "fraktion" | "stadt" | "gewerbe";

export interface OrgSummary {
  name: string;
  art: string;
  slug: string | null;
  beschreibung: string | null;
  adresse: string | null;
  url: string | null;
}

/**
 * Community orgs: app accounts of type organisation (Vereine, Gastro,
 * Unternehmen, Fraktionen, Stadt) plus the separate Gewerbe directory.
 * Pending/rejected external orgs are left out.
 */
export async function listOrgs(
  db: Db,
  tenant: TenantRef,
  args: { kind?: OrgKind; query?: string; limit: number },
): Promise<{ orgs: OrgSummary[] }> {
  const SITE = site(tenant).origin;
  const like = args.query ? `%${sanitizeSearch(args.query)}%` : null;
  const wantAccounts = args.kind !== "gewerbe";
  const wantBusinesses = !args.kind || args.kind === "gewerbe" || args.kind === "unternehmen";

  const [acc, biz] = await Promise.all([
    wantAccounts
      ? (() => {
          let q = db
            .from("accounts")
            .select("name, slug, sub_type, bio, address, is_verified, extern_status")
            .eq("account_type", "organisation")
            .not("slug", "is", null)
            .order("is_verified", { ascending: false })
            .order("name", { ascending: true });
          if (args.kind) q = q.eq("sub_type", args.kind);
          if (like) q = q.or(`name.ilike.${like},bio.ilike.${like}`);
          return q.limit(60);
        })()
      : Promise.resolve({ data: [] as never[] }),
    wantBusinesses
      ? (() => {
          let q = db
            .from("businesses")
            .select("name, slug, description, category, address")
            .eq("status", "published")
            .order("is_featured", { ascending: false });
          if (like) q = q.or(`name.ilike.${like},description.ilike.${like}`);
          return q.limit(40);
        })()
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const out: OrgSummary[] = [];
  const seen = new Set<string>();
  for (const a of (acc.data ?? []) as {
    name: string;
    slug: string | null;
    sub_type: string | null;
    bio: string | null;
    address: string | null;
    extern_status: string | null;
  }[]) {
    if (a.extern_status && a.extern_status !== "approved") continue;
    seen.add(a.name.trim().toLowerCase());
    out.push({
      name: a.name,
      art: ORG_KIND_LABEL[a.sub_type ?? ""] ?? "Organisation",
      slug: a.slug,
      beschreibung: a.bio,
      adresse: a.address,
      url: a.slug ? `${SITE}/app/orgs/${a.slug}` : null,
    });
  }
  for (const b of (biz.data ?? []) as {
    name: string;
    slug: string;
    description: string | null;
    category: string | null;
    address: string | null;
  }[]) {
    if (seen.has(b.name.trim().toLowerCase())) continue;
    out.push({
      name: b.name,
      art: b.category ? `Gewerbe (${b.category})` : "Gewerbe",
      slug: b.slug,
      beschreibung: b.description,
      adresse: b.address,
      url: `${SITE}/app/gewerbe/${b.slug}`,
    });
  }
  return { orgs: out.slice(0, args.limit) };
}

/** One org by slug: app org account first, then the Gewerbe directory, then Gastro. */
export async function getOrg(db: Db, tenant: TenantRef, args: { slug: string }) {
  const SITE = site(tenant).origin;
  const slug = args.slug.trim();
  const { data: acc } = await db
    .from("accounts")
    .select("id, name, slug, sub_type, bio, address, opening_hours, is_verified, extern_status")
    .eq("account_type", "organisation")
    .eq("slug", slug)
    .maybeSingle();
  if (acc && (!acc.extern_status || acc.extern_status === "approved")) {
    const today = todayBerlin();
    const [events, restaurant, blog, members] = await Promise.all([
      db
        .from("events")
        .select("id, title, date, time, location")
        .eq("status", "approved")
        .eq("account_id", acc.id)
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(5),
      db.from("restaurants").select("slug").eq("account_id", acc.id).eq("status", "published").maybeSingle(),
      db
        .from("blog_articles")
        .select("id, title, published_at")
        .eq("status", "published")
        .eq("account_id", acc.id)
        .order("published_at", { ascending: false })
        .limit(3),
      db.from("account_owners").select("account_id", { count: "exact", head: true }).eq("account_id", acc.id),
    ]);
    return {
      name: acc.name,
      art: ORG_KIND_LABEL[acc.sub_type ?? ""] ?? "Organisation",
      verifiziert: !!acc.is_verified,
      beschreibung: acc.bio,
      adresse: acc.address,
      oeffnungszeiten: acc.opening_hours,
      mitglieder_in_der_app: members.count ?? null,
      hat_speisekarte: !!restaurant.data,
      naechste_veranstaltungen: (events.data ?? []).map((e) => ({
        ...e,
        url: `${SITE}/app/events/${e.id}`,
      })),
      blog: (blog.data ?? []).map((b) => ({ ...b, url: `${SITE}/app/blog/${b.id}` })),
      url: `${SITE}/app/orgs/${acc.slug}`,
    };
  }

  const { data: biz } = await db
    .from("businesses")
    .select("id, name, slug, description, category, address, website_url, opening_hours, is_roebel_partner")
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();
  if (biz) {
    const { data: deals } = await db
      .from("business_deals")
      .select("id, title, deal_type, deal_value, end_date")
      .eq("business_id", biz.id)
      .eq("is_active", true)
      .limit(5);
    const { id: _id, ...rest } = biz;
    return {
      ...rest,
      art: "Gewerbe",
      angebote: (deals ?? []).map((d) => ({ ...d, url: `${SITE}/app/angebote/${d.id}` })),
      url: `${SITE}/app/gewerbe/${biz.slug}`,
    };
  }

  const { data: rest } = await db
    .from("restaurants")
    .select("name, slug, description, address, website_url, accounts:account_id(slug)")
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();
  if (rest) {
    const acc2 = (Array.isArray(rest.accounts) ? rest.accounts[0] : rest.accounts) as { slug: string | null } | null;
    return {
      name: rest.name,
      art: "Gastronomie",
      beschreibung: rest.description,
      adresse: rest.address,
      website_url: rest.website_url,
      hat_speisekarte: true,
      url: acc2?.slug ? `${SITE}/app/orgs/${acc2.slug}` : null,
    };
  }
  return null;
}

export async function listDeals(db: Db, _tenant: TenantRef, args: { limit: number }) {
  const { data, error } = await db
    .from("business_deals")
    .select("id, title, description, deal_type, deal_value, start_date, end_date, businesses!inner(name, slug)")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(args.limit);
  if (error) throw new Error(error.message);
  return { deals: data ?? [] };
}

export async function listMarketplace(
  db: Db,
  tenant: TenantRef,
  args: { limit: number; query?: string; listingType?: string },
) {
  const SITE = site(tenant).origin;
  let q = db
    .from("marketplace_listings")
    .select("id, title, description, price, price_type, category, condition, listing_type, created_at")
    .eq("status", "active");
  if (args.query) {
    const like = `%${sanitizeSearch(args.query)}%`;
    q = q.or(`title.ilike.${like},description.ilike.${like}`);
  }
  if (args.listingType) q = q.eq("listing_type", args.listingType);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(args.limit);
  if (error) throw new Error(error.message);
  return { listings: (data ?? []).map((m) => ({ ...m, url: `${SITE}/app/marktplatz/${m.id}` })) };
}

export async function listMiniApps(db: Db, _tenant: TenantRef) {
  const { data, error } = await db
    .from("mini_apps")
    .select("name, slug, description, category, tags, home_url, featured")
    .eq("status", "live")
    .order("featured", { ascending: false });
  if (error) throw new Error(error.message);
  return { apps: data ?? [] };
}

// ---- feed ------------------------------------------------------------------------

export interface FeedPostRow {
  id: string;
  wallet_address: string | null;
  content: string | null;
  category: string | null;
  post_type: string | null;
  likes_count: number | null;
  comments_count: number | null;
  created_at: string;
  video_url: string | null;
  media_urls: string[] | null;
  accounts: { name: string | null; account_type: string | null } | { name: string | null }[] | null;
}

/** Author label for a feed post: org/personal account name, else app user name. */
export function feedAuthor(
  row: Pick<FeedPostRow, "accounts" | "wallet_address">,
  userNames: Map<string, string>,
): string {
  const acc = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
  if (acc?.name && !looksLikeWallet(acc.name)) return acc.name;
  const w = row.wallet_address?.toLowerCase();
  return (w && userNames.get(w)) || "Jemand aus Röbel";
}

/** Map wallets → display name (never returns the wallet itself). */
export async function userNamesByWallet(db: Db, wallets: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(wallets.filter(Boolean).map((w) => w.toLowerCase()))];
  const map = new Map<string, string>();
  if (!uniq.length) return map;
  const { data } = await db.from("users").select("wallet_address, display_name, username").in("wallet_address", uniq);
  for (const u of data ?? []) {
    const name = u.display_name || (u.username ? `@${u.username}` : null);
    if (name) map.set(String(u.wallet_address).toLowerCase(), name);
  }
  return map;
}

export async function listFeedPosts(db: Db, tenant: TenantRef, args: { limit: number; query?: string }) {
  const SITE = site(tenant).origin;
  let q = db
    .from("posts")
    .select(
      "id, wallet_address, content, category, post_type, likes_count, comments_count, created_at, video_url, media_urls, accounts!posts_account_id_fkey(name, account_type)",
    )
    .eq("status", "published")
    .eq("feed_type", "main")
    .is("hidden_at", null)
    .or("moderation_status.is.null,moderation_status.neq.flagged");
  if (args.query) q = q.ilike("content", `%${sanitizeSearch(args.query)}%`);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(args.limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as FeedPostRow[];
  const names = await userNamesByWallet(
    db,
    rows.filter((r) => !(Array.isArray(r.accounts) ? r.accounts[0]?.name : r.accounts?.name)).map((r) => r.wallet_address ?? ""),
  );
  return { posts: rows.map((r) => formatFeedPost(r, names, SITE)) };
}

export function formatFeedPost(r: FeedPostRow, names: Map<string, string>, origin: string) {
  return {
    von: feedAuthor(r, names),
    text: r.content,
    kategorie: r.category,
    medien: (r.media_urls?.length ?? 0) + (r.video_url ? 1 : 0),
    likes: r.likes_count ?? 0,
    kommentare: r.comments_count ?? 0,
    erstellt: r.created_at,
    url: `${origin}/app/posts/${r.id}`,
  };
}

// ---- menus -----------------------------------------------------------------------

/** Restaurant menu by restaurant slug, org slug or name fragment. */
export async function getMenu(db: Db, tenant: TenantRef, args: { restaurant: string }) {
  const SITE = site(tenant).origin;
  const key = sanitizeSearch(args.restaurant);
  const select = "id, name, slug, description, address, accounts:account_id(slug)";
  let { data: r } = await db.from("restaurants").select(select).eq("status", "published").eq("slug", key).maybeSingle();
  if (!r) {
    const { data: acc } = await db.from("accounts").select("id").eq("slug", key).maybeSingle();
    if (acc) {
      ({ data: r } = await db.from("restaurants").select(select).eq("status", "published").eq("account_id", acc.id).maybeSingle());
    }
  }
  if (!r) {
    const { data: byName } = await db
      .from("restaurants")
      .select(select)
      .eq("status", "published")
      .ilike("name", `%${key}%`)
      .limit(1);
    r = byName?.[0] ?? null;
  }
  if (!r) return null;
  const [{ data: cats }, { data: items }] = await Promise.all([
    db.from("menu_categories").select("id, name, sort_order").eq("restaurant_id", r.id).eq("is_active", true).order("sort_order"),
    db
      .from("menu_items")
      .select("category_id, name, description, price, is_vegetarian, is_vegan")
      .eq("restaurant_id", r.id)
      .eq("is_available", true)
      .order("sort_order"),
  ]);
  const acc = (Array.isArray(r.accounts) ? r.accounts[0] : r.accounts) as { slug: string | null } | null;
  const orgUrl = acc?.slug ? `${SITE}/app/orgs/${acc.slug}` : null;
  const byCat = new Map<string | null, { name: string; preis: string | null; info: string | null; veg: string | null }[]>();
  for (const it of items ?? []) {
    const list = byCat.get(it.category_id) ?? [];
    list.push({
      name: it.name,
      preis: it.price != null ? `${Number(it.price).toFixed(2).replace(".", ",")} €` : null,
      info: it.description,
      veg: it.is_vegan ? "vegan" : it.is_vegetarian ? "vegetarisch" : null,
    });
    byCat.set(it.category_id, list);
  }
  const kategorien = (cats ?? []).map((c) => ({ name: c.name, gerichte: byCat.get(c.id) ?? [] }));
  const loose = byCat.get(null);
  if (loose?.length) kategorien.push({ name: "Weitere", gerichte: loose });
  return {
    restaurant: r.name,
    beschreibung: r.description,
    adresse: r.address,
    kategorien: kategorien.filter((k) => k.gerichte.length > 0),
    url: orgUrl ? `${orgUrl}` : null,
  };
}

// ---- Abfallkalender ----------------------------------------------------------------

export const WASTE_FRACTION_LABEL: Record<string, string> = {
  restmuell: "Restmüll",
  bio: "Bioabfall",
  papier: "Papier",
  gelbe_tonne: "Gelbe Tonne",
  schadstoff: "Schadstoffmobil",
  weihnachtsbaum: "Weihnachtsbaum",
};

export async function abfallkalender(
  db: Db,
  tenant: TenantRef,
  args: { fraction?: string; limit: number; from?: string },
) {
  const t = site(tenant);
  let q = db
    .from("waste_collection")
    .select("pickup_date, fraction, summary")
    .eq("node_id", t.wasteNodeId)
    .gte("pickup_date", args.from ?? todayBerlin())
    .order("pickup_date", { ascending: true });
  if (args.fraction) q = q.eq("fraction", args.fraction);
  const { data, error } = await q.limit(args.limit);
  if (error) throw new Error(error.message);
  return {
    termine: (data ?? []).map((p) => ({
      datum: p.pickup_date,
      wochentag: new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: "UTC" }).format(
        new Date(`${p.pickup_date}T12:00:00Z`),
      ),
      art: WASTE_FRACTION_LABEL[p.fraction] ?? p.fraction,
      hinweis: p.summary,
    })),
    quelle: "Abfuhrkalender Landkreis Mecklenburgische Seenplatte (Röbel)",
  };
}
