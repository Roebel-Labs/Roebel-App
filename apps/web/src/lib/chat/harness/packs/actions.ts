// Pack 'actions' (spec §4, wave 2): public actions in the Röbel app, executed
// server-side with the service role and attributed to ctx.wallet. Each tool
// reproduces the app's own write path (same table, columns, status and gates);
// DB triggers (pushes, counters, notifications) fire as they do for the app.
// preview() validates gates + input before a card exists; execute() re-checks.
// Wallet addresses never appear in summaries, previews or tool outputs.
import { z } from "zod";
import { startOfZonedDay } from "../../time";
import { ToolInputError } from "../errors";
import { resolveRecipient } from "../recipients";
import type { ResolvedRecipient } from "../recipients";
import type { ApprovalPreview, HarnessContext, HarnessTool, ToolRegistry } from "../types";

// ---- shared helpers ------------------------------------------------------------------

async function adminDb() {
  const { createAdminClient } = await import("../../../supabase/admin");
  return createAdminClient();
}

/** Per-tool guardrails on top of the global daily cap (executed per Berlin day). */
export const TOOL_DAILY_LIMITS: Record<string, number> = {
  create_feed_post: 3,
  submit_event: 3,
  create_org_event: 5,
  create_listing: 5,
  send_email: 5,
};

export const EVENT_CATEGORIES = ["Kultur", "Musik", "Essen & Trinken", "Kirchliches", "Ausstellungen", "Stadt", "Sport", "Sonstige"] as const;
export const PRODUCT_CATEGORIES = ["moebel", "elektronik", "kleidung", "fahrzeuge", "sport", "garten", "haushalt", "spielzeug", "buecher", "immobilien", "sonstiges"] as const;
export const SERVICE_CATEGORIES = ["handwerk", "transport", "garten", "reinigung", "betreuung", "nachhilfe", "sport", "sonstiges"] as const;
const SERVICE_ONLY = new Set<string>(SERVICE_CATEGORIES.filter((c) => !(PRODUCT_CATEGORIES as readonly string[]).includes(c)));
const LISTING_CATEGORIES = [...new Set<string>([...PRODUCT_CATEGORIES, ...SERVICE_CATEGORIES])];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
const ADDRESS_RE = /0x[0-9a-fA-F]{40}/;

export function clip(s: string, n: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function limitReached(tool: string): string {
  return `Das Tageslimit für diese Aktion (${TOOL_DAILY_LIMITS[tool]} pro Tag) ist erreicht. Morgen geht es weiter.`;
}

/** Text the model wants to publish must not leak wallet addresses. */
export function assertNoAddress(...texts: (string | null | undefined)[]): void {
  if (texts.some((t) => t && ADDRESS_RE.test(t))) {
    throw new ToolInputError("Bitte keine Wallet-Adressen in öffentliche Texte schreiben.");
  }
}

function authorName(ctx: HarnessContext): string {
  return ctx.profile?.displayName?.trim() || (ctx.profile?.username ? `@${ctx.profile.username}` : "") || "einer Person aus der Röbel-App";
}

/** DB seam (tests replace these). */
export const actionsDeps = {
  async userRow(wallet: string): Promise<{ is_verified_citizen: boolean | null; tier: string | null; email: string | null; display_name: string | null } | null> {
    const res = await (await adminDb()).from("users").select("is_verified_citizen, tier, email, display_name")
      .eq("wallet_address", wallet.toLowerCase()).limit(1).maybeSingle();
    if (res.error) throw new Error(`[actions] users: ${res.error.message}`);
    return res.data as never;
  },
  /** The wallet's personal account id (account_owners → accounts.account_type='personal'). */
  async personalAccountId(wallet: string): Promise<string | null> {
    const res = await (await adminDb()).from("account_owners").select("account_id, accounts(account_type)")
      .eq("wallet_address", wallet.toLowerCase()).limit(30);
    if (res.error) throw new Error(`[actions] account_owners: ${res.error.message}`);
    for (const r of (res.data ?? []) as { account_id: string; accounts: { account_type: string } | { account_type: string }[] | null }[]) {
      const acc = Array.isArray(r.accounts) ? r.accounts[0] : r.accounts;
      if (acc?.account_type === "personal") return r.account_id;
    }
    return null;
  },
  async executedToday(wallet: string, tool: string): Promise<number> {
    const res = await (await adminDb()).from("agent_actions").select("id", { count: "exact", head: true })
      .eq("wallet", wallet).eq("tool", tool).eq("status", "executed")
      .gte("executed_at", startOfZonedDay(new Date()).toISOString());
    if (res.error) throw new Error(`[actions] count: ${res.error.message}`);
    return res.count ?? 0;
  },
  async resolve(query: string, ctx: HarnessContext): Promise<ResolvedRecipient> {
    return resolveRecipient(await adminDb(), query, ctx.wallet);
  },
  async post(postId: string): Promise<{ id: string; content: string; status: string } | null> {
    const res = await (await adminDb()).from("posts").select("id, content, status").eq("id", postId).maybeSingle();
    if (res.error) throw new Error(`[actions] posts: ${res.error.message}`);
    return res.data as never;
  },
  /** Org role check (account_owners, owner/admin) + org name and contact email. */
  async orgForManager(wallet: string, orgId: string): Promise<{ id: string; name: string; contact_email: string | null } | null> {
    const db = await adminDb();
    const own = await db.from("account_owners").select("role").eq("account_id", orgId)
      .eq("wallet_address", wallet.toLowerCase()).in("role", ["owner", "admin"]).limit(1).maybeSingle();
    if (own.error) throw new Error(`[actions] org owner: ${own.error.message}`);
    if (!own.data) return null;
    const acc = await db.from("accounts").select("id, name, contact_email, account_type").eq("id", orgId).maybeSingle();
    if (acc.error) throw new Error(`[actions] accounts: ${acc.error.message}`);
    const row = acc.data as { id: string; name: string; contact_email: string | null; account_type: string } | null;
    return row && row.account_type === "organisation" ? row : null;
  },
};

async function checkLimit(tool: string, ctx: HarnessContext): Promise<void> {
  const limit = TOOL_DAILY_LIMITS[tool];
  if (limit && (await actionsDeps.executedToday(ctx.wallet, tool)) >= limit) throw new ToolInputError(limitReached(tool));
}

async function requireCitizen(ctx: HarnessContext): Promise<void> {
  const u = await actionsDeps.userRow(ctx.wallet);
  if (!u) throw new ToolInputError("Dafür braucht der Mensch ein Profil in der Röbel-App.");
  // Same gate as the web createPost action (column drift: tier='citizen' counts too).
  if (!(u.is_verified_citizen || u.tier === "citizen")) {
    throw new ToolInputError(
      "Beiträge im Röbel-Feed kann Mecky nur für verifizierte Bürgerinnen und Bürger veröffentlichen. " +
      "Der Mensch kann den Beitrag selbst in der App posten (dort gelten Standort- und Wartezeit-Regeln).",
    );
  }
}

async function requirePersonalAccount(ctx: HarnessContext): Promise<string> {
  const id = await actionsDeps.personalAccountId(ctx.wallet);
  if (!id) throw new ToolInputError("Dafür braucht der Mensch ein Profil in der Röbel-App.");
  return id;
}

// ---- pure validation (unit-tested) -----------------------------------------------------

export function allowedImageHost(url: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  let sb = "";
  try { sb = supabaseUrl ? new URL(supabaseUrl).hostname.toLowerCase() : ""; } catch { /* none */ }
  return host === sb || host === "roebel.app" || host.endsWith(".roebel.app") || host.endsWith(".supabase.co");
}

/** yyyy-mm-dd, a real calendar date, not before today (Berlin). */
export function validateEventDate(date: string, now = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) throw new ToolInputError("Datum bitte als JJJJ-MM-TT angeben, z. B. 2026-10-03.");
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
    throw new ToolInputError("Dieses Datum gibt es nicht.");
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  if (date.trim() < today) throw new ToolInputError("Das Datum liegt in der Vergangenheit.");
  if (+m[1] > now.getUTCFullYear() + 2) throw new ToolInputError("Das Datum liegt zu weit in der Zukunft.");
  return date.trim();
}

/** HH:mm (24h) or empty. */
export function validateTime(time: string | undefined | null): string | null {
  if (!time || !time.trim()) return null;
  const m = /^(\d{1,2})[:.](\d{2})(?:\s*Uhr)?$/i.exec(time.trim());
  if (!m || +m[1] > 23 || +m[2] > 59) throw new ToolInputError("Uhrzeit bitte als HH:MM angeben, z. B. 19:30.");
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function normalizeEventCategory(c: string | undefined | null): string {
  if (!c) return "Sonstige";
  const hit = EVENT_CATEGORIES.find((x) => x.toLowerCase() === c.trim().toLowerCase());
  return hit ?? "Sonstige";
}

export function listingFields(input: { price?: number | null; category: string }): {
  price: number; price_type: "fixed" | "negotiable" | "free"; category: string; listing_type: "product" | "service";
} {
  const category = input.category.trim().toLowerCase();
  if (!LISTING_CATEGORIES.includes(category)) {
    throw new ToolInputError(`Unbekannte Kategorie. Erlaubt: ${LISTING_CATEGORIES.join(", ")}.`);
  }
  const listing_type = SERVICE_ONLY.has(category) ? "service" : "product";
  if (input.price === undefined || input.price === null) return { price: 0, price_type: "negotiable", category, listing_type };
  if (!Number.isFinite(input.price) || input.price < 0 || input.price > 1_000_000) throw new ToolInputError("Der Preis ist ungültig.");
  const price = Math.round(input.price * 100) / 100;
  return { price, price_type: price === 0 ? "free" : "fixed", category, listing_type };
}

export function formatEuro(n: number): string {
  return `${n.toLocaleString("de-DE", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
}

export function formatDateDe(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}

export function emailFooter(ctx: HarnessContext): string {
  return `\n\n--\nGesendet mit Mecky im Auftrag von ${authorName(ctx)}`;
}

/**
 * Chat uploads live in the private chat-media bucket behind 7-day signed links.
 * Anything published (post, event, listing) must outlive that, so an own chat
 * upload is copied into the public images bucket at execution time. Other URLs
 * (generated images, existing public files) pass through unchanged.
 */
export async function durableImageUrl(url: string | undefined, ctx: HarnessContext): Promise<string | undefined> {
  if (!url) return url;
  const { parseStorageUrl, IMAGE_BUCKET, IMAGE_PREFIX } = await import("./images");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const ref = parseStorageUrl(url, supabaseUrl);
  if (!ref || ref.bucket !== "chat-media") return url;
  if (!ref.path.startsWith(`${ctx.wallet.toLowerCase()}/`)) {
    throw new ToolInputError("Ich kann nur deine eigenen Fotos aus diesem Chat verwenden.");
  }
  const storage = (await adminDb()).storage;
  const dl = await storage.from("chat-media").download(ref.path);
  if (dl.error || !dl.data) throw new Error(`[actions] copy chat image: ${dl.error?.message ?? "empty"}`);
  const type = dl.data.type || "image/jpeg";
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  const path = `${IMAGE_PREFIX}/${ctx.threadId}/${crypto.randomUUID()}.${ext}`;
  // max-age=31536000 marks the object as processed so the weekly re-encode job skips it.
  const up = await storage.from(IMAGE_BUCKET).upload(path, dl.data, { contentType: type, cacheControl: "31536000", upsert: false });
  if (up.error) throw new Error(`[actions] copy chat image: ${up.error.message}`);
  return storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

const IMAGE_URL_HINT = "Optional: https-Bild-URL aus der Röbel-App (z. B. imageUrl von generate_image)";

/** Optional image of events/listings: our storage only (same rule as feed posts). */
function checkImageUrl(imageUrl: string | undefined): void {
  if (imageUrl && !allowedImageHost(imageUrl)) throw new ToolInputError("Bilder gehen nur als Datei aus der Röbel-App (https).");
}

// ---- create_feed_post ----------------------------------------------------------------

const feedInput = z.object({
  text: z.string().min(1).max(500).describe("Der Beitragstext (max. 500 Zeichen)"),
  imageUrl: z.string().url().max(1000).optional().describe(IMAGE_URL_HINT),
});
type FeedInput = z.infer<typeof feedInput>;

function validateFeed({ text, imageUrl }: FeedInput): void {
  if (!text.trim()) throw new ToolInputError("Der Beitrag ist leer.");
  assertNoAddress(text);
  if (imageUrl && !allowedImageHost(imageUrl)) throw new ToolInputError("Bilder gehen nur als Datei aus der Röbel-App (https).");
}

export const createFeedPost: HarnessTool<FeedInput> = {
  name: "create_feed_post",
  pack: "actions",
  risk: "public",
  description:
    "Veröffentlicht einen Beitrag im Röbel-Feed im Namen des Menschen (nur für verifizierte Bürger/innen, max. 3 pro Tag). " +
    "Alle in der App sehen ihn und bekommen eine Benachrichtigung. Schreib den fertigen Text; der Mensch gibt ihn frei.",
  inputSchema: feedInput,
  summarize: ({ text }) => `Beitrag im Röbel-Feed veröffentlichen: „${clip(text, 70)}“`,
  preview: async (input, ctx) => {
    validateFeed(input);
    await requireCitizen(ctx);
    await checkLimit("create_feed_post", ctx);
    return {
      kind: "post",
      fields: [{ label: "Wo", value: "Röbel-Feed (öffentlich)" }, { label: "Von", value: authorName(ctx) }],
      body: input.text.trim(),
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
    } satisfies ApprovalPreview;
  },
  execute: async (input, ctx) => {
    validateFeed(input);
    await requireCitizen(ctx);
    await checkLimit("create_feed_post", ctx);
    const accountId = await requirePersonalAccount(ctx);
    // Same row as apps/expo lib/supabase-posts createPost (citizen → no client moderation call).
    const res = await (await adminDb()).from("posts").insert({
      wallet_address: ctx.wallet.toLowerCase(),
      account_id: accountId,
      content: input.text.trim(),
      category: "generell",
      feed_type: "main",
      post_type: "user",
      media_urls: input.imageUrl ? [(await durableImageUrl(input.imageUrl, ctx))!] : [],
      status: "published",
    }).select("id").single();
    if (res.error) throw new Error(`[actions] create post: ${res.error.message}`);
    const id = (res.data as { id: string }).id;
    return { ok: true, postId: id, url: `${ctx.tenant.appOrigin}/app/posts/${id}`, info: "Beitrag im Röbel-Feed veröffentlicht." };
  },
};

// ---- comment_on_post -----------------------------------------------------------------

const commentInput = z.object({
  postId: z.string().describe("Die id des Feed-Beitrags (aus list_feed_posts)"),
  text: z.string().min(1).max(500).describe("Der Kommentar (max. 500 Zeichen)"),
});
type CommentInput = z.infer<typeof commentInput>;

async function loadCommentablePost(postId: string) {
  if (!UUID_RE.test(postId.trim())) throw new ToolInputError("Die Beitrags-id ist ungültig. Hol sie mit list_feed_posts.");
  const post = await actionsDeps.post(postId.trim());
  if (!post || post.status !== "published") throw new ToolInputError("Diesen Beitrag gibt es nicht (mehr).");
  return post;
}

export const commentOnPost: HarnessTool<CommentInput> = {
  name: "comment_on_post",
  pack: "actions",
  risk: "public",
  description: "Kommentiert einen Beitrag im Röbel-Feed im Namen des Menschen. Die postId kommt aus list_feed_posts.",
  inputSchema: commentInput,
  summarize: ({ text }) => `Kommentar im Röbel-Feed schreiben: „${clip(text, 70)}“`,
  preview: async ({ postId, text }, ctx) => {
    assertNoAddress(text);
    const post = await loadCommentablePost(postId);
    await requirePersonalAccount(ctx);
    return {
      kind: "post",
      fields: [{ label: "Zu", value: clip(post.content || "Beitrag", 90) }, { label: "Von", value: authorName(ctx) }],
      body: text.trim(),
    };
  },
  execute: async ({ postId, text }, ctx) => {
    assertNoAddress(text);
    const post = await loadCommentablePost(postId);
    const accountId = await requirePersonalAccount(ctx);
    // Same row as apps/expo lib/supabase-posts createComment; counts + notifications are triggers.
    const res = await (await adminDb()).from("post_comments").insert({
      post_id: post.id,
      wallet_address: ctx.wallet.toLowerCase(),
      account_id: accountId,
      content: text.trim(),
      media_urls: [],
    }).select("id").single();
    if (res.error) throw new Error(`[actions] comment: ${res.error.message}`);
    return { ok: true, commentId: (res.data as { id: string }).id, url: `${ctx.tenant.appOrigin}/app/posts/${post.id}`, info: "Kommentar veröffentlicht." };
  },
};

// ---- submit_event --------------------------------------------------------------------

const eventInput = z.object({
  title: z.string().min(2).max(150).describe("Titel der Veranstaltung"),
  date: z.string().describe("Datum JJJJ-MM-TT"),
  time: z.string().optional().describe("Beginn HH:MM (optional)"),
  location: z.string().min(2).max(200).describe("Ort, z. B. 'Marktplatz Röbel'"),
  description: z.string().min(1).max(3000).describe("Beschreibung"),
  category: z.string().optional().describe(`Kategorie: ${EVENT_CATEGORIES.join(", ")}`),
  imageUrl: z.string().url().max(1000).optional().describe(`${IMAGE_URL_HINT}, als Titelbild`),
});
type EventInput = z.infer<typeof eventInput>;

function normalizeEvent(i: EventInput) {
  assertNoAddress(i.title, i.description, i.location);
  checkImageUrl(i.imageUrl);
  return {
    title: i.title.trim(), date: validateEventDate(i.date), time: validateTime(i.time),
    location: i.location.trim(), description: i.description.trim(), category: normalizeEventCategory(i.category),
    imageUrl: i.imageUrl ?? null,
  };
}

function eventPreview(e: ReturnType<typeof normalizeEvent>, extra: { label: string; value: string }[]): ApprovalPreview {
  return {
    kind: "event",
    fields: [
      { label: "Titel", value: e.title },
      { label: "Wann", value: `${formatDateDe(e.date)}${e.time ? `, ${e.time} Uhr` : ""}` },
      { label: "Wo", value: e.location },
      { label: "Kategorie", value: e.category },
      ...extra,
    ],
    body: e.description,
    ...(e.imageUrl ? { imageUrl: e.imageUrl } : {}),
  };
}

async function organizerEmail(ctx: HarnessContext): Promise<string> {
  const u = await actionsDeps.userRow(ctx.wallet);
  const email = u?.email?.trim() ?? "";
  if (!EMAIL_RE.test(email)) {
    throw new ToolInputError("Für Veranstaltungen braucht die Röbel-App eine E-Mail-Adresse im Profil. Der Mensch kann sie im Profil ergänzen.");
  }
  return email;
}

async function geocode(location: string) {
  try {
    const { geocodeLocation } = await import("../../../utils/geocoding");
    return await geocodeLocation(location);
  } catch (err) {
    console.error("[actions] geocode", err);
    return null;
  }
}

export const submitEvent: HarnessTool<EventInput> = {
  name: "submit_event",
  pack: "actions",
  risk: "public",
  description:
    "Reicht eine Veranstaltung für den Röbel-Kalender ein (wie 'Veranstaltung einreichen' in der App). " +
    "Sie erscheint erst nach Prüfung durch das Röbel-Team. Für Veranstaltungen einer eigenen Organisation nutze create_org_event.",
  inputSchema: eventInput,
  summarize: ({ title, date }) => `Veranstaltung einreichen: „${clip(title, 60)}“ am ${date}`,
  preview: async (input, ctx) => {
    const e = normalizeEvent(input);
    await requirePersonalAccount(ctx);
    await organizerEmail(ctx);
    await checkLimit("submit_event", ctx);
    return eventPreview(e, [{ label: "Veranstalter", value: authorName(ctx) }, { label: "Status", value: "Wird vom Röbel-Team geprüft" }]);
  },
  execute: async (input, ctx) => {
    const e = normalizeEvent(input);
    const accountId = await requirePersonalAccount(ctx);
    const email = await organizerEmail(ctx);
    await checkLimit("submit_event", ctx);
    const place = await geocode(e.location);
    const db = await adminDb();
    // Same pipeline as app/submit-event (+ web submit-event action): status 'pending' → moderation queue.
    const res = await db.from("events").insert({
      title: e.title,
      description: e.description,
      date: e.date,
      time: e.time,
      location: e.location,
      organizer_name: authorName(ctx),
      organizer_email: email,
      category: e.category,
      image_url: (await durableImageUrl(e.imageUrl ?? undefined, ctx)) ?? null,
      ticket_price: 0,
      status: "pending",
      is_recurring: false,
      account_id: accountId,
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
      place_id: place?.place_id ?? null,
      formatted_address: place?.formatted_address ?? e.location,
      address_components: place?.address_components ?? null,
    }).select("id").single();
    if (res.error) throw new Error(`[actions] submit event: ${res.error.message}`);
    const id = (res.data as { id: string }).id;
    const dates = await db.from("event_dates").insert({ event_id: id, date: e.date });
    if (dates.error) console.error("[actions] event_dates", dates.error.message);
    return { ok: true, eventId: id, status: "pending", info: "Veranstaltung eingereicht. Sie erscheint nach Prüfung durch das Röbel-Team." };
  },
};

// ---- create_org_event ----------------------------------------------------------------

function managedOrgs(ctx: HarnessContext) {
  return (ctx.profile?.orgs ?? []).filter((o) => o.role === "owner" || o.role === "admin");
}

const orgEventInput = eventInput.extend({
  org: z.string().optional().describe("Name der Organisation (nur nötig, wenn der Mensch mehrere verwaltet)"),
  ticketPrice: z.number().min(0).max(10000).optional().describe("Eintritt in Euro (optional, 0 = frei)"),
});
type OrgEventInput = z.infer<typeof orgEventInput>;

export function pickManagedOrg(orgs: { id: string; name: string }[], name: string | undefined): { id: string; name: string } {
  if (!orgs.length) throw new ToolInputError("Der Mensch verwaltet keine Organisation in der App.");
  if (!name?.trim()) {
    if (orgs.length === 1) return orgs[0];
    throw new ToolInputError(`Für welche Organisation? Zur Wahl: ${orgs.map((o) => o.name).join(", ")}.`);
  }
  const q = name.trim().toLowerCase();
  const hits = orgs.filter((o) => o.name.trim().toLowerCase() === q);
  if (hits.length === 1) return hits[0];
  throw new ToolInputError(`Organisation „${name.trim()}“ nicht eindeutig. Zur Wahl: ${orgs.map((o) => o.name).join(", ")}.`);
}

async function loadOrg(input: OrgEventInput, ctx: HarnessContext) {
  const pick = pickManagedOrg(managedOrgs(ctx), input.org);
  const org = await actionsDeps.orgForManager(ctx.wallet, pick.id);
  if (!org) throw new ToolInputError("Keine Berechtigung für diese Organisation.");
  const email = org.contact_email?.trim() || (await actionsDeps.userRow(ctx.wallet))?.email?.trim() || "";
  if (!EMAIL_RE.test(email)) throw new ToolInputError("Die Organisation braucht eine Kontakt-E-Mail im Profil.");
  return { org, email };
}

export const createOrgEvent: HarnessTool<OrgEventInput> = {
  name: "create_org_event",
  pack: "actions",
  risk: "public",
  description:
    "Veröffentlicht eine Veranstaltung einer Organisation, die der Mensch verwaltet (Inhaber/Admin), direkt im Röbel-Kalender " +
    "(wie im Veranstaltungs-Dashboard).",
  inputSchema: orgEventInput,
  available: (ctx) => managedOrgs(ctx).length > 0,
  summarize: ({ title, date }) => `Veranstaltung veröffentlichen: „${clip(title, 60)}“ am ${date}`,
  preview: async (input, ctx) => {
    const e = normalizeEvent(input);
    const { org } = await loadOrg(input, ctx);
    await checkLimit("create_org_event", ctx);
    const price = input.ticketPrice ? formatEuro(input.ticketPrice) : "frei";
    return eventPreview(e, [{ label: "Veranstalter", value: org.name }, { label: "Eintritt", value: price }, { label: "Status", value: "Sofort öffentlich" }]);
  },
  execute: async (input, ctx) => {
    const e = normalizeEvent(input);
    const { org, email } = await loadOrg(input, ctx);
    await checkLimit("create_org_event", ctx);
    // Same insert as the web dashboard (app/actions/org-events createOrgEvent, publish = true).
    const res = await (await adminDb()).from("events").insert({
      title: e.title,
      description: e.description,
      date: e.date,
      time: e.time,
      location: e.location,
      category: e.category,
      image_url: (await durableImageUrl(e.imageUrl ?? undefined, ctx)) ?? null,
      organizer_name: org.name,
      organizer_email: email,
      ticket_price: input.ticketPrice ?? 0,
      is_cancelled: false,
      account_id: org.id,
      status: "approved",
    }).select("id").single();
    if (res.error) throw new Error(`[actions] org event: ${res.error.message}`);
    const id = (res.data as { id: string }).id;
    return { ok: true, eventId: id, url: `${ctx.tenant.appOrigin}/app/events/${id}`, info: `Veranstaltung für ${org.name} veröffentlicht.` };
  },
};

// ---- create_listing ------------------------------------------------------------------

const listingInput = z.object({
  title: z.string().min(2).max(120).describe("Titel des Inserats"),
  description: z.string().min(1).max(3000).describe("Beschreibung"),
  price: z.number().min(0).max(1_000_000).optional().describe("Preis in Euro; 0 = zu verschenken; weglassen = Verhandlungssache"),
  category: z.string().describe(`Kategorie: ${LISTING_CATEGORIES.join(", ")}`),
  imageUrl: z.string().url().max(1000).optional().describe(IMAGE_URL_HINT),
});
type ListingInput = z.infer<typeof listingInput>;

function priceLabel(f: ReturnType<typeof listingFields>): string {
  return f.price_type === "free" ? "Zu verschenken" : f.price_type === "negotiable" ? "Verhandlungssache" : formatEuro(f.price);
}

export const createListing: HarnessTool<ListingInput> = {
  name: "create_listing",
  pack: "actions",
  risk: "public",
  description: "Stellt ein Inserat (Produkt oder Dienstleistung) in den Röbel-Marktplatz, im Namen des Menschen. Es ist sofort sichtbar.",
  inputSchema: listingInput,
  summarize: ({ title }) => `Inserat im Marktplatz veröffentlichen: „${clip(title, 70)}“`,
  preview: async (input, ctx) => {
    assertNoAddress(input.title, input.description);
    checkImageUrl(input.imageUrl);
    const f = listingFields(input);
    await requirePersonalAccount(ctx);
    await checkLimit("create_listing", ctx);
    return {
      kind: "listing",
      fields: [
        { label: "Titel", value: input.title.trim() },
        { label: "Preis", value: priceLabel(f) },
        { label: "Kategorie", value: f.category },
        { label: "Von", value: authorName(ctx) },
      ],
      body: input.description.trim(),
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
    };
  },
  execute: async (input, ctx) => {
    assertNoAddress(input.title, input.description);
    checkImageUrl(input.imageUrl);
    const f = listingFields(input);
    await requirePersonalAccount(ctx);
    await checkLimit("create_listing", ctx);
    // Same row as apps/expo lib/supabase-marketplace createMarketplaceListing (personal → account_id null).
    const res = await (await adminDb()).from("marketplace_listings").insert({
      seller_wallet_address: ctx.wallet.toLowerCase(),
      title: input.title.trim(),
      description: input.description.trim(),
      price: f.price,
      price_type: f.price_type,
      category: f.category,
      listing_type: f.listing_type,
      condition: null,
      media_urls: input.imageUrl ? [(await durableImageUrl(input.imageUrl, ctx))!] : [],
      status: "active",
    }).select("id").single();
    if (res.error) throw new Error(`[actions] listing: ${res.error.message}`);
    const id = (res.data as { id: string }).id;
    return { ok: true, listingId: id, url: `${ctx.tenant.appOrigin}/app/marktplatz/${id}`, info: "Inserat im Marktplatz veröffentlicht." };
  },
};

// ---- send_direct_message (Supabase rail) ---------------------------------------------

const dmInput = z.object({
  recipient: z.string().min(1).max(80).describe("Benutzername (@name) oder genauer Anzeigename der Person"),
  text: z.string().min(1).max(2000).describe("Die Nachricht"),
});
type DmInput = z.infer<typeof dmInput>;

/** Stable participant order (apps/expo lib/supabase-messages orderParticipants). */
export function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function findOrCreateConversation(me: string, other: string): Promise<string> {
  const db = await adminDb();
  const [p1, p2] = orderPair(me, other);
  const find = () => db.from("conversations").select("id")
    .or(`and(participant_one_account_id.eq.${p1},participant_two_account_id.eq.${p2}),and(participant_one_account_id.eq.${p2},participant_two_account_id.eq.${p1})`)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  let found = await find();
  if (found.error) throw new Error(`[actions] conversation: ${found.error.message}`);
  let id = (found.data as { id: string } | null)?.id ?? null;
  if (!id) {
    const ins = await db.from("conversations").insert({
      participant_one: p1, participant_two: p2, participant_one_account_id: p1, participant_two_account_id: p2,
    }).select("id").single();
    if (ins.error) {
      found = await find();
      id = (found.data as { id: string } | null)?.id ?? null;
      if (!id) throw new Error(`[actions] conversation insert: ${ins.error.message}`);
    } else {
      id = (ins.data as { id: string }).id;
    }
  }
  const part = await db.from("conversation_participants").upsert([
    { conversation_id: id, wallet_address: p1, account_id: p1 },
    { conversation_id: id, wallet_address: p2, account_id: p2 },
  ], { onConflict: "conversation_id,wallet_address", ignoreDuplicates: true });
  if (part.error) console.error("[actions] conversation_participants", part.error.message);
  return id;
}

async function dmParties(recipient: string, ctx: HarnessContext) {
  const me = await requirePersonalAccount(ctx);
  const to = await actionsDeps.resolve(recipient, ctx);
  const other = await actionsDeps.personalAccountId(to.wallet);
  if (!other) throw new ToolInputError(`${to.name} kann in der App noch keine Nachrichten empfangen.`);
  if (other === me) throw new ToolInputError("Das bist du selbst. Bitte nenne eine andere Person.");
  return { me, other, to };
}

export const sendDirectMessage: HarnessTool<DmInput> = {
  name: "send_direct_message",
  pack: "actions",
  risk: "public",
  description:
    "Schickt eine Direktnachricht in der Röbel-App an eine Person (per @Benutzername oder genauem Anzeigenamen), im Namen des Menschen. " +
    "Gibt es mehrere Personen mit dem Namen, frag nach dem genauen @Benutzernamen.",
  inputSchema: dmInput,
  summarize: ({ recipient, text }) => `Nachricht an ${clip(recipient.replace(/^@+/, ""), 40)}: „${clip(text, 60)}“`,
  preview: async ({ recipient, text }, ctx) => {
    const { to } = await dmParties(recipient, ctx);
    return { kind: "message", fields: [{ label: "An", value: to.name }], body: text.trim() };
  },
  execute: async ({ recipient, text }, ctx) => {
    const { me, other, to } = await dmParties(recipient, ctx);
    const conversationId = await findOrCreateConversation(me, other);
    // Same row as apps/expo lib/supabase-messages sendMessage; the push is the DB trigger.
    const res = await (await adminDb()).from("direct_messages").insert({
      conversation_id: conversationId,
      sender_address: me,
      sender_account_id: me,
      content: text.trim(),
    }).select("id").single();
    if (res.error) throw new Error(`[actions] dm: ${res.error.message}`);
    return { ok: true, info: `Nachricht an ${to.name} gesendet.` };
  },
};

// ---- send_email (external, Resend) ---------------------------------------------------

const emailInput = z.object({
  to: z.string().max(200).describe("Genau eine E-Mail-Adresse"),
  subject: z.string().min(1).max(150).describe("Betreff"),
  body: z.string().min(1).max(5000).describe("Nachricht als reiner Text"),
});
type EmailInput = z.infer<typeof emailInput>;

export function validateEmailInput(i: EmailInput): { to: string; subject: string; body: string } {
  const to = i.to.trim();
  if (!EMAIL_RE.test(to)) throw new ToolInputError("Bitte genau eine gültige E-Mail-Adresse angeben.");
  const subject = i.subject.replace(/[\r\n]+/g, " ").trim();
  if (!subject) throw new ToolInputError("Der Betreff fehlt.");
  const body = i.body.replace(/\r\n/g, "\n").trim();
  if (!body) throw new ToolInputError("Die Nachricht ist leer.");
  return { to, subject, body };
}

export const sendEmail: HarnessTool<EmailInput> = {
  name: "send_email",
  pack: "actions",
  risk: "external",
  description:
    "Schickt eine E-Mail (reiner Text) im Auftrag des Menschen an genau eine Adresse, z. B. an die Stadt oder einen Verein. " +
    "Max. 5 pro Tag. Unter der Nachricht steht automatisch, dass Mecky sie im Auftrag des Menschen gesendet hat.",
  inputSchema: emailInput,
  available: () => Boolean(process.env.RESEND_API_KEY),
  summarize: ({ to, subject }) => `E-Mail an ${clip(to, 60)} senden: „${clip(subject, 60)}“`,
  preview: async (input, ctx) => {
    const e = validateEmailInput(input);
    await checkLimit("send_email", ctx);
    return {
      kind: "email",
      fields: [{ label: "An", value: e.to }, { label: "Betreff", value: e.subject }],
      body: `${e.body}${emailFooter(ctx)}`,
    };
  },
  execute: async (input, ctx) => {
    const e = validateEmailInput(input);
    await checkLimit("send_email", ctx);
    const { resend, EMAIL_CONFIG } = await import("../../../resend");
    if (!resend) throw new Error("E-Mail-Versand ist nicht eingerichtet.");
    const u = await actionsDeps.userRow(ctx.wallet).catch(() => null);
    const replyTo = u?.email && EMAIL_RE.test(u.email.trim()) ? u.email.trim() : undefined;
    const { error } = await resend.emails.send({
      from: EMAIL_CONFIG.fromNewsletter,
      to: e.to,
      subject: e.subject,
      text: `${e.body}${emailFooter(ctx)}`,
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) throw new Error(`E-Mail konnte nicht gesendet werden: ${error.message}`);
    return { ok: true, info: `E-Mail an ${e.to} gesendet.` };
  },
};

export const ACTION_TOOLS: HarnessTool[] = [
  createFeedPost, commentOnPost, submitEvent, createOrgEvent, createListing, sendDirectMessage, sendEmail,
] as HarnessTool[];

export function register(registry: ToolRegistry): void {
  for (const t of ACTION_TOOLS) registry.registerTool(t);
}
