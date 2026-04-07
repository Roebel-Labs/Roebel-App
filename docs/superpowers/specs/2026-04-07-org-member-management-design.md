# Org Member Management + Invite System — Design Spec

## 1. Context

The Roebel app already has an account system (`accounts` + `account_owners` with owner/admin/member roles) but lacks a UI for managing org members and an invite flow. This feature adds:

- **"Verwalten" page** for member CRUD on organisation accounts
- **In-app invite** (search by name, assign role, sends notification)
- **Link invite** (single-use token, deep link, share sheet)
- **Notification inbox** (new `notifications` table, bell icon with badge, actionable invite cards)
- **Invite link landing page** (org info + accept/reject)
- **Self-leave** for members who want to leave an org

## 2. Database Schema

### 2.1 New Table: `notifications`

Generic inbox for all user-to-user notification types.

```sql
CREATE TABLE IF NOT EXISTS public.notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_wallet TEXT NOT NULL,
  type             TEXT NOT NULL,  -- 'org_invite', future: 'event_reminder', 'mention'
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,
  metadata         JSONB DEFAULT '{}',
  is_read          BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient_wallet);
CREATE INDEX idx_notifications_recipient_unread ON notifications(recipient_wallet, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- Open RLS policies (app uses anon key, filters by wallet client-side)
CREATE POLICY "notifications_select" ON notifications FOR SELECT USING (true);
CREATE POLICY "notifications_insert" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notifications_update" ON notifications FOR UPDATE USING (true);
CREATE POLICY "notifications_delete" ON notifications FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
```

**`metadata` shape for `org_invite`:**
```json
{ "account_id": "uuid", "role": "admin|member", "invitation_id": "uuid" }
```

### 2.2 New Table: `invite_tokens`

Tracks in-app and link-based invites.

```sql
CREATE TABLE IF NOT EXISTS public.invite_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  invited_by      TEXT NOT NULL,
  invited_wallet  TEXT,  -- NULL for link invites, set for in-app invites
  token           TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'revoked')),
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invite_tokens_account ON invite_tokens(account_id);
CREATE INDEX idx_invite_tokens_invited_wallet ON invite_tokens(invited_wallet);
CREATE INDEX idx_invite_tokens_token ON invite_tokens(token);
CREATE INDEX idx_invite_tokens_status ON invite_tokens(status) WHERE status = 'pending';

ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invite_tokens_select" ON invite_tokens FOR SELECT USING (true);
CREATE POLICY "invite_tokens_insert" ON invite_tokens FOR INSERT WITH CHECK (true);
CREATE POLICY "invite_tokens_update" ON invite_tokens FOR UPDATE USING (true);
```

### 2.3 Migration

Single file: `supabase/migrations/011_member_management.sql`

### 2.4 Invite Expiry

Client-side: check `expires_at` before rendering accept/decline buttons. Optional pg_cron to batch-update expired invites.

---

## 3. API / Query Layer

### 3.1 `lib/supabase-invites.ts`

```
createInAppInvite(accountId, invitedWallet, role, invitedBy, expiresInDays)
  → inserts invite_tokens (with invited_wallet) + notifications row

createLinkInvite(accountId, role, invitedBy, expiresInDays)
  → inserts invite_tokens (no invited_wallet), returns token for URL

acceptInvite(inviteId, acceptingWallet)
  → verify pending + not expired → update status='accepted' → insert account_owners → update notification

declineInvite(inviteId, decliningWallet)
  → update status='declined' → update notification

revokeInvite(inviteId)
  → set status='revoked' → delete notification

fetchPendingInvites(accountId) → InviteTokenWithUser[]
fetchInviteByToken(token) → InviteTokenWithAccount | null
hasPendingInvite(accountId, walletAddress) → boolean
```

### 3.2 `lib/supabase-member-notifications.ts`

```
fetchUserNotifications(walletAddress, page) → { data, hasMore }
markNotificationRead(notificationId)
markAllNotificationsRead(walletAddress)
getUnreadNotificationCount(walletAddress) → number
deleteNotification(notificationId)
```

### 3.3 `lib/supabase-member-management.ts`

```
fetchMembersWithProfiles(accountId) → MemberWithProfile[]
removeMember(accountId, walletAddress)
leaveOrg(accountId, walletAddress) — self-removal, blocks sole owner
searchUsersForInvite(query, excludeWallets) → UserRecord[]
```

### 3.4 Types (add to `lib/types.ts`)

```typescript
type InviteTokenStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
type InviteToken = { id, account_id, role, invited_by, invited_wallet, token, status, expires_at, created_at };
type InviteTokenWithUser = InviteToken & { invited_user?: { username, profile_picture_url, tier } };
type InviteTokenWithAccount = InviteToken & { account: Account; inviter?: { username, profile_picture_url } };
type UserNotification = { id, recipient_wallet, type, title, body, metadata, is_read, created_at };
type MemberWithProfile = AccountOwner & { user: { username, profile_picture_url, tier } };
type OrgRole = 'owner' | 'admin' | 'member';
```

### 3.5 Update `lib/supabase-account-roles.ts`

Add `canLeaveOrg(role, ownerCount)` — returns false if sole owner.

---

## 4. UI Components

### 4.1 `components/OrgRoleBadge.tsx`

Role badge colors:

| Role | Background | Label Color |
|------|-----------|-------------|
| **Owner** (Inhaber) | Primary `#194383` | White `#FFFFFF` |
| **Admin** | Light blue `#DBEAFE` (light) / `#1E3A5F` (dark) | Primary `#194383` (light) / `#8AB4F8` (dark) |
| **Member** (Mitglied) | Grey `#E5E7EB` (light) / `#374151` (dark) | Grey `#4B5563` (light) / `#9CA3AF` (dark) |

German labels: Owner → "Inhaber", Admin → "Admin", Member → "Mitglied"

### 4.2 `app/org/manage.tsx` — Verwalten Page

**Entry:** New `ProfileMenuItem` in `app/profile.tsx` below "Profil bearbeiten", visible only when `activeAccount?.account_type === 'organisation'`.

**Layout:**
1. Header: back arrow + "Mitglieder verwalten" + "+ Einladen" button (owner only)
2. Member list: avatar (44x44), username, `OrgRoleBadge`, "Beigetreten: {date}"
   - Owner rows: no overflow menu
   - Non-owner rows (owner viewing): ⋮ menu → "Rolle ändern", "Entfernen"
   - Non-owner/admin/member viewing: read-only, no menus
3. "Ausstehende Einladungen" section (if any pending):
   - User avatar or link icon, invited role badge, "Eingeladen am {date}"
   - "Widerrufen" button with ConfirmationDrawer
4. "Organisation verlassen" button at bottom (not shown for sole owner)

### 4.3 `components/InviteDrawer.tsx`

Uses existing `BottomDrawer`. Two tabs: "In der App" | "Per Link".

**Tab "In der App":**
- Search input (debounced 300ms)
- User results list (excludes existing members)
- Role picker: "Admin" / "Mitglied"
- "Einladung senden" primary button

**Tab "Per Link":**
- Role picker
- Expiry picker: "24 Stunden" / "7 Tage" (default) / "30 Tage"
- "Link erstellen" → shows URL with "Link kopieren" + "Teilen" (Share.share())
- Note: "Link kann nur einmal verwendet werden"

### 4.4 Notification Inbox Enhancement (`app/notifications/index.tsx`)

Merge new `notifications` table entries into existing inbox (chronological).

**Invite notification card (`InviteNotificationCard.tsx`):**
- Org avatar, "Einladung von {org_name}", "Du wurdest als {role} eingeladen", timestamp
- Unread indicator (blue dot)
- Two buttons:
  - **"Annehmen"** — PRIMARY color (`#194383` light / `#8AB4F8` dark), NOT green
  - **"Ablehnen"** — secondary/outline style
- After action: buttons replaced with status text ("Angenommen" / "Abgelehnt"), dimmed

### 4.5 `app/invite/[token].tsx` — Link Invite Landing Page

- Org avatar (80x80), name, sub_type, verification badge
- "Eingeladen als: {role}" with OrgRoleBadge
- "Eingeladen von: {inviter_name}"
- "Gültig bis: {date}"
- "Annehmen" (primary) / "Ablehnen" (outline) buttons
- Error states: expired, already used, invalid token, not logged in (→ LoginDrawer)

### 4.6 Bell Icon with Badge

Add notification bell to profile page header. Badge count = unread user notifications. Uses existing `assets/icons/notification-01.svg`.

---

## 5. Navigation

### New Routes

| Route | File | Description |
|-------|------|-------------|
| `/org/manage` | `app/org/manage.tsx` | Member management |
| `/invite/[token]` | `app/invite/[token].tsx` | Link invite landing |

### Deep Link Registration

Add to `app.config.ts` intentFilters:
```
{ scheme: 'https', host: 'roebel.app', pathPrefix: '/invite' }
{ scheme: 'https', host: 'www.roebel.app', pathPrefix: '/invite' }
```

Add to `app/+native-intent.tsx` route mappings for `/invite/`.

### Key Flows

1. **Owner invites in-app:** Profile → Verwalten → + Einladen → search → role → send → Snackbar
2. **Owner creates link:** Profile → Verwalten → + Einladen → Per Link → role + expiry → share
3. **Recipient accepts via inbox:** Bell → /notifications → Annehmen → Snackbar + org in ownedAccounts
4. **Recipient accepts via link:** roebel.app/invite/TOKEN → /invite/[token] → Annehmen
5. **Member leaves:** Profile → Verwalten → "Organisation verlassen" → ConfirmationDrawer → confirm

---

## 6. Notification System

### Two Parallel Systems

1. **Existing device-based push** (`notification_log`, `push_tokens`): broadcast events/news
2. **New user-to-user** (`notifications` table): interactive, wallet-scoped, requires auth

Both feed into the same `/notifications` screen, merged chronologically.

### Realtime Subscription

Subscribe to `notifications` table filtered by `recipient_wallet` (same pattern as `MessagingContext.tsx`). New notifications appear instantly + badge increments.

### Optional: Push Notification Trigger

When in-app invite is created, optionally also send a push notification to recipient's device via Expo Push API. Nice-to-have; Realtime is primary.

---

## 7. Permissions Matrix

| Action | Owner | Admin | Member |
|--------|-------|-------|--------|
| View member list | ✅ | ✅ | ✅ |
| Invite new member | ✅ | ❌ | ❌ |
| Remove a member | ✅ | ❌ | ❌ |
| Change member role | ✅ | ❌ | ❌ |
| Revoke pending invite | ✅ | ❌ | ❌ |
| View pending invites | ✅ | ✅ (read-only) | ❌ |
| Leave organization | ✅ (if not sole) | ✅ | ✅ |

---

## 8. Hooks

### `useOrgMembers(accountId)`
Returns: members, pendingInvites, currentUserRole, isLoading, refresh, removeMember, changeMemberRole, revokeInvite, leaveOrg

### `useUserNotifications(walletAddress)`
Returns: notifications, unreadCount, isLoading, refresh, loadMore, hasMore, markAsRead, acceptInvite, declineInvite
Subscribes to Supabase Realtime on mount.

### `useInviteToken(token)`
Returns: invite (with account + inviter data), isLoading, isExpired, isAlreadyMember, accept, decline, isAccepting, isDeclining, error

---

## 9. Context Updates

### `NotificationsContext.tsx`
Add `userUnreadCount` and `totalUnreadCount` (push + user notifications combined for badge).

### `AccountContext.tsx`
Add `roleInActiveAccount`. Call `refreshAccounts()` after invite acceptance.

---

## 10. Files Summary

### New Files (12)
1. `supabase/migrations/011_member_management.sql`
2. `apps/expo/lib/supabase-invites.ts`
3. `apps/expo/lib/supabase-member-notifications.ts`
4. `apps/expo/lib/supabase-member-management.ts`
5. `apps/expo/hooks/useOrgMembers.ts`
6. `apps/expo/hooks/useUserNotifications.ts`
7. `apps/expo/hooks/useInviteToken.ts`
8. `apps/expo/components/OrgRoleBadge.tsx`
9. `apps/expo/components/InviteDrawer.tsx`
10. `apps/expo/components/InviteNotificationCard.tsx`
11. `apps/expo/app/org/manage.tsx`
12. `apps/expo/app/invite/[token].tsx`

### Modified Files (8)
1. `apps/expo/lib/types.ts` — new types
2. `apps/expo/lib/supabase-account-roles.ts` — add canLeaveOrg()
3. `apps/expo/app/profile.tsx` — add "Verwalten" menu item
4. `apps/expo/context/NotificationsContext.tsx` — add user notification count
5. `apps/expo/context/AccountContext.tsx` — add roleInActiveAccount
6. `apps/expo/app/notifications/index.tsx` — merge user notifications
7. `apps/expo/app.config.ts` — add /invite deep link
8. `apps/expo/app/+native-intent.tsx` — add invite route mapping

---

## 11. Implementation Order

**Phase 1: Database + Types**
1. Migration 011
2. Types in lib/types.ts
3. supabase-invites.ts, supabase-member-notifications.ts, supabase-member-management.ts
4. canLeaveOrg() in supabase-account-roles.ts

**Phase 2: Core UI Components**
5. OrgRoleBadge.tsx
6. InviteNotificationCard.tsx

**Phase 3: Manage Page**
7. useOrgMembers hook
8. app/org/manage.tsx
9. "Verwalten" in profile.tsx

**Phase 4: Invite Drawer**
10. InviteDrawer.tsx wired to manage page

**Phase 5: Notification System**
11. useUserNotifications hook
12. NotificationsContext update
13. notifications/index.tsx update

**Phase 6: Deep Link Invite**
14. useInviteToken hook
15. app/invite/[token].tsx
16. app.config.ts + native-intent.tsx updates
17. AccountContext update

---

## 12. Verification Plan

- [ ] Migration runs cleanly, tables + indexes + RLS created
- [ ] Realtime enabled on notifications table
- [ ] In-app invite: search → select → role → send → notification appears in recipient inbox
- [ ] Link invite: generate → share → open link → deep links into app → accept
- [ ] Accept: account_owners row created, org appears in ownedAccounts
- [ ] Decline: status updated, notification shows "Abgelehnt"
- [ ] Revoke: status='revoked', notification deleted
- [ ] Expired invite shows "Diese Einladung ist abgelaufen"
- [ ] Member list shows all members with correct role badges and colors
- [ ] Owner sees management controls, admin/member see read-only
- [ ] Member can leave org voluntarily (unless sole owner)
- [ ] Bell icon badge shows correct unread count
- [ ] All UI text in German, dark mode correct
- [ ] Role badge colors: Owner=primary bg + white, Admin=light blue bg + primary, Member=grey
- [ ] "Annehmen" button uses primary color, not green
