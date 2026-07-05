# Röbel Newsletter System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** German AI-drafted weekly newsletter inside the apps/web admin dashboard — content generation (Claude), subscriber management (Supabase), delivery (Resend batch send).

**Architecture:** Supabase is the single source of truth (3 new tables, service-role access only). A Friday cron generates a draft via one `generateObject` call; the admin edits it in the existing Tiptap editor and manually triggers a batch send through Resend (chunks of 100, per-recipient unsubscribe tokens). A Resend webhook feeds delivery/open/click/bounce state back. Spec: `docs/superpowers/specs/2026-07-05-newsletter-design.md`.

**Tech Stack:** Next.js 15 (app router, server actions), Supabase (`createAdminClient()` service role), Resend v6 (`resend.batch.send`), AI SDK v6 + `@ai-sdk/anthropic` (`claude-sonnet-5`), Tiptap `RichTextEditor`, Tailwind, sonner, lucide-react. **No new npm dependencies** — webhook signature verification and CSV parsing are hand-rolled.

## Global Constraints

- All UI copy, email copy, and AI-generated content in **German**. Informal warm tone ("Moin"), never show wallet addresses, never say "CRC"/"Circles" (only "Röbel-Taler").
- Primary color `#00498B`, secondary text `#6B7280`, borders `#B4B8C1`.
- Nothing is ever emailed to subscribers without an explicit admin click (cron creates **drafts only**).
- New tables: RLS enabled, **zero policies** — every access goes through `createAdminClient()` (service role) in server-only code.
- Admin server actions each start with an `isAuthenticated()` guard (subscriber PII — stricter than the news.ts convention).
- Package manager: **pnpm**. Commit style: `feat(web): …`. After each task: `git add <files> && git commit && git push`.
- **Testing reality:** apps/web has no test runner (and the repo has ~431 pre-existing tsc errors). Instead of TDD: pure logic gets executable smoke checks via `npx tsx`, milestones run `pnpm build` (no NEW errors in newsletter files allowed), and Task 13 has a manual E2E checklist.
- Base URL in all links/emails: `process.env.NEXT_PUBLIC_BASE_URL || "https://roebel.app"`.

## File Map

| File | Responsibility |
|---|---|
| `supabase/migrations/20260705_newsletter.sql` | Tables, indexes, RLS, counter RPC, AGB auto-enroll trigger, `app_settings` seed |
| `apps/web/src/lib/newsletter/types.ts` | Shared TS types |
| `apps/web/src/lib/newsletter/template.ts` | Email HTML template + Tiptap→inline-style post-processor |
| `apps/web/src/lib/newsletter/transactional.ts` | Confirm / invite / draft-ready emails |
| `apps/web/src/lib/newsletter/gather.ts` | Weekly content gatherer (6 sources) |
| `apps/web/src/lib/newsletter/generate.ts` | Claude draft generation + regenerate |
| `apps/web/src/app/actions/newsletter-public.ts` | Public actions: subscribe, confirm, unsubscribe |
| `apps/web/src/app/actions/newsletter.ts` | Admin actions: issues + subscribers CRUD, import/export/invite, test send |
| `apps/web/src/app/newsletter/page.tsx` (+`bestaetigen`, `abmelden`) | Public signup / confirm / unsubscribe pages |
| `apps/web/src/app/api/newsletter/unsubscribe/route.ts` | RFC 8058 one-click unsubscribe |
| `apps/web/src/app/api/newsletter/send/route.ts` | Batch send pipeline (admin-authed) |
| `apps/web/src/app/api/newsletter/webhook/route.ts` | Resend webhook (svix HMAC, hand-rolled) |
| `apps/web/src/app/api/cron/newsletter-draft/route.ts` | Friday draft cron |
| `apps/web/src/app/admin/dashboard/newsletter/…` | Admin UI: issues list, editor `[id]`, `abonnenten` |
| `apps/web/vercel.json`, `apps/web/src/lib/resend.ts`, `apps/web/src/components/admin/admin-sidebar.tsx`, `apps/web/src/components/layout/Footer.tsx`, `apps/web/.env.example` | One-line integrations |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260705_newsletter.sql`

**Interfaces:**
- Produces: tables `newsletter_subscribers`, `newsletter_issues`, `newsletter_sends`; RPC `newsletter_bump_counter(p_issue_id uuid, p_counter text)`; trigger `trg_newsletter_auto_enroll` on `users`; `app_settings` key `newsletter_auto_enroll` = `'off'`.
- Emails are stored **lowercased** (enforced by CHECK) — every writer must `.toLowerCase()`.

- [ ] **Step 1: Write the migration**

```sql
-- Newsletter system: subscribers, issues, per-recipient sends.
-- Access model: RLS enabled with NO policies — service-role only.

create table if not exists newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  status text not null default 'pending'
    check (status in ('pending','active','unsubscribed','bounced','complained')),
  source text not null
    check (source in ('signup','import','app_user','admin')),
  wallet_address text,
  confirm_token uuid not null default gen_random_uuid(),
  confirmed_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid(),
  unsubscribed_at timestamptz,
  consent_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists newsletter_subscribers_status_idx on newsletter_subscribers (status);
create index if not exists newsletter_subscribers_confirm_idx on newsletter_subscribers (confirm_token);
create index if not exists newsletter_subscribers_unsub_idx on newsletter_subscribers (unsubscribe_token);

create table if not exists newsletter_issues (
  id uuid primary key default gen_random_uuid(),
  subject text not null default '',
  preheader text,
  content_html text not null default '',
  status text not null default 'draft'
    check (status in ('draft','sending','sent','failed')),
  generated_by text not null default 'manual' check (generated_by in ('ai','manual')),
  generation_sources jsonb,
  recipient_count int not null default 0,
  delivered_count int not null default 0,
  opened_count int not null default 0,
  clicked_count int not null default 0,
  bounced_count int not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists newsletter_sends (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references newsletter_issues(id) on delete cascade,
  subscriber_id uuid not null references newsletter_subscribers(id) on delete cascade,
  email text not null,
  resend_id text,
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','bounced','complained','failed')),
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (issue_id, subscriber_id)
);
create index if not exists newsletter_sends_resend_idx on newsletter_sends (resend_id);
create index if not exists newsletter_sends_issue_idx on newsletter_sends (issue_id);

alter table newsletter_subscribers enable row level security;
alter table newsletter_issues enable row level security;
alter table newsletter_sends enable row level security;
-- intentionally no policies

-- Atomic per-issue stat counters (webhook uses this; supabase-js can't do col = col + 1)
create or replace function newsletter_bump_counter(p_issue_id uuid, p_counter text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_counter not in ('delivered_count','opened_count','clicked_count','bounced_count') then
    raise exception 'invalid counter %', p_counter;
  end if;
  execute format(
    'update newsletter_issues set %I = %I + 1, updated_at = now() where id = $1',
    p_counter, p_counter
  ) using p_issue_id;
end $$;

-- AGB auto-enroll: OFF by default; Max flips app_settings.newsletter_auto_enroll to 'on'
-- only after AGB/Datenschutzerklaerung contain the newsletter clause.
insert into app_settings (key, value) values ('newsletter_auto_enroll', 'off')
on conflict (key) do nothing;

create or replace function newsletter_auto_enroll_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or new.email = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.email is not distinct from new.email then
    return new;
  end if;
  if (select value from app_settings where key = 'newsletter_auto_enroll') is distinct from 'on' then
    return new;
  end if;
  insert into newsletter_subscribers (email, status, source, wallet_address, confirmed_at, consent_note)
  values (lower(new.email), 'active', 'app_user', new.wallet_address, now(),
          'AGB-Zustimmung bei App-Registrierung')
  on conflict (email) do nothing;
  return new;
end $$;

drop trigger if exists trg_newsletter_auto_enroll on users;
create trigger trg_newsletter_auto_enroll
after insert or update of email on users
for each row execute function newsletter_auto_enroll_user();
```

- [ ] **Step 2: Apply the migration via the Supabase MCP**

Use the Supabase MCP tool `apply_migration` (project ref `wwbeqhkslxdxhktqzqti`, name `newsletter`) with the file contents. **If the MCP is not authenticated in this session, STOP and tell Max to either authenticate (`claude /mcp` → supabase) or paste the SQL into the Supabase dashboard SQL editor — do not skip, later tasks query these tables.**

- [ ] **Step 3: Verify tables exist**

Via MCP `execute_sql`: `select count(*) from newsletter_subscribers; select value from app_settings where key = 'newsletter_auto_enroll';`
Expected: `0` and `off`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260705_newsletter.sql
git commit -m "feat(web): newsletter DB schema — subscribers, issues, sends, auto-enroll trigger"
git push
```

---

### Task 2: Shared types + email template library

**Files:**
- Create: `apps/web/src/lib/newsletter/types.ts`
- Create: `apps/web/src/lib/newsletter/template.ts`
- Modify: `apps/web/src/lib/resend.ts` (add `fromNewsletter`)

**Interfaces:**
- Produces:
  - `types.ts`: `SubscriberStatus`, `SubscriberSource`, `IssueStatus`, `NewsletterSubscriber`, `NewsletterIssue`, `NewsletterSend` (all fields snake_case matching DB).
  - `template.ts`: `inlineStyleNewsletterHtml(html: string): string` and `renderNewsletterEmail(opts: { subject: string; preheader?: string | null; contentHtml: string; unsubscribeUrl: string }): string` (returns full email HTML document).
  - `resend.ts`: `EMAIL_CONFIG.fromNewsletter === "Röbel App <hello@roebel.app>"`.

- [ ] **Step 1: Write `types.ts`**

```ts
export type SubscriberStatus = "pending" | "active" | "unsubscribed" | "bounced" | "complained"
export type SubscriberSource = "signup" | "import" | "app_user" | "admin"
export type IssueStatus = "draft" | "sending" | "sent" | "failed"
export type SendStatus = "queued" | "sent" | "delivered" | "bounced" | "complained" | "failed"

export interface NewsletterSubscriber {
  id: string
  email: string
  status: SubscriberStatus
  source: SubscriberSource
  wallet_address: string | null
  confirm_token: string
  confirmed_at: string | null
  unsubscribe_token: string
  unsubscribed_at: string | null
  consent_note: string | null
  created_at: string
  updated_at: string
}

export interface NewsletterIssue {
  id: string
  subject: string
  preheader: string | null
  content_html: string
  status: IssueStatus
  generated_by: "ai" | "manual"
  generation_sources: Record<string, number> | null
  recipient_count: number
  delivered_count: number
  opened_count: number
  clicked_count: number
  bounced_count: number
  sent_at: string | null
  created_at: string
  updated_at: string
}

export interface NewsletterSend {
  id: string
  issue_id: string
  subscriber_id: string
  email: string
  resend_id: string | null
  status: SendStatus
  opened_at: string | null
  clicked_at: string | null
  created_at: string
}
```

- [ ] **Step 2: Write `template.ts`**

Email clients ignore `<style>` blocks, so Tiptap output gets inline styles injected by tag. Template mirrors `ticket-email.ts` (template literal, table layout, max-width 600).

```ts
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://roebel.app"

const TAG_STYLES: Record<string, string> = {
  h1: "font-size:24px;line-height:1.3;color:#111827;margin:28px 0 12px;font-weight:700;",
  h2: "font-size:20px;line-height:1.35;color:#111827;margin:26px 0 10px;font-weight:700;",
  h3: "font-size:17px;line-height:1.4;color:#111827;margin:20px 0 8px;font-weight:600;",
  p: "font-size:15px;line-height:1.65;color:#374151;margin:0 0 14px;",
  ul: "margin:0 0 14px;padding-left:22px;",
  ol: "margin:0 0 14px;padding-left:22px;",
  li: "font-size:15px;line-height:1.6;color:#374151;margin-bottom:6px;",
  a: "color:#00498B;text-decoration:underline;",
  blockquote: "border-left:3px solid #00498B;margin:0 0 14px;padding:4px 0 4px 14px;color:#4B5563;",
  hr: "border:none;border-top:1px solid #E5E7EB;margin:24px 0;",
  img: "max-width:100%;height:auto;border-radius:8px;margin:0 0 14px;",
  strong: "font-weight:600;color:#111827;",
}

/** Injects inline styles into Tiptap-generated HTML so email clients render it. */
export function inlineStyleNewsletterHtml(html: string): string {
  return html.replace(
    /<(h1|h2|h3|p|ul|ol|li|a|blockquote|hr|img|strong)([\s>/])/g,
    (_m, tag: string, after: string) =>
      `<${tag} style="${TAG_STYLES[tag]}"${after.trim() === "" ? " " : after}`
  )
}

export function renderNewsletterEmail(opts: {
  subject: string
  preheader?: string | null
  contentHtml: string
  unsubscribeUrl: string
}): string {
  const { subject, preheader, contentHtml, unsubscribeUrl } = opts
  const body = inlineStyleNewsletterHtml(contentHtml)
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f3f4f6;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>` : ""}
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" style="width:100%;max-width:600px;border-collapse:collapse;background-color:#ffffff;border-radius:16px;overflow:hidden;">
      <tr><td style="background-color:#00498B;padding:24px 32px;">
        <table role="presentation" style="border-collapse:collapse;"><tr>
          <td><img src="${BASE_URL}/apple-touch-icon.png" width="40" height="40" alt="Röbel App" style="border-radius:8px;display:block;"></td>
          <td style="padding-left:12px;font-size:18px;font-weight:700;color:#ffffff;">Röbel App · Newsletter</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:32px;">${body}</td></tr>
      <tr><td style="padding:24px 32px;background-color:#f9fafb;border-top:1px solid #E5E7EB;">
        <p style="font-size:12px;line-height:1.6;color:#6B7280;margin:0;">
          Du erhältst diese E-Mail, weil du den Newsletter der Röbel App abonniert hast.<br>
          <a href="${unsubscribeUrl}" style="color:#6B7280;text-decoration:underline;">Abmelden</a> ·
          <a href="${BASE_URL}/impressum" style="color:#6B7280;text-decoration:underline;">Impressum</a> ·
          <a href="${BASE_URL}/datenschutz" style="color:#6B7280;text-decoration:underline;">Datenschutz</a>
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`.trim()
}
```

- [ ] **Step 3: Add `fromNewsletter` to `resend.ts`**

In `EMAIL_CONFIG`, after the `fromHello` line add:

```ts
  fromNewsletter: "Röbel App <hello@roebel.app>", // Weekly newsletter + opt-in confirmations
```

- [ ] **Step 4: Smoke-check the inline styler**

Run from `apps/web`:
```bash
npx tsx -e "
import { inlineStyleNewsletterHtml, renderNewsletterEmail } from './src/lib/newsletter/template.ts'
const out = inlineStyleNewsletterHtml('<h2>Moin</h2><p>Hallo <a href=\"https://roebel.app\">Link</a></p><hr><ul><li>Punkt</li></ul>')
if (!out.includes('<h2 style=')) throw new Error('h2 not styled')
if (!out.includes('<a style=') || !out.includes('href=')) throw new Error('a broken: ' + out)
if (!out.includes('<hr style=')) throw new Error('hr not styled')
const doc = renderNewsletterEmail({ subject: 'Test', preheader: 'Vorschau', contentHtml: '<p>Inhalt</p>', unsubscribeUrl: 'https://roebel.app/newsletter/abmelden?token=x' })
if (!doc.includes('abmelden?token=x') || !doc.includes('#00498B')) throw new Error('template broken')
console.log('template OK')
"
```
Expected: `template OK`

- [ ] **Step 5: Commit**

```bash
git add src/lib/newsletter/types.ts src/lib/newsletter/template.ts src/lib/resend.ts
git commit -m "feat(web): newsletter types + email-safe HTML template"
git push
```

---

### Task 3: Transactional emails (confirm / invite / draft-ready)

**Files:**
- Create: `apps/web/src/lib/newsletter/transactional.ts`

**Interfaces:**
- Consumes: `resend`, `EMAIL_CONFIG` from `@/lib/resend`; `renderNewsletterEmail` NOT used (these are simple one-off mails with their own minimal markup).
- Produces:
  - `sendConfirmationEmail(email: string, confirmToken: string, kind: "signup" | "invite"): Promise<boolean>`
  - `sendDraftReadyEmail(issueId: string, subject: string): Promise<boolean>`

- [ ] **Step 1: Write `transactional.ts`**

```ts
import { resend, EMAIL_CONFIG } from "@/lib/resend"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://roebel.app"

function simpleEmailHtml(heading: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#f3f4f6;">
<table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" style="width:100%;max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border-collapse:collapse;">
<tr><td style="background:#00498B;padding:20px 28px;font-size:17px;font-weight:700;color:#ffffff;">Röbel App</td></tr>
<tr><td style="padding:28px;">
  <h1 style="font-size:20px;color:#111827;margin:0 0 12px;">${heading}</h1>
  ${bodyHtml}
</td></tr>
<tr><td style="padding:20px 28px;background:#f9fafb;border-top:1px solid #E5E7EB;font-size:12px;color:#6B7280;">
  <a href="${BASE_URL}/impressum" style="color:#6B7280;">Impressum</a> · <a href="${BASE_URL}/datenschutz" style="color:#6B7280;">Datenschutz</a>
</td></tr></table></td></tr></table></body></html>`
}

const CONFIRM_BUTTON = (url: string) =>
  `<a href="${url}" style="display:inline-block;background:#00498B;color:#ffffff;font-size:15px;font-weight:600;padding:12px 24px;border-radius:10px;text-decoration:none;margin:8px 0 16px;">Anmeldung bestätigen</a>`

export async function sendConfirmationEmail(
  email: string,
  confirmToken: string,
  kind: "signup" | "invite"
): Promise<boolean> {
  if (!resend) return false
  const url = `${BASE_URL}/newsletter/bestaetigen?token=${confirmToken}`
  const intro =
    kind === "invite"
      ? `<p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 14px;">Moin! Du nutzt die Röbel App — ab jetzt gibt es auch einen wöchentlichen Newsletter mit allem, was in Röbel passiert: Neuigkeiten, Veranstaltungen, Abstimmungen und mehr.</p>`
      : `<p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 14px;">Moin! Nur noch ein Klick, dann bekommst du jede Woche die wichtigsten Neuigkeiten aus Röbel/Müritz direkt ins Postfach.</p>`
  const { error } = await resend.emails.send({
    from: EMAIL_CONFIG.fromNewsletter,
    to: email,
    replyTo: EMAIL_CONFIG.replyTo,
    subject:
      kind === "invite"
        ? "Der Röbel-Newsletter ist da — möchtest du dabei sein?"
        : "Bitte bestätige deine Newsletter-Anmeldung",
    html: simpleEmailHtml(
      kind === "invite" ? "Der Röbel-Newsletter ist da" : "Fast geschafft!",
      `${intro}${CONFIRM_BUTTON(url)}<p style="font-size:13px;line-height:1.6;color:#6B7280;margin:0;">Wenn du das nicht warst, kannst du diese E-Mail einfach ignorieren — ohne Bestätigung bekommst du keinen Newsletter.</p>`
    ),
  })
  if (error) console.error("[Newsletter] Confirmation email failed:", error)
  return !error
}

export async function sendDraftReadyEmail(issueId: string, subject: string): Promise<boolean> {
  if (!resend) return false
  const adminEmail = process.env.NEWSLETTER_ADMIN_EMAIL || EMAIL_CONFIG.replyTo
  const url = `${BASE_URL}/admin/dashboard/newsletter/${issueId}`
  const { error } = await resend.emails.send({
    from: EMAIL_CONFIG.fromNewsletter,
    to: adminEmail,
    subject: `Newsletter-Entwurf bereit: ${subject}`,
    html: simpleEmailHtml(
      "Der Wochen-Entwurf ist fertig",
      `<p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 14px;">Die KI hat den Newsletter-Entwurf für diese Woche erstellt. Prüfen, bei Bedarf anpassen — und dann senden.</p>
       <a href="${url}" style="display:inline-block;background:#00498B;color:#ffffff;font-size:15px;font-weight:600;padding:12px 24px;border-radius:10px;text-decoration:none;">Entwurf öffnen</a>`
    ),
  })
  if (error) console.error("[Newsletter] Draft-ready email failed:", error)
  return !error
}
```

- [ ] **Step 2: Type-check the new file compiles inside the project**

Run from `apps/web`: `npx tsc --noEmit 2>&1 | grep "lib/newsletter" ; echo "checked"`
Expected: no lines matching `lib/newsletter` (pre-existing errors elsewhere are fine), then `checked`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/newsletter/transactional.ts
git commit -m "feat(web): newsletter transactional emails (confirm, invite, draft-ready)"
git push
```

---

### Task 4: Public subscribe flow — actions, pages, one-click unsubscribe, footer link

**Files:**
- Create: `apps/web/src/app/actions/newsletter-public.ts`
- Create: `apps/web/src/app/newsletter/page.tsx`
- Create: `apps/web/src/app/newsletter/signup-form.tsx`
- Create: `apps/web/src/app/newsletter/bestaetigen/page.tsx`
- Create: `apps/web/src/app/newsletter/abmelden/page.tsx`
- Create: `apps/web/src/app/api/newsletter/unsubscribe/route.ts`
- Modify: `apps/web/src/components/layout/Footer.tsx` (add `/newsletter` link)

**Interfaces:**
- Consumes: `createAdminClient()` from `@/lib/supabase/admin`; `sendConfirmationEmail` from `@/lib/newsletter/transactional`.
- Produces (all in `newsletter-public.ts`, all `"use server"`):
  - `subscribeToNewsletter(email: string): Promise<{ success: boolean; message: string }>` — always returns success for valid emails (no enumeration).
  - `confirmSubscription(token: string): Promise<{ success: boolean }>`
  - `unsubscribeByToken(token: string): Promise<{ success: boolean }>`

- [ ] **Step 1: Write `newsletter-public.ts`**

```ts
"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { sendConfirmationEmail } from "@/lib/newsletter/transactional"

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export async function subscribeToNewsletter(email: string): Promise<{ success: boolean; message: string }> {
  const normalized = email.trim().toLowerCase()
  if (!EMAIL_RE.test(normalized)) {
    return { success: false, message: "Bitte gib eine gültige E-Mail-Adresse ein." }
  }
  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from("newsletter_subscribers")
    .select("id, status, confirm_token")
    .eq("email", normalized)
    .maybeSingle()

  // Silent success for already-active addresses — never reveal subscription state.
  const okMessage = "Fast geschafft! Bitte bestätige deine Anmeldung über den Link in deinem Postfach."

  if (existing?.status === "active") {
    return { success: true, message: okMessage }
  }
  if (existing) {
    const { data: updated } = await supabase
      .from("newsletter_subscribers")
      .update({
        status: "pending",
        confirm_token: crypto.randomUUID(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("confirm_token")
      .single()
    if (updated) await sendConfirmationEmail(normalized, updated.confirm_token, "signup")
    return { success: true, message: okMessage }
  }
  const { data: created, error } = await supabase
    .from("newsletter_subscribers")
    .insert({ email: normalized, status: "pending", source: "signup" })
    .select("confirm_token")
    .single()
  if (error) {
    console.error("[Newsletter] subscribe insert failed:", error)
    return { success: false, message: "Etwas ist schiefgelaufen. Bitte versuche es später erneut." }
  }
  await sendConfirmationEmail(normalized, created.confirm_token, "signup")
  return { success: true, message: okMessage }
}

export async function confirmSubscription(token: string): Promise<{ success: boolean }> {
  if (!token) return { success: false }
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("newsletter_subscribers")
    .update({
      status: "active",
      confirmed_at: new Date().toISOString(),
      unsubscribed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("confirm_token", token)
    .in("status", ["pending", "active"])
    .select("id")
  return { success: !!data?.length }
}

export async function unsubscribeByToken(token: string): Promise<{ success: boolean }> {
  if (!token) return { success: false }
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("newsletter_subscribers")
    .update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("unsubscribe_token", token)
    .select("id")
  return { success: !!data?.length }
}
```

- [ ] **Step 2: Write the signup page + form**

`apps/web/src/app/newsletter/page.tsx` (server component):

```tsx
import type { Metadata } from "next"
import { NewsletterSignupForm } from "./signup-form"

export const metadata: Metadata = {
  title: "Newsletter | Röbel App",
  description: "Jede Woche die wichtigsten Neuigkeiten aus Röbel/Müritz ins Postfach.",
}

export default function NewsletterPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-3xl font-bold text-gray-900">Der Röbel-Newsletter</h1>
      <p className="mt-3 text-gray-600">
        Einmal pro Woche: Neuigkeiten, Veranstaltungen, Abstimmungen und alles, was in
        Röbel/Müritz passiert. Kostenlos, jederzeit abbestellbar.
      </p>
      <div className="mt-8">
        <NewsletterSignupForm />
      </div>
    </main>
  )
}
```

`apps/web/src/app/newsletter/signup-form.tsx`:

```tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { subscribeToNewsletter } from "@/app/actions/newsletter-public"

export function NewsletterSignupForm() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await subscribeToNewsletter(email)
    setResult(res)
    if (res.success) setEmail("")
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-2">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="deine@email.de"
          className="flex-1"
        />
        <Button type="submit" disabled={loading} className="bg-[#00498B] hover:bg-[#003a70]">
          {loading ? "Wird gesendet…" : "Anmelden"}
        </Button>
      </div>
      {result && (
        <p className={result.success ? "text-sm text-green-700" : "text-sm text-red-600"}>
          {result.message}
        </p>
      )}
      <p className="text-xs text-gray-500">
        Mit der Anmeldung stimmst du zu, dass wir dir wöchentlich unseren Newsletter senden.
        Hinweise zum Datenschutz findest du in unserer{" "}
        <a href="/datenschutz" className="underline">Datenschutzerklärung</a>. Abmeldung ist
        jederzeit über den Link in jeder E-Mail möglich.
      </p>
    </form>
  )
}
```

- [ ] **Step 3: Write confirm + unsubscribe pages**

`apps/web/src/app/newsletter/bestaetigen/page.tsx`:

```tsx
import Link from "next/link"
import { confirmSubscription } from "@/app/actions/newsletter-public"

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const result = token ? await confirmSubscription(token) : { success: false }
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      {result.success ? (
        <>
          <h1 className="text-3xl font-bold text-gray-900">Willkommen an Bord! 🎉</h1>
          <p className="mt-3 text-gray-600">
            Deine Anmeldung ist bestätigt. Der nächste Röbel-Newsletter landet bald in deinem Postfach.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold text-gray-900">Link ungültig</h1>
          <p className="mt-3 text-gray-600">
            Dieser Bestätigungslink ist ungültig oder abgelaufen. Melde dich einfach erneut an.
          </p>
        </>
      )}
      <Link href="/newsletter" className="mt-6 inline-block text-[#00498B] underline">
        Zur Newsletter-Seite
      </Link>
    </main>
  )
}
```

`apps/web/src/app/newsletter/abmelden/page.tsx` — **must NOT unsubscribe on GET**: email
security scanners prefetch links and would silently unsubscribe people. The page shows a
button; the actual state change happens in the form's server action, which redirects back
with `?done=1`:

```tsx
import Link from "next/link"
import { redirect } from "next/navigation"
import { unsubscribeByToken } from "@/app/actions/newsletter-public"

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string }>
}) {
  const { token, done } = await searchParams

  async function handleUnsubscribe(formData: FormData) {
    "use server"
    const t = String(formData.get("token") ?? "")
    const result = await unsubscribeByToken(t)
    redirect(`/newsletter/abmelden?token=${encodeURIComponent(t)}&done=${result.success ? "1" : "0"}`)
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      {done === "1" ? (
        <>
          <h1 className="text-3xl font-bold text-gray-900">Abgemeldet</h1>
          <p className="mt-3 text-gray-600">
            Du erhältst ab sofort keinen Röbel-Newsletter mehr. Schade — du kannst dich
            jederzeit wieder anmelden.
          </p>
        </>
      ) : done === "0" || !token ? (
        <>
          <h1 className="text-3xl font-bold text-gray-900">Link ungültig</h1>
          <p className="mt-3 text-gray-600">Dieser Abmelde-Link ist ungültig.</p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold text-gray-900">Newsletter abbestellen</h1>
          <p className="mt-3 text-gray-600">
            Möchtest du den wöchentlichen Röbel-Newsletter wirklich nicht mehr erhalten?
          </p>
          <form action={handleUnsubscribe} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              className="rounded-xl bg-[#00498B] px-6 py-3 font-semibold text-white hover:bg-[#003a70]"
            >
              Ja, abmelden
            </button>
          </form>
        </>
      )}
      <Link href="/newsletter" className="mt-6 inline-block text-[#00498B] underline">
        Zur Newsletter-Seite
      </Link>
    </main>
  )
}
```

- [ ] **Step 4: Write the RFC 8058 one-click unsubscribe API route**

`apps/web/src/app/api/newsletter/unsubscribe/route.ts` (target of the `List-Unsubscribe` header; mail clients POST here without rendering anything):

```ts
import { NextRequest, NextResponse } from "next/server"
import { unsubscribeByToken } from "@/app/actions/newsletter-public"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? ""
  await unsubscribeByToken(token)
  // RFC 8058: always 200, no body needed
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? ""
  return NextResponse.redirect(
    new URL(`/newsletter/abmelden?token=${encodeURIComponent(token)}`, req.nextUrl.origin)
  )
}
```

- [ ] **Step 5: Add the footer link**

In `apps/web/src/components/layout/Footer.tsx`, find the `quickLinks` array (or the "Navigation" `<ul>` with the hardcoded `/news` link) and add one entry: `{ href: "/newsletter", label: "Newsletter" }` (match the exact shape of neighboring entries in that file).

- [ ] **Step 6: Verify build**

Run from `apps/web`: `pnpm build 2>&1 | tail -20`
Expected: build succeeds; `/newsletter`, `/newsletter/bestaetigen`, `/newsletter/abmelden`, `/api/newsletter/unsubscribe` appear in the route list.

- [ ] **Step 7: Commit**

```bash
git add src/app/actions/newsletter-public.ts src/app/newsletter src/app/api/newsletter/unsubscribe/route.ts src/components/layout/Footer.tsx
git commit -m "feat(web): public newsletter signup with double opt-in + one-click unsubscribe"
git push
```

---

### Task 5: Content gatherer

**Files:**
- Create: `apps/web/src/lib/newsletter/gather.ts`

**Interfaces:**
- Consumes: `createAdminClient()`.
- Produces:
  - `interface NewsletterSourceData { windowStart: string; news: …; events: …; proposals: …; listings: …; businesses: …; posts: … }` (exact shape below)
  - `gatherNewsletterContent(): Promise<NewsletterSourceData>` — every source individually try/caught; a failing source yields `[]`, never throws.

- [ ] **Step 1: Verify the businesses name column**

Run: `grep -n "from(\"businesses\")" -A 6 apps/web/src/app/actions/businesses.ts | head -30`
Confirm the display-name column (expected `name`; if it differs, use the real one in Step 2).

- [ ] **Step 2: Write `gather.ts`**

```ts
import { createAdminClient } from "@/lib/supabase/admin"

export interface NewsletterSourceData {
  windowStart: string
  news: Array<{ title: string; excerpt: string | null; category: string | null; slug: string }>
  events: Array<{ title: string; date: string; time: string | null; location: string | null }>
  proposals: Array<{ title: string; summary: string | null; state: string; for_votes: number; against_votes: number }>
  listings: Array<{ title: string; category: string | null }>
  businesses: Array<{ name: string }>
  posts: Array<{ content: string; likes_count: number }>
}

async function safe<T>(label: string, fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn()
  } catch (err) {
    console.error(`[Newsletter] gather source failed: ${label}`, err)
    return []
  }
}

export async function gatherNewsletterContent(): Promise<NewsletterSourceData> {
  const supabase = createAdminClient()

  // Window = since last sent issue, fallback 7 days
  const { data: lastSent } = await supabase
    .from("newsletter_issues")
    .select("sent_at")
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const windowStart =
    lastSent?.sent_at ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const today = new Date().toISOString().slice(0, 10)
  const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [news, events, proposals, listings, businesses, posts] = await Promise.all([
    safe("news", async () => {
      const { data } = await supabase
        .from("news_articles")
        .select("title, excerpt, category, slug")
        .eq("status", "published")
        .gte("published_at", windowStart)
        .order("published_at", { ascending: false })
        .limit(10)
      return data ?? []
    }),
    safe("events", async () => {
      const { data } = await supabase
        .from("events")
        .select("title, date, time, location")
        .eq("status", "approved")
        .gte("date", today)
        .lte("date", in14Days)
        .order("date", { ascending: true })
        .limit(10)
      return data ?? []
    }),
    safe("proposals", async () => {
      const { data } = await supabase
        .from("proposals")
        .select("title, summary, state, for_votes, against_votes")
        .gte("created_at", windowStart)
        .order("created_at", { ascending: false })
        .limit(10)
      return data ?? []
    }),
    safe("listings", async () => {
      const { data } = await supabase
        .from("marketplace_listings")
        .select("title, category")
        .eq("status", "active")
        .gte("created_at", windowStart)
        .order("created_at", { ascending: false })
        .limit(10)
      return data ?? []
    }),
    safe("businesses", async () => {
      const { data } = await supabase
        .from("businesses")
        .select("name")
        .eq("is_active", true)
        .gte("created_at", windowStart)
        .order("created_at", { ascending: false })
        .limit(5)
      return data ?? []
    }),
    safe("posts", async () => {
      const { data } = await supabase
        .from("posts")
        .select("content, likes_count")
        .eq("feed_type", "main")
        .gte("created_at", windowStart)
        .order("likes_count", { ascending: false })
        .limit(5)
      return data ?? []
    }),
  ])

  return { windowStart, news, events, proposals, listings, businesses, posts }
}
```

- [ ] **Step 3: Smoke-check against the live DB**

Run from `apps/web` (needs `.env.local` loaded):
```bash
npx tsx -e "
import { config } from 'dotenv'; config({ path: '.env.local' })
const { gatherNewsletterContent } = await import('./src/lib/newsletter/gather.ts')
const d = await gatherNewsletterContent()
console.log('windowStart', d.windowStart)
console.log('news', d.news.length, 'events', d.events.length, 'proposals', d.proposals.length, 'listings', d.listings.length, 'businesses', d.businesses.length, 'posts', d.posts.length)
"
```
Expected: prints counts (any numbers ≥ 0), no throw.

- [ ] **Step 4: Commit**

```bash
git add src/lib/newsletter/gather.ts
git commit -m "feat(web): newsletter content gatherer (news, events, DAO, marktplatz, gewerbe, posts)"
git push
```

---

### Task 6: AI draft generation

**Files:**
- Create: `apps/web/src/lib/newsletter/generate.ts`

**Interfaces:**
- Consumes: `gatherNewsletterContent()`, `createAdminClient()`, `sendDraftReadyEmail()`.
- Produces:
  - `generateNewsletterDraft(opts?: { force?: boolean; notify?: boolean }): Promise<{ created: boolean; issueId?: string; reason?: string }>` — creates a new draft issue row. Without `force`, skips if an unsent draft already exists.
  - `regenerateIssueContent(issueId: string): Promise<{ success: boolean; message: string }>` — overwrites subject/preheader/content of an existing draft.

- [ ] **Step 1: Write `generate.ts`**

```ts
import { generateObject } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { gatherNewsletterContent, type NewsletterSourceData } from "./gather"
import { sendDraftReadyEmail } from "./transactional"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://roebel.app"

const newsletterSchema = z.object({
  subject: z.string().describe("Betreffzeile, max 60 Zeichen, neugierig machend, ohne Clickbait"),
  preheader: z.string().describe("Vorschautext, max 90 Zeichen, ergänzt den Betreff"),
  sections: z
    .array(
      z.object({
        heading: z.string().describe("Kurze Abschnittsüberschrift"),
        html: z.string().describe("Abschnitts-Inhalt als HTML (nur p, ul, li, a, strong, em)"),
      })
    )
    .min(2)
    .max(6),
})

function buildPrompt(data: NewsletterSourceData): string {
  return `Du schreibst den wöchentlichen E-Mail-Newsletter der Röbel App für die Kleinstadt Röbel/Müritz.

TONALITÄT: Warm, bürgernah, norddeutsch-locker (ein "Moin" zur Begrüßung passt). Kurze Sätze. Du-Form. Kein Amtsdeutsch, kein Marketing-Sprech.

HARTE REGELN:
- Nutze AUSSCHLIESSLICH die Daten unten. Erfinde nichts dazu — keine Termine, keine Zahlen, keine Namen.
- Niemals Wallet-Adressen (0x…) erwähnen.
- Niemals "CRC", "Circles" oder Krypto-Jargon — die Stadtwährung heißt ausschließlich "Röbel-Taler".
- Erlaubte HTML-Tags im Abschnitts-HTML: <p>, <ul>, <li>, <a>, <strong>, <em>. Keine Überschriften im HTML (die kommen aus "heading").
- News-Artikel verlinkst du als <a href="${BASE_URL}/news/SLUG">Titel</a>.
- Leere Datenquellen lässt du einfach weg — kein "diese Woche gab es keine…".
- Zum Schluss ein kurzer, freundlicher Abschied (1-2 Sätze).

DATEN SEIT ${data.windowStart}:

NEUIGKEITEN (mit slug für Links):
${JSON.stringify(data.news, null, 2)}

KOMMENDE VERANSTALTUNGEN (nächste 14 Tage):
${JSON.stringify(data.events, null, 2)}

BÜRGERBETEILIGUNG / ABSTIMMUNGEN:
${JSON.stringify(data.proposals, null, 2)}

NEUE MARKTPLATZ-ANGEBOTE:
${JSON.stringify(data.listings, null, 2)}

NEUE GEWERBE IN DER APP:
${JSON.stringify(data.businesses, null, 2)}

BELIEBTE COMMUNITY-BEITRÄGE (ohne Namensnennung zitieren/zusammenfassen):
${JSON.stringify(data.posts, null, 2)}

Erstelle daraus den Newsletter dieser Woche.`
}

function sectionsToHtml(sections: Array<{ heading: string; html: string }>): string {
  return sections.map((s) => `<h2>${s.heading}</h2>\n${s.html}`).join("\n<hr>\n")
}

function sourceCounts(data: NewsletterSourceData): Record<string, number> {
  return {
    news: data.news.length,
    events: data.events.length,
    proposals: data.proposals.length,
    listings: data.listings.length,
    businesses: data.businesses.length,
    posts: data.posts.length,
  }
}

async function generateContent(data: NewsletterSourceData) {
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-5"),
    schema: newsletterSchema,
    prompt: buildPrompt(data),
    maxOutputTokens: 8000,
  })
  return object
}

export async function generateNewsletterDraft(opts?: {
  force?: boolean
  notify?: boolean
}): Promise<{ created: boolean; issueId?: string; reason?: string }> {
  const supabase = createAdminClient()

  if (!opts?.force) {
    const { data: existingDraft } = await supabase
      .from("newsletter_issues")
      .select("id")
      .eq("status", "draft")
      .limit(1)
      .maybeSingle()
    if (existingDraft) {
      return { created: false, reason: "Es existiert bereits ein unversendeter Entwurf." }
    }
  }

  const data = await gatherNewsletterContent()
  const total = Object.values(sourceCounts(data)).reduce((a, b) => a + b, 0)
  if (total === 0) {
    return { created: false, reason: "Keine Inhalte im Zeitraum gefunden." }
  }

  const object = await generateContent(data)
  const { data: issue, error } = await supabase
    .from("newsletter_issues")
    .insert({
      subject: object.subject,
      preheader: object.preheader,
      content_html: sectionsToHtml(object.sections),
      status: "draft",
      generated_by: "ai",
      generation_sources: sourceCounts(data),
    })
    .select("id")
    .single()
  if (error || !issue) {
    console.error("[Newsletter] draft insert failed:", error)
    throw new Error("Entwurf konnte nicht gespeichert werden")
  }

  if (opts?.notify) {
    await sendDraftReadyEmail(issue.id, object.subject)
  }
  return { created: true, issueId: issue.id }
}

export async function regenerateIssueContent(
  issueId: string
): Promise<{ success: boolean; message: string }> {
  const supabase = createAdminClient()
  const { data: issue } = await supabase
    .from("newsletter_issues")
    .select("id, status")
    .eq("id", issueId)
    .maybeSingle()
  if (!issue) return { success: false, message: "Ausgabe nicht gefunden." }
  if (issue.status !== "draft") {
    return { success: false, message: "Nur Entwürfe können neu generiert werden." }
  }

  const data = await gatherNewsletterContent()
  const object = await generateContent(data)
  const { error } = await supabase
    .from("newsletter_issues")
    .update({
      subject: object.subject,
      preheader: object.preheader,
      content_html: sectionsToHtml(object.sections),
      generated_by: "ai",
      generation_sources: sourceCounts(data),
      updated_at: new Date().toISOString(),
    })
    .eq("id", issueId)
  if (error) return { success: false, message: "Speichern fehlgeschlagen." }
  return { success: true, message: "Entwurf neu generiert." }
}
```

- [ ] **Step 2: Smoke-check end-to-end (creates a real draft row)**

Run from `apps/web`:
```bash
npx tsx -e "
import { config } from 'dotenv'; config({ path: '.env.local' })
const { generateNewsletterDraft } = await import('./src/lib/newsletter/generate.ts')
const r = await generateNewsletterDraft({ force: true })
console.log(r)
"
```
Expected: `{ created: true, issueId: '…' }` (or `created: false` with reason `Keine Inhalte…` if the window is empty — then re-run after temporarily widening the fallback window in gather.ts to 30 days, revert after). Leave the created draft row in place — Task 10's manual verification uses it.

- [ ] **Step 3: Commit**

```bash
git add src/lib/newsletter/generate.ts
git commit -m "feat(web): AI newsletter draft generation via claude-sonnet-5"
git push
```

---

### Task 7: Draft cron route + vercel.json

**Files:**
- Create: `apps/web/src/app/api/cron/newsletter-draft/route.ts`
- Modify: `apps/web/vercel.json`

**Interfaces:**
- Consumes: `generateNewsletterDraft` from `@/lib/newsletter/generate`.
- Produces: GET endpoint, auth `Bearer ${CRON_SECRET}`, schedule Friday 06:00 UTC.

- [ ] **Step 1: Write the route (mirror `api/cron/mecky/route.ts`)**

```ts
import { NextRequest, NextResponse } from "next/server"
import { generateNewsletterDraft } from "@/lib/newsletter/generate"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const result = await generateNewsletterDraft({ notify: true })
    return NextResponse.json(result)
  } catch (error) {
    console.error("Newsletter draft cron error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Add the cron to `apps/web/vercel.json`**

Append to the existing `crons` array:
```json
{
  "path": "/api/cron/newsletter-draft",
  "schedule": "0 6 * * 5"
}
```

- [ ] **Step 3: Verify locally**

Run `pnpm dev` in one shell; in another:
```bash
curl -s -H "Authorization: Bearer $(grep CRON_SECRET apps/web/.env.local | cut -d= -f2)" http://localhost:3000/api/cron/newsletter-draft
```
Expected: `{"created":false,"reason":"Es existiert bereits ein unversendeter Entwurf."}` (draft from Task 6 exists). Also verify `curl -s http://localhost:3000/api/cron/newsletter-draft` → 401.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/newsletter-draft/route.ts vercel.json
git commit -m "feat(web): weekly newsletter draft cron (Fri 06:00 UTC)"
git push
```

---

### Task 8: Admin server actions (issues + subscribers)

**Files:**
- Create: `apps/web/src/app/actions/newsletter.ts`

**Interfaces:**
- Consumes: `createAdminClient()`, `isAuthenticated()` from `@/lib/auth/session`, `regenerateIssueContent` + `generateNewsletterDraft` from `@/lib/newsletter/generate`, `renderNewsletterEmail` from `@/lib/newsletter/template`, `sendConfirmationEmail` from `@/lib/newsletter/transactional`, `resend`/`EMAIL_CONFIG`, types from `@/lib/newsletter/types`.
- Produces (all `"use server"`, all admin-guarded; every mutation ends with `revalidatePath("/admin/dashboard/newsletter")`):
  - `listIssues(): Promise<NewsletterIssue[]>`
  - `getIssue(id: string): Promise<NewsletterIssue | null>`
  - `createBlankIssue(): Promise<{ success: boolean; issueId?: string }>`
  - `updateIssue(id: string, fields: { subject: string; preheader: string; content_html: string }): Promise<{ success: boolean; message: string }>`
  - `deleteIssue(id: string): Promise<{ success: boolean; message: string }>` (drafts only)
  - `generateDraftNow(): Promise<{ success: boolean; message: string; issueId?: string }>`
  - `regenerateDraft(issueId: string): Promise<{ success: boolean; message: string }>`
  - `previewIssueEmail(id: string): Promise<string>` (full email HTML, placeholder unsubscribe URL)
  - `sendTestEmail(issueId: string, to: string): Promise<{ success: boolean; message: string }>`
  - `getActiveSubscriberCount(): Promise<number>`
  - `listSubscribers(filter?: { search?: string; status?: string }): Promise<NewsletterSubscriber[]>`
  - `addSubscriberManually(email: string): Promise<{ success: boolean; message: string }>` (source `admin`, status `active`)
  - `importSubscribers(emails: string[]): Promise<{ success: boolean; added: number; skipped: number }>` (source `import`, status `active`)
  - `setSubscriberUnsubscribed(id: string): Promise<{ success: boolean }>`
  - `deleteSubscriberById(id: string): Promise<{ success: boolean }>` (DSGVO hard delete)
  - `exportSubscribersCsv(): Promise<string>`
  - `inviteAppUsers(): Promise<{ success: boolean; invited: number; alreadySubscribed: number }>`

- [ ] **Step 1: Write `newsletter.ts`**

```ts
"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAuthenticated } from "@/lib/auth/session"
import { resend, EMAIL_CONFIG } from "@/lib/resend"
import { renderNewsletterEmail } from "@/lib/newsletter/template"
import { sendConfirmationEmail } from "@/lib/newsletter/transactional"
import {
  generateNewsletterDraft,
  regenerateIssueContent,
} from "@/lib/newsletter/generate"
import type { NewsletterIssue, NewsletterSubscriber } from "@/lib/newsletter/types"

export type { NewsletterIssue, NewsletterSubscriber }

const ADMIN_PATH = "/admin/dashboard/newsletter"
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

async function guard(): Promise<void> {
  if (!(await isAuthenticated())) throw new Error("Nicht autorisiert")
}

// ---------- Issues ----------

export async function listIssues(): Promise<NewsletterIssue[]> {
  await guard()
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("newsletter_issues")
    .select("*")
    .order("created_at", { ascending: false })
  return (data as NewsletterIssue[]) ?? []
}

export async function getIssue(id: string): Promise<NewsletterIssue | null> {
  await guard()
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("newsletter_issues")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  return (data as NewsletterIssue) ?? null
}

export async function createBlankIssue(): Promise<{ success: boolean; issueId?: string }> {
  await guard()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("newsletter_issues")
    .insert({ subject: "", content_html: "", status: "draft", generated_by: "manual" })
    .select("id")
    .single()
  revalidatePath(ADMIN_PATH)
  return { success: !error, issueId: data?.id }
}

export async function updateIssue(
  id: string,
  fields: { subject: string; preheader: string; content_html: string }
): Promise<{ success: boolean; message: string }> {
  await guard()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("newsletter_issues")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft")
    .select("id")
  revalidatePath(ADMIN_PATH)
  if (error || !data?.length) {
    return { success: false, message: "Speichern fehlgeschlagen (nur Entwürfe sind editierbar)." }
  }
  return { success: true, message: "Gespeichert." }
}

export async function deleteIssue(id: string): Promise<{ success: boolean; message: string }> {
  await guard()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("newsletter_issues")
    .delete()
    .eq("id", id)
    .eq("status", "draft")
    .select("id")
  revalidatePath(ADMIN_PATH)
  if (error || !data?.length) return { success: false, message: "Nur Entwürfe können gelöscht werden." }
  return { success: true, message: "Entwurf gelöscht." }
}

export async function generateDraftNow(): Promise<{ success: boolean; message: string; issueId?: string }> {
  await guard()
  try {
    const result = await generateNewsletterDraft({ force: true })
    revalidatePath(ADMIN_PATH)
    if (!result.created) return { success: false, message: result.reason ?? "Keine Inhalte gefunden." }
    return { success: true, message: "Entwurf erstellt.", issueId: result.issueId }
  } catch (err) {
    console.error("[Newsletter] generateDraftNow failed:", err)
    return { success: false, message: "KI-Generierung fehlgeschlagen. Bitte erneut versuchen." }
  }
}

export async function regenerateDraft(issueId: string): Promise<{ success: boolean; message: string }> {
  await guard()
  try {
    const result = await regenerateIssueContent(issueId)
    revalidatePath(ADMIN_PATH)
    return result
  } catch (err) {
    console.error("[Newsletter] regenerateDraft failed:", err)
    return { success: false, message: "KI-Generierung fehlgeschlagen. Bitte erneut versuchen." }
  }
}

export async function previewIssueEmail(id: string): Promise<string> {
  await guard()
  const issue = await getIssue(id)
  if (!issue) return "<p>Ausgabe nicht gefunden</p>"
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://roebel.app"
  return renderNewsletterEmail({
    subject: issue.subject || "(Ohne Betreff)",
    preheader: issue.preheader,
    contentHtml: issue.content_html,
    unsubscribeUrl: `${baseUrl}/newsletter`,
  })
}

export async function sendTestEmail(
  issueId: string,
  to: string
): Promise<{ success: boolean; message: string }> {
  await guard()
  if (!EMAIL_RE.test(to.trim())) return { success: false, message: "Ungültige E-Mail-Adresse." }
  if (!resend) return { success: false, message: "Resend ist nicht konfiguriert." }
  const html = await previewIssueEmail(issueId)
  const issue = await getIssue(issueId)
  const { error } = await resend.emails.send({
    from: EMAIL_CONFIG.fromNewsletter,
    to: to.trim(),
    subject: `[TEST] ${issue?.subject || "Newsletter"}`,
    html,
  })
  if (error) return { success: false, message: "Versand fehlgeschlagen." }
  return { success: true, message: `Test-E-Mail an ${to.trim()} gesendet.` }
}

// ---------- Subscribers ----------

export async function getActiveSubscriberCount(): Promise<number> {
  await guard()
  const supabase = createAdminClient()
  const { count } = await supabase
    .from("newsletter_subscribers")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
  return count ?? 0
}

export async function listSubscribers(filter?: {
  search?: string
  status?: string
}): Promise<NewsletterSubscriber[]> {
  await guard()
  const supabase = createAdminClient()
  let query = supabase
    .from("newsletter_subscribers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000)
  if (filter?.status && filter.status !== "all") query = query.eq("status", filter.status)
  if (filter?.search) query = query.ilike("email", `%${filter.search.toLowerCase()}%`)
  const { data } = await query
  return (data as NewsletterSubscriber[]) ?? []
}

export async function addSubscriberManually(email: string): Promise<{ success: boolean; message: string }> {
  await guard()
  const normalized = email.trim().toLowerCase()
  if (!EMAIL_RE.test(normalized)) return { success: false, message: "Ungültige E-Mail-Adresse." }
  const supabase = createAdminClient()
  const { error } = await supabase.from("newsletter_subscribers").insert({
    email: normalized,
    status: "active",
    source: "admin",
    confirmed_at: new Date().toISOString(),
    consent_note: "Manuell im Admin-Dashboard hinzugefügt",
  })
  revalidatePath(ADMIN_PATH)
  if (error?.code === "23505") return { success: false, message: "Diese Adresse existiert bereits." }
  if (error) return { success: false, message: "Hinzufügen fehlgeschlagen." }
  return { success: true, message: `${normalized} hinzugefügt.` }
}

export async function importSubscribers(
  emails: string[]
): Promise<{ success: boolean; added: number; skipped: number }> {
  await guard()
  const supabase = createAdminClient()
  const valid = Array.from(
    new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))
  )
  const { data: existing } = await supabase.from("newsletter_subscribers").select("email")
  const existingSet = new Set((existing ?? []).map((r) => r.email))
  const fresh = valid.filter((e) => !existingSet.has(e))
  let added = 0
  for (let i = 0; i < fresh.length; i += 500) {
    const chunk = fresh.slice(i, i + 500).map((email) => ({
      email,
      status: "active" as const,
      source: "import" as const,
      confirmed_at: new Date().toISOString(),
      consent_note: "CSV-Import (Einwilligung lag laut Import vor)",
    }))
    const { error } = await supabase.from("newsletter_subscribers").insert(chunk)
    if (!error) added += chunk.length
  }
  revalidatePath(ADMIN_PATH)
  return { success: true, added, skipped: emails.length - added }
}

export async function setSubscriberUnsubscribed(id: string): Promise<{ success: boolean }> {
  await guard()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("newsletter_subscribers")
    .update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  revalidatePath(ADMIN_PATH)
  return { success: !error }
}

export async function deleteSubscriberById(id: string): Promise<{ success: boolean }> {
  await guard()
  const supabase = createAdminClient()
  const { error } = await supabase.from("newsletter_subscribers").delete().eq("id", id)
  revalidatePath(ADMIN_PATH)
  return { success: !error }
}

export async function exportSubscribersCsv(): Promise<string> {
  await guard()
  const subscribers = await listSubscribers()
  const header = "email,status,source,created_at"
  const rows = subscribers.map((s) => `${s.email},${s.status},${s.source},${s.created_at}`)
  return [header, ...rows].join("\n")
}

export async function inviteAppUsers(): Promise<{
  success: boolean
  invited: number
  alreadySubscribed: number
}> {
  await guard()
  const supabase = createAdminClient()
  const { data: users } = await supabase
    .from("users")
    .select("wallet_address, email")
    .not("email", "is", null)
    .neq("email", "")
  const { data: subs } = await supabase.from("newsletter_subscribers").select("email")
  const existingSet = new Set((subs ?? []).map((r) => r.email))
  const targets = (users ?? []).filter(
    (u) => u.email && EMAIL_RE.test(u.email) && !existingSet.has(u.email.toLowerCase())
  )
  let invited = 0
  for (const user of targets) {
    const { data: created } = await supabase
      .from("newsletter_subscribers")
      .insert({
        email: user.email!.toLowerCase(),
        status: "pending",
        source: "app_user",
        wallet_address: user.wallet_address,
        consent_note: "Einladung an bestehenden App-Nutzer",
      })
      .select("confirm_token")
      .single()
    if (created) {
      const ok = await sendConfirmationEmail(user.email!.toLowerCase(), created.confirm_token, "invite")
      if (ok) invited++
      await new Promise((r) => setTimeout(r, 600)) // Resend ~2 req/s
    }
  }
  revalidatePath(ADMIN_PATH)
  return { success: true, invited, alreadySubscribed: (users?.length ?? 0) - targets.length }
}
```

- [ ] **Step 2: Type-check**

Run from `apps/web`: `npx tsc --noEmit 2>&1 | grep -E "newsletter" ; echo "checked"`
Expected: no newsletter lines, then `checked`.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/newsletter.ts
git commit -m "feat(web): newsletter admin server actions (issues, subscribers, import, invite)"
git push
```

---

### Task 9: Admin sidebar entry + issues list page

**Files:**
- Modify: `apps/web/src/components/admin/admin-sidebar.tsx`
- Create: `apps/web/src/app/admin/dashboard/newsletter/page.tsx`
- Create: `apps/web/src/app/admin/dashboard/newsletter/_components/newsletter-nav.tsx`

**Interfaces:**
- Consumes: `listIssues`, `generateDraftNow`, `createBlankIssue`, `deleteIssue`, type `NewsletterIssue` from `@/app/actions/newsletter`.
- Produces: `NewsletterNav` component (`active: "ausgaben" | "abonnenten"` prop) reused by Task 12.

- [ ] **Step 1: Sidebar entry**

In `admin-sidebar.tsx`: import `Mail` from `lucide-react` (extend the existing import), then add to the `extraLinks` array (match neighboring entry style exactly):

```ts
{ name: "Newsletter", href: "/admin/dashboard/newsletter", icon: <Mail className="h-5 w-5" />, badgeKey: null },
```

- [ ] **Step 2: Shared sub-nav component `_components/newsletter-nav.tsx`**

```tsx
"use client"

import Link from "next/link"

export function NewsletterNav({ active }: { active: "ausgaben" | "abonnenten" }) {
  const base = "rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
  return (
    <div className="mb-6 flex gap-2">
      <Link
        href="/admin/dashboard/newsletter"
        className={`${base} ${active === "ausgaben" ? "bg-[#00498B] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
      >
        Ausgaben
      </Link>
      <Link
        href="/admin/dashboard/newsletter/abonnenten"
        className={`${base} ${active === "abonnenten" ? "bg-[#00498B] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
      >
        Abonnenten
      </Link>
    </div>
  )
}
```

- [ ] **Step 3: Issues list page `newsletter/page.tsx`** (client page, mirrors news list patterns)

```tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Sparkles, Plus, Trash2, Mail } from "lucide-react"
import { toast } from "sonner"
import {
  listIssues, generateDraftNow, createBlankIssue, deleteIssue,
  type NewsletterIssue,
} from "@/app/actions/newsletter"
import { NewsletterNav } from "./_components/newsletter-nav"

const STATUS_BADGE: Record<NewsletterIssue["status"], { label: string; className: string }> = {
  draft: { label: "Entwurf", className: "bg-amber-100 text-amber-800" },
  sending: { label: "Wird gesendet…", className: "bg-blue-100 text-blue-800" },
  sent: { label: "Gesendet", className: "bg-green-100 text-green-800" },
  failed: { label: "Fehlgeschlagen", className: "bg-red-100 text-red-800" },
}

export default function NewsletterIssuesPage() {
  const router = useRouter()
  const [issues, setIssues] = useState<NewsletterIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setIssues(await listIssues())
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleGenerate() {
    setGenerating(true)
    const t = toast.loading("KI schreibt den Entwurf… (kann bis zu einer Minute dauern)")
    const result = await generateDraftNow()
    setGenerating(false)
    if (result.success && result.issueId) {
      toast.success("Entwurf erstellt", { id: t })
      router.push(`/admin/dashboard/newsletter/${result.issueId}`)
    } else {
      toast.error(result.message, { id: t })
    }
  }

  async function handleNewBlank() {
    const result = await createBlankIssue()
    if (result.success && result.issueId) {
      router.push(`/admin/dashboard/newsletter/${result.issueId}`)
    } else {
      toast.error("Erstellen fehlgeschlagen")
    }
  }

  async function handleDelete(id: string) {
    const result = await deleteIssue(id)
    if (result.success) {
      toast.success(result.message)
      load()
    } else {
      toast.error(result.message)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Newsletter</h1>
          <p className="text-sm text-gray-500">Wöchentlicher Newsletter — KI-Entwurf, manueller Versand</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleNewBlank}>
            <Plus className="mr-2 h-4 w-4" /> Neue Ausgabe
          </Button>
          <Button onClick={handleGenerate} disabled={generating} className="bg-[#00498B] hover:bg-[#003a70]">
            <Sparkles className="mr-2 h-4 w-4" /> Jetzt generieren
          </Button>
        </div>
      </div>

      <NewsletterNav active="ausgaben" />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : issues.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#B4B8C1] p-12 text-center text-gray-500">
          <Mail className="mx-auto mb-3 h-8 w-8" />
          Noch keine Ausgaben. Erstelle die erste mit „Jetzt generieren“.
        </div>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => {
            const badge = STATUS_BADGE[issue.status]
            return (
              <div
                key={issue.id}
                className="flex cursor-pointer items-center justify-between rounded-xl border border-gray-200 bg-white p-4 hover:border-[#00498B]/40"
                onClick={() => router.push(`/admin/dashboard/newsletter/${issue.id}`)}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge className={badge.className}>{badge.label}</Badge>
                    {issue.generated_by === "ai" && (
                      <Badge className="bg-purple-100 text-purple-800">KI</Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate font-medium text-gray-900">
                    {issue.subject || "(Ohne Betreff)"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(issue.created_at).toLocaleDateString("de-DE")}
                    {issue.status === "sent" &&
                      ` · ${issue.recipient_count} Empfänger · ${issue.opened_count} geöffnet · ${issue.clicked_count} geklickt`}
                  </p>
                </div>
                {issue.status === "draft" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Entwurf löschen?</AlertDialogTitle>
                        <AlertDialogDescription>Das kann nicht rückgängig gemacht werden.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(issue.id)}>Löschen</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify manually**

`pnpm dev`, log into `/admin/login`, open `/admin/dashboard/newsletter`. Expected: "Newsletter" appears in the sidebar under "Weitere"; the list shows the Task-6 draft with an "Entwurf" + "KI" badge.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/admin-sidebar.tsx src/app/admin/dashboard/newsletter/page.tsx src/app/admin/dashboard/newsletter/_components/newsletter-nav.tsx
git commit -m "feat(web): newsletter admin — sidebar entry + issues list"
git push
```

---

### Task 10: Issue editor page (edit, preview, test send, send trigger)

**Files:**
- Create: `apps/web/src/app/admin/dashboard/newsletter/[id]/page.tsx`

**Interfaces:**
- Consumes: `getIssue`, `updateIssue`, `previewIssueEmail`, `sendTestEmail`, `regenerateDraft`, `getActiveSubscriberCount`, type `NewsletterIssue` from `@/app/actions/newsletter`; `RichTextEditor` from `@/components/editor/rich-text-editor`; `POST /api/newsletter/send` (Task 11 — until it exists the Senden button 404s, that's expected mid-plan).

- [ ] **Step 1: Write the editor page**

```tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { RichTextEditor } from "@/components/editor/rich-text-editor"
import { ArrowLeft, Save, Eye, Pencil, Send, Sparkles, FlaskConical } from "lucide-react"
import { toast } from "sonner"
import {
  getIssue, updateIssue, previewIssueEmail, sendTestEmail, regenerateDraft,
  getActiveSubscriberCount, type NewsletterIssue,
} from "@/app/actions/newsletter"

export default function NewsletterIssueEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [issue, setIssue] = useState<NewsletterIssue | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [subject, setSubject] = useState("")
  const [preheader, setPreheader] = useState("")
  const [contentHtml, setContentHtml] = useState("")
  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState("")
  const [testEmail, setTestEmail] = useState("")
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getIssue(id)
    if (data) {
      setIssue(data)
      setSubject(data.subject)
      setPreheader(data.preheader ?? "")
      setContentHtml(data.content_html)
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const isDraft = issue?.status === "draft"

  async function handleSave(): Promise<boolean> {
    setSaving(true)
    const result = await updateIssue(id, { subject, preheader, content_html: contentHtml })
    setSaving(false)
    if (result.success) toast.success(result.message)
    else toast.error(result.message)
    return result.success
  }

  async function handlePreviewToggle() {
    if (!showPreview) {
      if (isDraft) await handleSave()
      setPreviewHtml(await previewIssueEmail(id))
    }
    setShowPreview(!showPreview)
  }

  async function handleTestSend() {
    if (isDraft) await handleSave()
    const result = await sendTestEmail(id, testEmail)
    if (result.success) toast.success(result.message)
    else toast.error(result.message)
  }

  async function handleRegenerate() {
    const t = toast.loading("KI schreibt neu… (kann bis zu einer Minute dauern)")
    const result = await regenerateDraft(id)
    if (result.success) {
      toast.success(result.message, { id: t })
      load()
    } else {
      toast.error(result.message, { id: t })
    }
  }

  async function openSendDialog() {
    setRecipientCount(await getActiveSubscriberCount())
  }

  async function handleSend() {
    if (!(await handleSave())) return
    setSending(true)
    const t = toast.loading("Newsletter wird versendet…")
    try {
      const res = await fetch("/api/newsletter/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: id }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Gesendet an ${data.sent} Empfänger${data.failed ? `, ${data.failed} fehlgeschlagen` : ""}.`, { id: t })
        load()
      } else {
        toast.error(data.error ?? "Versand fehlgeschlagen.", { id: t })
      }
    } catch {
      toast.error("Versand fehlgeschlagen.", { id: t })
    }
    setSending(false)
  }

  async function handleRetryFailed() {
    setSending(true)
    const t = toast.loading("Fehlgeschlagene werden erneut gesendet…")
    const res = await fetch("/api/newsletter/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId: id, retryFailedOnly: true }),
    })
    const data = await res.json()
    if (res.ok) toast.success(`${data.sent} erneut gesendet.`, { id: t })
    else toast.error(data.error ?? "Fehlgeschlagen.", { id: t })
    setSending(false)
    load()
  }

  if (loading) return <div className="p-6"><Skeleton className="h-96 w-full rounded-xl" /></div>
  if (!issue) return <div className="p-6 text-gray-500">Ausgabe nicht gefunden.</div>

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin/dashboard/newsletter")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {isDraft ? "Ausgabe bearbeiten" : issue.subject || "Ausgabe"}
            </h1>
            {issue.status === "sent" && issue.sent_at && (
              <p className="text-xs text-gray-500">
                Gesendet am {new Date(issue.sent_at).toLocaleString("de-DE")} ·{" "}
                {issue.recipient_count} Empfänger · {issue.delivered_count} zugestellt ·{" "}
                {issue.opened_count} geöffnet · {issue.clicked_count} geklickt · {issue.bounced_count} Bounces
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {isDraft && issue.generated_by === "ai" && (
            <Button variant="outline" onClick={handleRegenerate}>
              <Sparkles className="mr-2 h-4 w-4" /> Neu generieren
            </Button>
          )}
          <Button variant="outline" onClick={handlePreviewToggle}>
            {showPreview ? <Pencil className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
            {showPreview ? "Bearbeiten" : "Vorschau"}
          </Button>
          {isDraft && (
            <>
              <Button variant="outline" onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" /> Speichern
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="bg-[#00498B] hover:bg-[#003a70]" onClick={openSendDialog} disabled={sending}>
                    <Send className="mr-2 h-4 w-4" /> Senden
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Newsletter jetzt versenden?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {recipientCount === null
                        ? "Empfänger werden gezählt…"
                        : `Diese Ausgabe wird sofort an ${recipientCount} aktive Abonnenten gesendet. Das kann nicht rückgängig gemacht werden.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSend} disabled={!recipientCount}>
                      Jetzt senden
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          {issue.status === "failed" && (
            <Button variant="outline" onClick={handleRetryFailed} disabled={sending}>
              Fehlgeschlagene erneut senden
            </Button>
          )}
        </div>
      </div>

      {showPreview ? (
        <iframe
          srcDoc={previewHtml}
          title="E-Mail-Vorschau"
          className="h-[75vh] w-full rounded-xl border border-gray-200 bg-white"
        />
      ) : (
        <div className="space-y-4">
          <div>
            <Label htmlFor="subject">Betreff</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!isDraft} placeholder="Betreff der Ausgabe" />
          </div>
          <div>
            <Label htmlFor="preheader">Vorschautext (Preheader)</Label>
            <Input id="preheader" value={preheader} onChange={(e) => setPreheader(e.target.value)} disabled={!isDraft} placeholder="Kurzer Text, der im Posteingang neben dem Betreff erscheint" />
          </div>
          <div>
            <Label>Inhalt</Label>
            {isDraft ? (
              <RichTextEditor content={contentHtml} onChange={setContentHtml} placeholder="Newsletter-Inhalt…" />
            ) : (
              <div className="prose max-w-none rounded-xl border border-gray-200 bg-white p-6" dangerouslySetInnerHTML={{ __html: issue.content_html }} />
            )}
          </div>
          {isDraft && (
            <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex-1">
                <Label htmlFor="test-email">Test-E-Mail an</Label>
                <Input id="test-email" type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="deine@email.de" />
              </div>
              <Button variant="outline" onClick={handleTestSend}>
                <FlaskConical className="mr-2 h-4 w-4" /> Test senden
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

Open the Task-6 draft in the editor. Expected: subject/preheader/content load; edit + Speichern works (toast); Vorschau shows the navy-header email in the iframe; "Test senden" to your own address delivers a real `[TEST]` email; "Neu generieren" replaces the content.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/dashboard/newsletter/[id]/page.tsx"
git commit -m "feat(web): newsletter issue editor — edit, preview, test send, send trigger"
git push
```

---

### Task 11: Batch send pipeline

**Files:**
- Create: `apps/web/src/app/api/newsletter/send/route.ts`

**Interfaces:**
- Consumes: `requireAdmin` from `@/lib/miniapp/http`, `createAdminClient()`, `renderNewsletterEmail`, `resend`/`EMAIL_CONFIG`.
- Produces: `POST /api/newsletter/send` body `{ issueId: string, retryFailedOnly?: boolean }` → `200 { sent: number, failed: number }` | `4xx/5xx { error: string }`. Exactly what Task 10's buttons call.

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/miniapp/http"
import { createAdminClient } from "@/lib/supabase/admin"
import { resend, EMAIL_CONFIG } from "@/lib/resend"
import { renderNewsletterEmail } from "@/lib/newsletter/template"

export const runtime = "nodejs"
export const maxDuration = 300

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://roebel.app"
const BATCH_SIZE = 100

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  if (!resend) return NextResponse.json({ error: "Resend nicht konfiguriert" }, { status: 500 })

  const { issueId, retryFailedOnly } = (await req.json()) as {
    issueId?: string
    retryFailedOnly?: boolean
  }
  if (!issueId) return NextResponse.json({ error: "issueId fehlt" }, { status: 400 })

  const supabase = createAdminClient()
  const { data: issue } = await supabase
    .from("newsletter_issues")
    .select("*")
    .eq("id", issueId)
    .maybeSingle()
  if (!issue) return NextResponse.json({ error: "Ausgabe nicht gefunden" }, { status: 404 })
  if (!issue.subject?.trim()) return NextResponse.json({ error: "Betreff fehlt" }, { status: 400 })

  // Lock: draft → sending (normal send) / sent|failed → sending (retry).
  const fromStatuses = retryFailedOnly ? ["sent", "failed"] : ["draft"]
  const { data: locked } = await supabase
    .from("newsletter_issues")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", issueId)
    .in("status", fromStatuses)
    .select("id")
  if (!locked?.length) {
    return NextResponse.json(
      { error: retryFailedOnly ? "Kein erneuter Versand möglich." : "Ausgabe ist kein Entwurf (läuft der Versand bereits?)" },
      { status: 409 }
    )
  }

  try {
    // Build the recipient list.
    let recipients: Array<{ sendId: string; subscriberId: string; email: string; unsubscribeToken: string }> = []

    if (retryFailedOnly) {
      const { data: failedSends } = await supabase
        .from("newsletter_sends")
        .select("id, subscriber_id, email, newsletter_subscribers(unsubscribe_token, status)")
        .eq("issue_id", issueId)
        .eq("status", "failed")
      recipients = (failedSends ?? [])
        .filter((s: any) => s.newsletter_subscribers?.status === "active")
        .map((s: any) => ({
          sendId: s.id,
          subscriberId: s.subscriber_id,
          email: s.email,
          unsubscribeToken: s.newsletter_subscribers.unsubscribe_token,
        }))
    } else {
      const { data: subscribers } = await supabase
        .from("newsletter_subscribers")
        .select("id, email, unsubscribe_token")
        .eq("status", "active")
      const subs = subscribers ?? []
      if (subs.length === 0) {
        await supabase
          .from("newsletter_issues")
          .update({ status: "draft", updated_at: new Date().toISOString() })
          .eq("id", issueId)
        return NextResponse.json({ error: "Keine aktiven Abonnenten." }, { status: 400 })
      }
      const rows = subs.map((s) => ({ issue_id: issueId, subscriber_id: s.id, email: s.email }))
      const { data: sendRows, error: insertError } = await supabase
        .from("newsletter_sends")
        .upsert(rows, { onConflict: "issue_id,subscriber_id", ignoreDuplicates: true })
        .select("id, subscriber_id, email")
      if (insertError) throw insertError
      const tokenBySubscriber = new Map(subs.map((s) => [s.id, s.unsubscribe_token]))
      recipients = (sendRows ?? []).map((r) => ({
        sendId: r.id,
        subscriberId: r.subscriber_id,
        email: r.email,
        unsubscribeToken: tokenBySubscriber.get(r.subscriber_id)!,
      }))
    }

    let sent = 0
    let failed = 0

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE)
      const payloads = batch.map((r) => {
        const unsubscribeUrl = `${BASE_URL}/newsletter/abmelden?token=${r.unsubscribeToken}`
        const oneClickUrl = `${BASE_URL}/api/newsletter/unsubscribe?token=${r.unsubscribeToken}`
        return {
          from: EMAIL_CONFIG.fromNewsletter,
          to: r.email,
          replyTo: EMAIL_CONFIG.replyTo,
          subject: issue.subject,
          html: renderNewsletterEmail({
            subject: issue.subject,
            preheader: issue.preheader,
            contentHtml: issue.content_html,
            unsubscribeUrl,
          }),
          headers: {
            "List-Unsubscribe": `<${oneClickUrl}>, <mailto:${EMAIL_CONFIG.replyTo}?subject=Newsletter%20abbestellen>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }
      })

      try {
        const { data, error } = await resend.batch.send(payloads)
        if (error) throw error
        const ids: Array<{ id: string }> = (data as any)?.data ?? []
        await Promise.all(
          batch.map((r, idx) =>
            supabase
              .from("newsletter_sends")
              .update({ status: "sent", resend_id: ids[idx]?.id ?? null })
              .eq("id", r.sendId)
          )
        )
        sent += batch.length
      } catch (batchError) {
        console.error("[Newsletter] batch failed:", batchError)
        await Promise.all(
          batch.map((r) =>
            supabase.from("newsletter_sends").update({ status: "failed" }).eq("id", r.sendId)
          )
        )
        failed += batch.length
      }
      if (i + BATCH_SIZE < recipients.length) await sleep(600) // Resend ~2 req/s
    }

    const finalStatus = sent === 0 && failed > 0 ? "failed" : "sent"
    await supabase
      .from("newsletter_issues")
      .update({
        status: finalStatus,
        recipient_count: retryFailedOnly ? issue.recipient_count : recipients.length,
        sent_at: issue.sent_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", issueId)

    return NextResponse.json({ sent, failed })
  } catch (error) {
    console.error("[Newsletter] send pipeline error:", error)
    await supabase
      .from("newsletter_issues")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", issueId)
    return NextResponse.json({ error: "Versand fehlgeschlagen" }, { status: 500 })
  }
}
```

**Known risk (documented in spec):** if Resend's batch endpoint rejects the `headers` field, the batch errors land in the catch → rows marked `failed`. If that happens during verification, move `List-Unsubscribe` handling to the HTML footer only (delete the `headers` key) — the footer link already covers unsubscribe.

- [ ] **Step 2: Verify with a tiny real send**

1. In the admin Abonnenten UI (or via SQL), ensure exactly 1–2 `active` subscribers exist — **your own addresses** (`insert into newsletter_subscribers (email, status, source, confirmed_at) values ('max.brych03@gmail.com','active','admin', now());` via MCP `execute_sql`).
2. In the editor, click Senden → confirm.
Expected: toast "Gesendet an N Empfänger"; email arrives with working Abmelden link; issue shows status "Gesendet"; `newsletter_sends` rows have `status='sent'` and `resend_id` set.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/newsletter/send/route.ts
git commit -m "feat(web): newsletter batch send pipeline via Resend"
git push
```

---

### Task 12: Subscribers admin page (table, add, CSV import/export, invite)

**Files:**
- Create: `apps/web/src/app/admin/dashboard/newsletter/abonnenten/page.tsx`

**Interfaces:**
- Consumes: `listSubscribers`, `addSubscriberManually`, `importSubscribers`, `setSubscriberUnsubscribed`, `deleteSubscriberById`, `exportSubscribersCsv`, `inviteAppUsers`, type `NewsletterSubscriber` from `@/app/actions/newsletter`; `NewsletterNav` from Task 9.
- CSV import = client-side: read file as text, extract emails with a regex (handles any CSV/TSV/plain-list format).

- [ ] **Step 1: Write the page**

```tsx
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Search, UserPlus, Upload, Download, Send, Trash2, BellOff } from "lucide-react"
import { toast } from "sonner"
import {
  listSubscribers, addSubscriberManually, importSubscribers, setSubscriberUnsubscribed,
  deleteSubscriberById, exportSubscribersCsv, inviteAppUsers,
  type NewsletterSubscriber,
} from "@/app/actions/newsletter"
import { NewsletterNav } from "../_components/newsletter-nav"

const EMAIL_EXTRACT_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

const STATUS_LABEL: Record<NewsletterSubscriber["status"], { label: string; className: string }> = {
  active: { label: "Aktiv", className: "bg-green-100 text-green-800" },
  pending: { label: "Unbestätigt", className: "bg-amber-100 text-amber-800" },
  unsubscribed: { label: "Abgemeldet", className: "bg-gray-100 text-gray-600" },
  bounced: { label: "Bounce", className: "bg-red-100 text-red-800" },
  complained: { label: "Beschwerde", className: "bg-red-100 text-red-800" },
}

const SOURCE_LABEL: Record<NewsletterSubscriber["source"], string> = {
  signup: "Anmeldung",
  import: "Import",
  app_user: "App-Nutzer",
  admin: "Manuell",
}

export default function NewsletterSubscribersPage() {
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [newEmail, setNewEmail] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setSubscribers(await listSubscribers({ search, status: statusFilter }))
    setLoading(false)
  }, [search, statusFilter])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  async function handleAdd() {
    const result = await addSubscriberManually(newEmail)
    if (result.success) {
      toast.success(result.message)
      setNewEmail("")
      load()
    } else {
      toast.error(result.message)
    }
  }

  async function handleImportFile(file: File) {
    const text = await file.text()
    const emails = Array.from(new Set(text.match(EMAIL_EXTRACT_RE) ?? []))
    if (emails.length === 0) {
      toast.error("Keine E-Mail-Adressen in der Datei gefunden.")
      return
    }
    const t = toast.loading(`${emails.length} Adressen werden importiert…`)
    const result = await importSubscribers(emails)
    toast.success(`${result.added} importiert, ${result.skipped} übersprungen (Duplikate/ungültig).`, { id: t })
    load()
  }

  async function handleExport() {
    const csv = await exportSubscribersCsv()
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `newsletter-abonnenten-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleInvite() {
    const t = toast.loading("Einladungen werden versendet… (dauert bei vielen Nutzern etwas)")
    const result = await inviteAppUsers()
    toast.success(
      `${result.invited} Einladungen versendet. ${result.alreadySubscribed} Nutzer waren bereits eingetragen.`,
      { id: t }
    )
    load()
  }

  async function handleUnsubscribe(id: string) {
    const result = await setSubscriberUnsubscribed(id)
    if (result.success) { toast.success("Abgemeldet.") ; load() } else toast.error("Fehlgeschlagen.")
  }

  async function handleDelete(id: string) {
    const result = await deleteSubscriberById(id)
    if (result.success) { toast.success("Gelöscht (DSGVO).") ; load() } else toast.error("Fehlgeschlagen.")
  }

  const counts = subscribers.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Abonnenten</h1>
          <p className="text-sm text-gray-500">
            {counts.active ?? 0} aktiv · {counts.pending ?? 0} unbestätigt · {counts.unsubscribed ?? 0} abgemeldet
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImportFile(file)
              e.target.value = ""
            }}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> CSV-Import
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="bg-[#00498B] hover:bg-[#003a70]">
                <Send className="mr-2 h-4 w-4" /> Bestehende Nutzer einladen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>App-Nutzer einladen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Alle App-Nutzer mit E-Mail-Adresse, die noch nicht im Verteiler sind, erhalten
                  eine Einladungs-E-Mail mit Bestätigungslink (Double-Opt-in). Bereits
                  eingeladene oder eingetragene Nutzer werden übersprungen.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={handleInvite}>Einladungen senden</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <NewsletterNav active="abonnenten" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input className="pl-9" placeholder="E-Mail suchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="active">Aktiv</SelectItem>
            <SelectItem value="pending">Unbestätigt</SelectItem>
            <SelectItem value="unsubscribed">Abgemeldet</SelectItem>
            <SelectItem value="bounced">Bounce</SelectItem>
            <SelectItem value="complained">Beschwerde</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input
            className="w-[220px]"
            type="email"
            placeholder="neue@email.de"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button variant="outline" onClick={handleAdd}>
            <UserPlus className="mr-2 h-4 w-4" /> Hinzufügen
          </Button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                <th className="px-4 py-3">E-Mail</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Quelle</th>
                <th className="px-4 py-3">Seit</th>
                <th className="px-4 py-3 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">Keine Abonnenten gefunden.</td></tr>
              ) : (
                subscribers.map((s) => {
                  const badge = STATUS_LABEL[s.status]
                  return (
                    <tr key={s.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-gray-900">{s.email}</td>
                      <td className="px-4 py-3"><Badge className={badge.className}>{badge.label}</Badge></td>
                      <td className="px-4 py-3 text-gray-600">{SOURCE_LABEL[s.source]}</td>
                      <td className="px-4 py-3 text-gray-500">{new Date(s.created_at).toLocaleDateString("de-DE")}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {s.status === "active" && (
                            <Button variant="ghost" size="icon" title="Abmelden" onClick={() => handleUnsubscribe(s.id)}>
                              <BellOff className="h-4 w-4 text-gray-500" />
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" title="Endgültig löschen (DSGVO)">
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{s.email} endgültig löschen?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Entfernt alle Daten dieser Person unwiderruflich (DSGVO-Löschung).
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(s.id)}>Löschen</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

Open `/admin/dashboard/newsletter/abonnenten`. Expected: table lists the Task-11 test subscribers; add a subscriber (appears as "Manuell"/"Aktiv"); import a small test .txt containing two emails (toast reports counts); export downloads a CSV; search + status filter work; unsubscribe + delete work.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/dashboard/newsletter/abonnenten/page.tsx
git commit -m "feat(web): newsletter subscriber management — table, CSV import/export, user invites"
git push
```

---

### Task 13: Resend webhook + env docs + final E2E

**Files:**
- Create: `apps/web/src/app/api/newsletter/webhook/route.ts`
- Modify: `apps/web/.env.example` (add `RESEND_WEBHOOK_SECRET`, `NEWSLETTER_ADMIN_EMAIL`)

**Interfaces:**
- Consumes: `createAdminClient()`, RPC `newsletter_bump_counter` (Task 1).
- Produces: `POST /api/newsletter/webhook` — svix-signature-verified Resend event sink.

- [ ] **Step 1: Write the webhook route (hand-rolled svix verification — no new dependency)**

Svix signs `${svix-id}.${svix-timestamp}.${rawBody}` with HMAC-SHA256 using the base64-decoded secret after the `whsec_` prefix; the `svix-signature` header holds space-separated `v1,<base64sig>` entries.

```ts
import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

function verifySvixSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  payload: string,
  svixSignature: string
): boolean {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
  const expected = crypto
    .createHmac("sha256", secretBytes)
    .update(`${svixId}.${svixTimestamp}.${payload}`)
    .digest("base64")
  const expectedBuf = Buffer.from(expected)
  return svixSignature.split(" ").some((part) => {
    const sig = part.split(",")[1]
    if (!sig) return false
    const sigBuf = Buffer.from(sig)
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)
  })
}

type ResendEvent = {
  type: string
  data: { email_id?: string }
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    console.error("[Newsletter] RESEND_WEBHOOK_SECRET not set")
    return NextResponse.json({ error: "not configured" }, { status: 500 })
  }

  const payload = await req.text()
  const svixId = req.headers.get("svix-id") ?? ""
  const svixTimestamp = req.headers.get("svix-timestamp") ?? ""
  const svixSignature = req.headers.get("svix-signature") ?? ""
  if (!verifySvixSignature(secret, svixId, svixTimestamp, payload, svixSignature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 })
  }

  const event = JSON.parse(payload) as ResendEvent
  const emailId = event.data?.email_id
  if (!emailId) return NextResponse.json({ ok: true })

  const supabase = createAdminClient()
  const { data: send } = await supabase
    .from("newsletter_sends")
    .select("id, issue_id, subscriber_id, status, opened_at, clicked_at")
    .eq("resend_id", emailId)
    .maybeSingle()
  // Not one of ours (other product emails share the Resend account) → ack.
  if (!send) return NextResponse.json({ ok: true })

  const now = new Date().toISOString()

  switch (event.type) {
    case "email.delivered": {
      if (send.status === "sent" || send.status === "queued") {
        await supabase.from("newsletter_sends").update({ status: "delivered" }).eq("id", send.id)
        await supabase.rpc("newsletter_bump_counter", { p_issue_id: send.issue_id, p_counter: "delivered_count" })
      }
      break
    }
    case "email.opened": {
      if (!send.opened_at) {
        await supabase.from("newsletter_sends").update({ opened_at: now }).eq("id", send.id)
        await supabase.rpc("newsletter_bump_counter", { p_issue_id: send.issue_id, p_counter: "opened_count" })
      }
      break
    }
    case "email.clicked": {
      if (!send.clicked_at) {
        await supabase.from("newsletter_sends").update({ clicked_at: now }).eq("id", send.id)
        await supabase.rpc("newsletter_bump_counter", { p_issue_id: send.issue_id, p_counter: "clicked_count" })
      }
      break
    }
    case "email.bounced": {
      if (send.status !== "bounced") {
        await supabase.from("newsletter_sends").update({ status: "bounced" }).eq("id", send.id)
        await supabase.rpc("newsletter_bump_counter", { p_issue_id: send.issue_id, p_counter: "bounced_count" })
        await supabase
          .from("newsletter_subscribers")
          .update({ status: "bounced", updated_at: now })
          .eq("id", send.subscriber_id)
      }
      break
    }
    case "email.complained": {
      await supabase.from("newsletter_sends").update({ status: "complained" }).eq("id", send.id)
      await supabase
        .from("newsletter_subscribers")
        .update({ status: "complained", updated_at: now })
        .eq("id", send.subscriber_id)
      break
    }
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Smoke-check signature verification**

```bash
npx tsx -e "
import crypto from 'crypto'
const secret = 'whsec_' + Buffer.from('testsecret').toString('base64')
const id = 'msg_x', ts = '1700000000', body = '{\"type\":\"email.delivered\",\"data\":{\"email_id\":\"re_1\"}}'
const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
const sig = crypto.createHmac('sha256', secretBytes).update(id + '.' + ts + '.' + body).digest('base64')
// replicate route logic:
const expected = crypto.createHmac('sha256', secretBytes).update(id + '.' + ts + '.' + body).digest('base64')
const ok = ('v1,' + sig).split(' ').some(p => { const s = p.split(',')[1]; return s === expected })
if (!ok) throw new Error('verify logic broken')
console.log('svix verify OK')
"
```
Expected: `svix verify OK`

- [ ] **Step 3: Add env vars to `apps/web/.env.example`**

```bash
# Newsletter (Resend webhook signing secret — Resend Dashboard → Webhooks)
RESEND_WEBHOOK_SECRET=whsec_placeholder
# Optional: where "Entwurf bereit" notifications go (default: support@roebel.app)
NEWSLETTER_ADMIN_EMAIL=
```

- [ ] **Step 4: Full build**

Run from `apps/web`: `pnpm build 2>&1 | tail -15`
Expected: success, all newsletter routes listed, no new type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/newsletter/webhook/route.ts .env.example
git commit -m "feat(web): resend webhook for newsletter delivery/open/click/bounce tracking"
git push
```

- [ ] **Step 6: Manual E2E checklist (report results to Max)**

1. `/newsletter` → sign up with a real address → confirmation email arrives → confirm link → "Willkommen an Bord".
2. Admin: subscriber visible as Aktiv/Anmeldung.
3. "Jetzt generieren" → draft opens → edit → Vorschau renders → Test senden arrives.
4. Senden to the small test list → email arrives, Abmelden link works (status flips to Abgemeldet).
5. After configuring the webhook in the Resend dashboard (URL `https://roebel.app/api/newsletter/webhook`, events: delivered/opened/clicked/bounced/complained; put the signing secret into Vercel env `RESEND_WEBHOOK_SECRET`): send again and watch delivered/opened counts rise on the issue.

**Post-deploy manual steps for Max (not code):**
- Vercel env: add `RESEND_WEBHOOK_SECRET` (+ optionally `NEWSLETTER_ADMIN_EMAIL`).
- Resend dashboard: create the webhook endpoint.
- When AGB/Datenschutzerklärung are updated: flip `app_settings.newsletter_auto_enroll` to `on`.
