// Context builder (spec §5): the harness part of the system prompt —
// "Über den Menschen" (display name, citizen, orgs + roles), "Über <Tenant>"
// (grounding facts), "Was du dir gemerkt hast" (≤ 20 memories) and the
// tool-use policy text. House rules, bot instructions, Berlin time and files
// stay in prompts.ts. The wallet is never written into the prompt.
import { db } from "../store";
import type { ChatPart } from "../types";
import { CONTEXT_MEMORIES, memoriesForBot } from "./memory";
import type { MemoryItem } from "./memory";
import { getTenant } from "./tenants";
import type { HarnessContext, HarnessProfile, HarnessTurn, TenantConfig } from "./types";

const ORG_KIND_LABELS: Record<string, string> = {
  restaurant: "Gastronomie",
  unternehmen: "Unternehmen",
  verein: "Verein",
  stadt: "Stadt/Verwaltung",
  fraktion: "Fraktion",
  journalist: "Presse",
};

const ROLE_LABELS: Record<string, string> = { owner: "Inhaber/in", admin: "Admin", member: "Mitglied" };

export const POLICY_TEXT =
  "Aktionen und Freigaben:\n" +
  "- Lesen und private Werkzeuge (Merken, Dateien, Auswahlkarten, Routinen) nutzt du selbstständig.\n" +
  "- Öffentliche Aktionen, Geld und externe Dienste brauchen eine Freigabe — schlag vor, der Mensch bestätigt. " +
  "Ruf das Werkzeug direkt auf; der Mensch sieht dann eine Freigabe-Karte. Frag nicht vorher zusätzlich im Text nach.\n" +
  "- Liefert ein Werkzeug status „awaiting_approval“, beende deine Antwort mit höchstens einem kurzen Satz und warte.\n" +
  "- Merk dir mit remember nur, was der Mensch selbst über sich gesagt hat und später hilft. Frag nicht nach sensiblen Daten.";

export function orgKindLabel(kind: string): string {
  return ORG_KIND_LABELS[kind] ?? "Organisation";
}

/** "Über den Menschen" block; null profile → a neutral line. */
export function formatProfileBlock(profile: HarnessProfile | null): string {
  const lines = ["Über den Menschen:"];
  if (!profile) {
    lines.push("- Noch kein Profil in der Röbel-App bekannt.");
    return lines.join("\n");
  }
  const name = profile.displayName?.trim() || profile.username?.trim() || null;
  lines.push(name ? `- Name: ${name}` : "- Name: nicht angegeben (sprich ihn ohne Namen an)");
  if (profile.username?.trim() && profile.username.trim() !== name) lines.push(`- Benutzername: @${profile.username.trim()}`);
  lines.push(profile.isCitizen
    ? "- Verifizierte Bürgerin / verifizierter Bürger von Röbel (darf abstimmen)."
    : "- Nicht als Bürger/in verifiziert (Gast oder Besucher/in).");
  if (profile.orgs.length) {
    lines.push("- Organisationen:");
    for (const o of profile.orgs.slice(0, 10)) {
      lines.push(`  - ${o.name} (${orgKindLabel(o.kind)}, Rolle: ${ROLE_LABELS[o.role] ?? o.role})`);
    }
  }
  return lines.join("\n");
}

export function formatTenantBlock(tenant: TenantConfig): string {
  return [`Über ${tenant.name} (${tenant.region}):`, ...tenant.facts.map((f) => `- ${f}`), `- Links in die App beginnen mit ${tenant.appOrigin}.`].join("\n");
}

export function formatMemoryBlock(memories: MemoryItem[]): string | null {
  if (!memories.length) return null;
  const lines = ["Was du dir gemerkt hast (id für forget):"];
  for (const m of memories.slice(0, CONTEXT_MEMORIES)) lines.push(`- ${m.fact} (id: ${m.id})`);
  return lines.join("\n");
}

/** The whole harness block appended to the system prompt. */
export function formatHarnessContext(input: {
  tenant: TenantConfig; profile: HarnessProfile | null; memories: MemoryItem[]; includePolicy?: boolean;
}): string {
  const blocks = [
    formatProfileBlock(input.profile),
    formatTenantBlock(input.tenant),
    formatMemoryBlock(input.memories),
    input.includePolicy === false ? null : POLICY_TEXT,
  ].filter((b): b is string => Boolean(b));
  return blocks.join("\n\n");
}

// ---- loaders ----------------------------------------------------------------------

interface UserRow { display_name: string | null; username: string | null; is_verified_citizen: boolean | null; tier: string | null }
interface OwnerRow {
  role: string;
  accounts: { id: string; name: string; account_type: string; sub_type: string | null }
    | { id: string; name: string; account_type: string; sub_type: string | null }[] | null;
}

/** Pure mapping from the users row + account_owners rows to the profile. */
export function toProfile(user: UserRow | null, owners: OwnerRow[]): HarnessProfile | null {
  const accounts = owners
    .map((o) => ({ role: o.role, acc: Array.isArray(o.accounts) ? o.accounts[0] : o.accounts }))
    .filter((x): x is { role: string; acc: NonNullable<typeof x.acc> } => Boolean(x.acc));
  if (!user && !accounts.length) return null;
  const personal = accounts.find((x) => x.acc.account_type === "personal")?.acc.name ?? null;
  return {
    displayName: user?.display_name?.trim() || personal?.trim() || null,
    username: user?.username?.trim() || null,
    // Column drift: tier='citizen' counts too (see project_citizen_verified_column_drift).
    isCitizen: Boolean(user?.is_verified_citizen) || user?.tier === "citizen",
    orgs: accounts
      .filter((x) => x.acc.account_type === "organisation")
      .map((x) => ({ id: x.acc.id, name: x.acc.name, role: x.role, kind: x.acc.sub_type ?? "organisation" })),
  };
}

export async function loadProfile(wallet: string): Promise<HarnessProfile | null> {
  try {
    const [userRes, ownerRes] = await Promise.all([
      db().from("users").select("display_name, username, is_verified_citizen, tier").ilike("wallet_address", wallet).limit(1).maybeSingle(),
      db().from("account_owners").select("role, accounts(id, name, account_type, sub_type)").ilike("wallet_address", wallet).limit(30),
    ]);
    if (userRes.error) console.error("[harness/context] users", userRes.error.message);
    if (ownerRes.error) console.error("[harness/context] account_owners", ownerRes.error.message);
    return toProfile((userRes.data as UserRow | null) ?? null, (ownerRes.data as OwnerRow[] | null) ?? []);
  } catch (err) {
    console.error("[harness/context] profile failed", err);
    return null;
  }
}

export async function loadMemories(wallet: string, botId: string): Promise<MemoryItem[]> {
  try {
    return await memoriesForBot(wallet, botId, CONTEXT_MEMORIES);
  } catch (err) {
    console.error("[harness/context] memories failed", err);
    return [];
  }
}

/** Builds the HarnessContext for a turn (profile loaded from the DB). */
export async function buildHarnessContext(input: {
  wallet: string; threadId: string; botId: string; taskId?: string | null;
  emitPart: (part: ChatPart) => void; turn?: HarnessTurn; tenantId?: string;
  profile?: HarnessProfile | null;
}): Promise<HarnessContext> {
  const profile = input.profile !== undefined ? input.profile : await loadProfile(input.wallet);
  return {
    tenant: getTenant(input.tenantId),
    wallet: input.wallet.toLowerCase(),
    profile,
    threadId: input.threadId,
    botId: input.botId,
    taskId: input.taskId ?? null,
    emitPart: input.emitPart,
    turn: input.turn,
  };
}

/** Harness system block for a bot turn (memories only when the bot has the memory pack). */
export async function harnessSystemBlock(ctx: HarnessContext, opts: { withMemory: boolean }): Promise<string> {
  const memories = opts.withMemory ? await loadMemories(ctx.wallet, ctx.botId) : [];
  return formatHarnessContext({ tenant: ctx.tenant, profile: ctx.profile, memories });
}
