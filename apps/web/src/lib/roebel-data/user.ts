// The signed-in user's own data, strictly scoped to their wallet. Wallet
// columns are only ever used as filters, never returned. Case-insensitive
// matching because a few legacy rows store checksummed addresses.
import { ORG_KIND_LABEL, type TenantRef } from "./public";
import { tenantSite, type Db } from "./tenant";

const WALLET_RE = /^0x[0-9a-f]{40}$/;

function origin(t: TenantRef) {
  return typeof t === "string" ? tenantSite(t).origin : tenantSite(t.id, t.appOrigin).origin;
}

/** Normalize + validate the wallet; throws on anything that isn't one address. */
export function walletFilter(wallet: string): string {
  const w = String(wallet ?? "").trim().toLowerCase();
  if (!WALLET_RE.test(w)) throw new Error("Kein gültiges Konto angemeldet.");
  return w;
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return (Array.isArray(v) ? v[0] : v) ?? null;
}

export async function getMyProfile(db: Db, tenant: TenantRef, wallet: string) {
  const w = walletFilter(wallet);
  const { data: u } = await db
    .from("users")
    .select(
      "display_name, username, bio, neighborhood, interests, vereine, tier, is_verified_citizen, verification_status, gamification_points, total_votes_cast, created_at",
    )
    .ilike("wallet_address", w)
    .maybeSingle();
  if (!u) return { gefunden: false };
  const orgs = await getMyOrgs(db, tenant, w);
  return {
    gefunden: true,
    name: u.display_name,
    benutzername: u.username ? `@${u.username}` : null,
    bio: u.bio,
    ortsteil: u.neighborhood,
    interessen: u.interests,
    vereine_angegeben: u.vereine,
    buerger_verifiziert: !!u.is_verified_citizen || u.tier === "citizen",
    verifizierungsstatus: u.verification_status,
    punkte: u.gamification_points ?? 0,
    abstimmungen: u.total_votes_cast ?? 0,
    dabei_seit: u.created_at,
    organisationen: orgs.orgs,
  };
}

export async function getMyOrgs(db: Db, tenant: TenantRef, wallet: string) {
  const w = walletFilter(wallet);
  const o = origin(tenant);
  const { data } = await db
    .from("account_owners")
    .select("role, accounts!inner(name, slug, account_type, sub_type, is_verified)")
    .ilike("wallet_address", w);
  const orgs = (data ?? [])
    .map((r) => ({ role: r.role as string, acc: one(r.accounts as unknown) as {
      name: string;
      slug: string | null;
      account_type: string;
      sub_type: string | null;
      is_verified: boolean;
    } | null }))
    .filter((r) => r.acc && r.acc.account_type === "organisation")
    .map(({ role, acc }) => ({
      name: acc!.name,
      art: ORG_KIND_LABEL[acc!.sub_type ?? ""] ?? "Organisation",
      rolle: role === "owner" ? "Inhaber:in" : role === "admin" ? "Admin" : "Mitglied",
      verifiziert: !!acc!.is_verified,
      url: acc!.slug ? `${o}/app/orgs/${acc!.slug}` : null,
    }));
  return { orgs };
}

export async function getMyTickets(db: Db, tenant: TenantRef, wallet: string, args: { includePast?: boolean } = {}) {
  const w = walletFilter(wallet);
  const o = origin(tenant);
  const { data, error } = await db
    .from("tickets")
    .select("status, checked_in_at, created_at, events(id, title, date, time, location), ticket_types(name)")
    .ilike("holder_wallet", w)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  const today = new Date().toISOString().slice(0, 10);
  const tickets = (data ?? [])
    .map((t) => {
      const ev = one(t.events as unknown) as { id: string; title: string; date: string; time: string | null; location: string | null } | null;
      const tt = one(t.ticket_types as unknown) as { name: string } | null;
      return {
        veranstaltung: ev?.title ?? null,
        datum: ev?.date ?? null,
        uhrzeit: ev?.time ?? null,
        ort: ev?.location ?? null,
        ticketart: tt?.name ?? null,
        status: t.status,
        eingelassen: t.checked_in_at ? true : false,
        url: ev ? `${o}/app/events/${ev.id}` : null,
      };
    })
    .filter((t) => args.includePast || !t.datum || t.datum >= today);
  return {
    tickets,
    hinweis: "Die Tickets (QR-Code) zeigst du in der App unter Profil → Tickets vor.",
  };
}

export async function getMyEvents(db: Db, tenant: TenantRef, wallet: string) {
  const w = walletFilter(wallet);
  const o = origin(tenant);
  const today = new Date().toISOString().slice(0, 10);
  const { data: interests } = await db
    .from("event_interests")
    .select("events!inner(id, title, date, time, location, status, is_cancelled)")
    .ilike("user_wallet", w)
    .limit(100);
  const vorgemerkt = (interests ?? [])
    .map((r) => one(r.events as unknown) as {
      id: string;
      title: string;
      date: string;
      time: string | null;
      location: string | null;
      status: string;
      is_cancelled: boolean | null;
    } | null)
    .filter((e): e is NonNullable<typeof e> => !!e && e.status === "approved" && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      titel: e.title,
      datum: e.date,
      uhrzeit: e.time,
      ort: e.location,
      abgesagt: !!e.is_cancelled,
      url: `${o}/app/events/${e.id}`,
    }));

  // Events the user's orgs organise (upcoming, any review status so owners see pending ones).
  const { data: owned } = await db.from("account_owners").select("account_id").ilike("wallet_address", w);
  const accIds = (owned ?? []).map((r) => r.account_id);
  let eigene: { titel: string; datum: string; status: string; url: string }[] = [];
  if (accIds.length) {
    const { data: evs } = await db
      .from("events")
      .select("id, title, date, status")
      .in("account_id", accIds)
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(20);
    eigene = (evs ?? []).map((e) => ({
      titel: e.title,
      datum: e.date,
      status: e.status === "approved" ? "veröffentlicht" : e.status === "pending" ? "in Prüfung" : e.status,
      url: `${o}/app/events/${e.id}`,
    }));
  }
  return { vorgemerkt, von_meinen_organisationen: eigene };
}

export async function getMyNotifications(db: Db, _tenant: TenantRef, wallet: string, args: { limit: number; unreadOnly?: boolean }) {
  const w = walletFilter(wallet);
  let q = db.from("notifications").select("type, title, body, is_read, created_at").ilike("recipient_wallet", w);
  if (args.unreadOnly) q = q.eq("is_read", false);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(args.limit);
  if (error) throw new Error(error.message);
  const { count } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .ilike("recipient_wallet", w)
    .eq("is_read", false);
  return {
    ungelesen: count ?? 0,
    benachrichtigungen: (data ?? []).map((n) => ({
      art: n.type,
      titel: n.title,
      text: n.body,
      gelesen: !!n.is_read,
      zeit: n.created_at,
    })),
  };
}
