# Röbel Super App — Full Vision Design Spec

## Context

The Röbel App is a civic tech platform for Röbel/Müritz (~5,000 residents, ~50,000 summer tourists). Currently at ~100 users with 66+ screens covering events, governance, marketplace, messaging, and more. The app needs to evolve from a feature-rich prototype into a world-class civic super app that people **want** to use — not are forced to use.

**Problem:** The app has many features but no clear growth engine, laggy performance, and no differentiated experience for different user types (tourists vs citizens vs organizations).

**Goal:** Transform into a 3-mode super app with a Röbel Card system that drives adoption from 100 → 5,000 users, creates genuine economic value for all participants, and becomes Röbel's indispensable digital platform.

---

## 1. Three-Mode Architecture

### 1.1 Mode System

**Two distinct layers:**
- **Identity Layer** (`UserRole`): Stays in database. `tourist | resident | business | official`. Determined by CitizenNFT + business registration status. This is who you ARE.
- **View Layer** (`AppMode`): UI concept stored in AsyncStorage. `tourist | citizen | org`. This is what you SEE.

**Switching logic:**
| UserRole | Available Modes | Default Mode |
|----------|----------------|--------------|
| tourist | tourist only | tourist |
| resident | tourist + citizen | citizen |
| business | tourist + citizen + org | org |
| official | tourist + citizen + org | citizen |

- Unverified users are locked to tourist mode (tapping "Bürger" shows verification CTA)
- Multi-role users get a mode switcher
- Mode persists across sessions via AsyncStorage

**New `AppModeContext`** replaces existing `ExtendedModeContext`:
- Reads `hasCitizenNFT` from `VerificationContext`
- Reads `isBusinessOwner` from `UserContext`
- Computes `availableModes`, `defaultMode`
- Exposes: `{ activeMode, availableModes, setMode, canSwitchModes }`
- Backward compatibility: `isExtendedMode` maps to `activeMode !== 'tourist'`

**Critical file:** `apps/expo/context/ExtendedModeContext.tsx` → replaced by `AppModeContext.tsx`

### 1.2 Universal 3-Tab Navigation

**Same 3 tabs for ALL modes. Content adapts per mode.**

| Tab | Icon | Name | Purpose |
|-----|------|------|---------|
| 1 | 📰 | Feed | Algorithmic feed + Town Hall |
| 2 | 🧭 | Entdecken | Everything Röbel + Map toggle |
| 3 | 👤 | Mein Röbel | Identity card + mode-specific components |

This replaces the current `BottomNavigation.tsx` which manages 3-4 tabs with manual `router.push()`. The new system uses expo-router layout groups with a mode-aware tab navigator.

**Directory restructure:**
```
app/
  _layout.tsx              (root: providers, Stack navigator)
  (tabs)/
    _layout.tsx            (mode-aware tab navigator — 3 tabs always)
    feed.tsx               (Feed tab)
    explore.tsx            (Entdecken tab)
    profile.tsx            (Mein Röbel tab)
  (screens)/               (pushed screens, shared across modes)
    event/[id].tsx
    proposal/[id].tsx
    business/...
    messages/...
    ...all detail screens
```

---

## 2. Tab 1: Feed — YouTube-Style Algorithm + Town Hall

### 2.1 Two Top Tabs

**"Für Dich" (algorithmic feed):**
- YouTube-style: shows the most relevant content for THIS specific user
- Algorithm factors: user interests, neighborhood, role, interaction history, time of day, season
- Content types mixed in feed: events, deals, news, marketplace items, community posts, weather/lake, governance votes
- Adapts by mode: tourists see more events/restaurants/attractions; citizens see more community + governance; orgs see market trends
- Uses existing `FeedHome.tsx` component as base, extended with algorithmic ranking

**"Rathaus" (Town Hall):**
- Internal civic communication channel
- Only verified citizens + orgs can POST; everyone can READ
- Content: official announcements, active proposals, civic discussions, Fraktion positions, participatory budgeting, neighborhood alerts, Verein announcements
- Tourists see content but with "Werde Bürger, um teilzunehmen" CTA — drives verification
- Uses existing governance + social feed infrastructure

### 2.2 Feed Content Types (mixed intelligently)

The feed interleaves user posts with contextual content. **ALL user posts are shown** (never hidden like Facebook). Contextual content is injected between posts:

| Content Type | Format | Placement |
|-------------|--------|-----------|
| **Context Bar** | Pinned: ☀️ 18°C · 🌊 Müritz 16°C · Di, 4. April | Always at top |
| **This Week's Events** | Horizontal scroll carousel with date chips | Pinned below context bar |
| **User Posts** | Standard post cards (text, images, comments) | Chronological, never hidden |
| **Deals & Offers** | Highlighted card with Röbel Points badge | Injected during business hours |
| **Governance Nudges** | Vote progress bar + "Jetzt abstimmen +50 Punkte" | Boosted if <3 days remaining |
| **Local News** | Compact card with thumbnail | Mixed at normal priority |
| **Smart Recommendations** | Context-aware: lunchtime→restaurant, rain→indoor, weekend→family | Every ~5 items |
| **Marketplace Highlights** | Item card with price + distance | Matching user interests |
| **Mecky Tips** | AI suggestion bubble with contextual advice | 1-2 per session, never repetitive |

### 2.3 Feed Algorithm (Phase 1 — Rule-Based)

Priority rules (not just weighted scores):

1. **Context bar** → Always pinned at top (weather, lake, date)
2. **This Week's Events** → Always pinned as horizontal carousel below context bar
3. **Active votes ending soon** → Boosted if < 3 days remaining (citizens only)
4. **Fresh user posts** → Chronological within last 24h, then decay
5. **Time-sensitive deals** → "Nur heute" deals boosted during business hours
6. **Smart recommendations** → Injected every ~5 items based on time of day, weather, season
7. **News** → Breaking news boosted, regular news mixed in at normal priority
8. **Marketplace** → Items matching user interests, nearby listings
9. **Mecky tips** → 1-2 per session, context-aware, never repetitive

**Key principle:** Show ALL posts — don't filter community content. Intelligently insert contextual content BETWEEN posts. Users never miss a neighbor's question, but also get relevant deals, events, and recommendations woven in naturally.

Evolve to ML-based ranking when user base grows beyond 1000.

---

## 3. Tab 2: Entdecken — Everything Röbel

### 3.1 List/Map Toggle

Top-right toggle switches between list view and full-screen map view.

**List View:** Category grid + scrollable content sections
- Events, Restaurants, Gewerbe, Deals, Marktplatz, News, Kino, Explorer
- Each category opens a dedicated list/filter screen
- Search bar at top with unified search across all categories

**Map View:** Full-screen Mapbox (like Google/Naver Maps)
- All POIs with category icons
- Rich info cards on tap (photo, name, hours, rating, distance)
- Live data: open/closed status, ongoing events, available tables
- Filter by category overlay
- "Near me" + search

Uses existing `MapboxMapView.tsx` and `explore.tsx`, enhanced with richer POI cards and live data.

---

## 4. Tab 3: Mein Röbel — Profile

### 4.1 Flippable Identity Card (top)

**Inspired by Swiss passport design + Airbnb profile card.**

**Front (tap to flip):**
- Profile photo + name + location
- Role badge (Tourist / Bürger / verified checkmark)
- Member since date + Röbel Points balance
- Gradient background (mode-colored: blue for citizen, neutral for tourist, dark for org)

**Back (tap to flip):**
- "Bürgerausweis" / "Tourist Card" / "Partner Card" heading
- Verification details: verified since, attested by N citizens
- Voting streak (citizens)
- Mini QR code (for stamp card scanning, verification)
- Badge collection row (earned badges/stamps)
- Swiss passport-inspired border/stamp aesthetic

**Implementation:** `react-native-card-flip` or custom `Animated.Value` rotation. The card is a component `FlippableIdentityCard.tsx` that takes `mode`, `user`, and `verificationData` props.

### 4.2 Mode-Specific Components (Airbnb-style illustrated cards)

**Rendered below the card, in a row or grid. Like Airbnb's "Past trips" / "Connections" cards.**

**Tourist Mode:**
| Component | Icon/Illustration | Subtitle | Opens |
|-----------|------------------|----------|-------|
| Röbel Card | 🎴 | "42 Punkte · 3 Stamps" | Points/badges/stamps page |
| Meine Entdeckungen | 🧭 | "5/12 Checkpoints besucht" | Explorer progress + map |
| Gespeichert | ⭐ | "Events, Restaurants, Orte" | Bookmarks |
| **CTA Banner** | 🏛️ | "Bürger werden" | Verification flow |

**Citizen Mode:**
| Component | Icon/Illustration | Subtitle | Opens |
|-----------|------------------|----------|-------|
| Röbel Card | 🎴 | "450 Punkte · 7 Badges" | Points/badges page |
| Rathaus | 🗳️ | "2 aktive Abstimmungen" | Governance page (proposals, voting, civic dashboard) |
| Mach's in Röbel | 🚀 | "Gewerbe, Verein, Partei..." | Start business/club/party/freelancer selection |

**Org Mode:**
| Component | Icon/Illustration | Subtitle | Opens |
|-----------|------------------|----------|-------|
| Dashboard | 📊 | "Views, Deals, Röbel Card" | Org analytics |
| Verwalten | ⚙️ | "Deals, Events, Mitglieder" | Org management hub |
| Röbel Card Partner | 🤝 | "Stempel, Angebote, Stats" | Partner dashboard |

### 4.3 Shared Menu Items (below components, all modes)

- ⚙️ Einstellungen
- 💬 Nachrichten (with unread badge)
- 🔔 Benachrichtigungen (with badge)
- 💰 Wallet
- ❓ Hilfe
- 💡 Feedback
- 🚪 Abmelden

### 4.4 "Mach's in Röbel" — Citizen Empowerment Page

When citizen taps this component, opens a selection screen:
- 🏪 Gewerbe gründen → Business registration flow
- 🤝 Verein gründen → Verein registration flow
- 🏛️ Partei / Fraktion beitreten → Political engagement
- 💼 Freelancer werden → Freelancer profile setup
- 🎨 Kreativ werden → Cultural projects / art

Tagline: "Werde, wer du sein willst. In Röbel."

---

## 5. Röbel Card System

### 5.1 Overview — Progressive Rollout

| Phase | Name | Mechanic | Timeline |
|-------|------|----------|----------|
| 1 | Röbel Points | Earn through civic actions, spend at local businesses | First |
| 2 | Tiered Pass | Tourist/Bürger/Supporter tiers with escalating perks | After 500+ users |
| 3 | Röbel Taler | Local digital currency on Base L2 | After 2000+ users |

### 5.2 Phase 1: Röbel Points

**Earning:**

| Action | Points | Cap |
|--------|--------|-----|
| Vote on proposal | 50 | Per proposal |
| Attend verified event | 30 | Per event |
| Post in Schwarzes Brett | 10 | 5/day |
| Complete Explorer checkpoint | 25 | Per checkpoint |
| Volunteer (attested) | 100 | Per event |
| Refer new citizen | 200 | Unlimited |
| Daily app open | 5 | 1/day |
| First purchase at partner business | 50 | Per partner |
| Verify another citizen | 75 | Per verification |
| Stamp at partner business | 10 | 1/business/day |

**Spending:**
- Redeem at partner businesses: business gets full payment from community fund
- Unlock premium features (priority event booking, exclusive access)
- Donate to community projects (voted on by citizens)

**Business economics:**
- Businesses do NOT give discounts — they accept Röbel Points as payment
- Community fund reimburses business at face value (or slightly less, ~10-15% processing)
- Community fund sources: tourism tax contribution, optional Supporter subscriptions (Phase 2), Röbel Taler fees (Phase 3), grants
- Business cost: ZERO. They get a paying customer.
- Business chooses what to offer: stamp cards, exclusive access, priority booking — no mandatory discounts

**Digital Stamp Cards:**
- Businesses can create stamp cards: "10th coffee free", "Visit 5 times, get dessert"
- QR code at register → customer scans → stamp collected in app
- Stamp completion awards bonus Röbel Points
- Business controls the reward and threshold

### 5.3 Phase 2: Tiered Pass

| Tier | Requirement | Perks |
|------|-------------|-------|
| Besucher (Tourist) | Download app | Map, events, basic deals, Mecky guide |
| Bürger (Citizen) | CitizenNFT + 100 points | Full marketplace, voting, all deals, messaging |
| Supporter | CitizenNFT + 1000 pts + 6mo activity OR €5-10/mo | Premium: priority booking, exclusive events, higher point multipliers |

### 5.4 Phase 3: Röbel Taler (Future)

Local digital currency on Base. Like Chiemgauer but on-chain.
- Buy: €1 = 1.10 Röbel Taler (10% bonus)
- Spend: At partner businesses
- Business cashout: 1 Taler = €0.95 (5% → community fund)
- Community fund: Finances public projects, voted on by citizens via governance
- New ERC-20 contract on Base

### 5.5 Wallet Integration

Existing `wallet.tsx` shows USDC, ETH, NFTs. Add:
- Röbel Points balance (top card, most prominent)
- Stamp card overview (active stamp cards)
- Röbel Taler balance (Phase 3)
- Transaction history (points earned/spent)

---

## 6. Growth Strategy: 100 → 5,000 Users

### 6.1 Phase A: Partner First (Now → 3 months)

1. Personally onboard 10 businesses (Bäckerei, Gasthaus, Eiscafé, Buchhandlung, etc.)
2. Each gets: free app listing + digital stamp card
3. Business puts QR code sticker at register: "Röbel Card — Stempel sammeln!"
4. Customer downloads app to collect stamps
5. Each business brings ~20-50 customers → **200-500 new users**

**Why businesses join:** Not for discounts — for audience access. The app is where Röbel's people are. Menu visible to all users, Mecky recommends them, push notifications to locals, analytics they can't get anywhere else. Like Google Maps — being listed is the value.

### 6.2 Phase B: Tourist Season Capture (Summer)

1. QR codes at Tourist Info, Hafen, parking lots, boat rental docks
2. "Scan for your FREE Röbel Tourist Card — Map, AI Guide, Deals"
3. Tourist downloads for immediate value: city map, Mecky AI tour guide, restaurant menus, event calendar
4. Partner with businesses for "Tourist Card exclusive" experiences
5. Even 2% conversion of summer visitors = **1,000 users**

### 6.3 Phase C: Critical Mass (End of Year)

With 2,000+ users → network effects kick in → organic growth via word of mouth → city partnership becomes viable → official endorsement → path to 5,000.

---

## 7. Feature Inventory by Mode

### 7.1 Existing Features — Mode Mapping

| Feature | Tourist | Citizen | Org |
|---------|---------|---------|-----|
| Events (browse) | ✅ | ✅ | ✅ |
| Events (create/manage) | ❌ | ✅ | ✅ |
| News | ✅ | ✅ | ✅ |
| Movies/Kino | ✅ | ✅ | ✅ |
| Restaurants/Menus | ✅ | ✅ | ✅ (own profile) |
| Map | ✅ | ✅ | ✅ |
| Marketplace (browse) | ✅ | ✅ | ✅ |
| Marketplace (create/sell) | ❌ | ✅ | ✅ |
| Deals (browse) | ✅ | ✅ | ✅ |
| Deals (create) | ❌ | ❌ | ✅ |
| Social Feed | Read only | Full | Post as org |
| Governance (browse) | ✅ | ✅ | ✅ |
| Governance (vote) | ❌ | ✅ | ✅ |
| Governance (propose) | ❌ | Attester only | Attester only |
| Messaging | ❌ | ✅ | ✅ |
| Mecky AI | Tour guide mode | Full assistant | Business advisor |
| Wallet | ❌ | ✅ | ✅ |
| Verification | Can request | Verified | Verified |
| Mini-games | ✅ | ✅ | ❌ |
| Business Directory | Browse | Browse | Own profile + analytics |
| Notifications | Basic | Full | Full + business alerts |
| Bookmarks | ✅ | ✅ | ✅ |
| Calendar | View | Full | Full + org events |

### 7.2 New Features

**Tourist Mode (new):**
- **Live Local Pulse**: Real-time widget — weather, lake temp, open restaurants, ongoing events
- **Röbel Explorer**: Gamified QR checkpoints at landmarks, badge collection, walking tours
- **AI City Guide**: Mecky persona as conversational tour guide (different system prompt)
- **Tourist Deals Section**: Curated tourist-relevant deals

**Citizen Mode (new):**
- **Civic Dashboard**: Voting stats, participatory budgeting display, community health metrics
- **Neighborhood Network**: Mutual aid by neighborhood (extension of marketplace)
- **Röbel Points Widget**: Balance, recent earning, spending opportunities
- **"Mach's in Röbel"**: Empowerment page — start business, club, party, freelancer

**Org Mode (new):**
- **Org Dashboard**: Extended analytics, Röbel Card partner stats, deal performance
- **Verein Management Hub**: Member directory, event management, dues tracking
- **Fraktion/Partei Tools**: Position papers, faction-linked proposals
- **Partner Dashboard**: Stamp card management, redemption stats, offer configuration

---

## 8. Data Model Changes

### 8.1 New Supabase Tables

**`roebel_points_ledger`** — immutable transaction log:
- `id` UUID PK
- `wallet_address` TEXT FK → users
- `amount` INTEGER (positive = earn, negative = spend)
- `action` TEXT ('vote', 'event_attend', 'post', 'redeem', 'stamp', etc.)
- `reference_type` TEXT ('proposal', 'event', 'post', 'business', etc.)
- `reference_id` TEXT
- `description` TEXT
- `created_at` TIMESTAMPTZ

**`roebel_card`** — materialized card status:
- `wallet_address` TEXT PK FK → users
- `points_balance` INTEGER DEFAULT 0
- `total_earned` INTEGER DEFAULT 0
- `total_spent` INTEGER DEFAULT 0
- `tier` TEXT DEFAULT 'besucher' CHECK ('besucher', 'burger', 'supporter')
- `taler_balance` NUMERIC(18,6) DEFAULT 0 (Phase 3)
- `streak_days` INTEGER DEFAULT 0
- `last_activity_at` TIMESTAMPTZ
- `created_at`, `updated_at` TIMESTAMPTZ

**`roebel_card_partners`** — business card enrollment:
- `id` UUID PK
- `business_id` UUID FK → businesses
- `is_active` BOOLEAN DEFAULT true
- `offer_type` TEXT CHECK ('stamp_card', 'points_multiplier', 'exclusive_access', 'priority_booking', 'custom')
- `offer_config` JSONB DEFAULT '{}'
- `total_redemptions` INTEGER DEFAULT 0
- `created_at`, `updated_at` TIMESTAMPTZ

**`stamp_cards`** — digital stamp tracking:
- `id` UUID PK
- `wallet_address` TEXT FK
- `partner_id` UUID FK → roebel_card_partners
- `stamps_collected` INTEGER DEFAULT 0
- `stamps_required` INTEGER
- `reward_description` TEXT
- `is_completed` BOOLEAN DEFAULT false
- `completed_at` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ

**`explorer_checkpoints`** — gamified discovery POIs:
- `id` UUID PK
- `name` TEXT
- `description` TEXT
- `latitude`, `longitude` NUMERIC
- `qr_code` TEXT UNIQUE
- `points_reward` INTEGER DEFAULT 25
- `badge_image_url` TEXT
- `category` TEXT
- `is_active` BOOLEAN DEFAULT true

**`explorer_completions`** — user checkpoint visits:
- `id` UUID PK
- `wallet_address` TEXT
- `checkpoint_id` UUID FK
- `completed_at` TIMESTAMPTZ
- UNIQUE(wallet_address, checkpoint_id)

**`organizations`** — extended org types:
- `id` UUID PK
- `business_id` UUID FK → businesses (nullable)
- `org_type` TEXT CHECK ('business', 'verein', 'partei', 'fraktion')
- `name`, `description`, `logo_url` TEXT
- `member_count` INTEGER DEFAULT 0
- `is_verified` BOOLEAN DEFAULT false
- `admin_wallet_addresses` TEXT[]

### 8.2 Modified Existing Tables

- `users`: add `app_mode` TEXT DEFAULT 'tourist', add `org_id` UUID FK → organizations
- `businesses`: add `is_roebel_partner` BOOLEAN DEFAULT false, add `partner_since` TIMESTAMPTZ

### 8.3 New Supabase Edge Functions

- `award-points`: Validate action, check frequency caps, insert ledger entry, update balance
- `redeem-points`: Validate balance, create negative entry, notify partner business
- `update-tier`: Cron job to recalculate tiers based on points + activity
- `verify-checkpoint`: Validate QR scan, award points, record completion

---

## 9. Performance Strategy

### 9.1 Root Causes

The current `app/index.tsx` uses `<ScrollView>` wrapping all content with `eventsToDisplay.map()` rendering all cards inline — no virtualization. Same pattern in `explore.tsx`. This causes laggy scrolling as the DOM grows.

### 9.2 Fixes

1. **Replace ScrollView with FlashList** (`@shopify/flash-list`): Virtualized list for home/explore screens. Use `ListHeaderComponent` for hero sections. Significantly faster than FlatList for heterogeneous content.

2. **Memoize card components**: Wrap `EventCard`, `NewsCard`, `MovieCard`, `RestaurantCard`, `FeedPostCard`, `DealCard` with `React.memo`. Extract `renderItem` into stable `useCallback` refs.

3. **Fix animation duration**: Current `animationDuration: 0` causes janky instant swaps. Change to `150ms` fade or `'none'` for tab switches.

4. **Mode-aware lazy loading**: Use `React.lazy()` + `Suspense` for mode-specific home screens. Don't pre-load Org Dashboard for tourists.

5. **Mode-aware data fetching**: Current home fetches 5 parallel queries on mount. Make this mode-aware — tourists don't need governance data, orgs don't need game data.

6. **Consistent expo-image usage**: Verify all card components use `Image` from `expo-image` (better caching, progressive loading) instead of React Native's `Image`.

7. **Context splitting**: Split `AppModeContext` into value context + dispatch context to prevent re-renders of read-only consumers.

---

## 10. Mecky AI — Mode-Aware Personas

Mecky already has 11 tools and streaming support. Enhance with mode-specific system prompts:

**Tourist Mode:** "Du bist Mecky, der freundliche Stadtführer von Röbel. Hilf Touristen, Röbel zu entdecken. Empfehle Restaurants, Events, Sehenswürdigkeiten. Erkläre die Geschichte der Stadt."

**Citizen Mode:** "Du bist Mecky, der Bürgerassistent von Röbel. Hilf Bürgern mit Governance, Marketplace, Community-Fragen. Erkläre Abstimmungen, hilf beim Erstellen von Beiträgen."

**Org Mode:** "Du bist Mecky, der Business-Berater von Röbel. Hilf Gewerben mit Deals, Analytics, Röbel Card Partner-Programm. Gib Marketing-Tipps für lokale Geschäfte."

Uses existing `lib/prompts/mecky-system-prompt.ts` — add mode parameter.

---

## 11. Implementation Phases

### Phase 0: Foundation (Week 1-2)
- Create `AppModeContext` replacing `ExtendedModeContext`
- Add `AppMode` types to `lib/types.ts`
- Mode derivation logic from verification + business ownership
- Backward compatibility: `isExtendedMode` → `activeMode !== 'tourist'`
- Supabase migrations for new tables

### Phase 1: Navigation Restructure (Week 3-4)
- Create `app/(tabs)/_layout.tsx` with 3-tab mode-aware navigator
- Move screens into `(tabs)/` and `(screens)/` groups
- Replace `BottomNavigation.tsx` with expo-router tab bar
- Build mode switcher (profile screen, not home header)

### Phase 2: Profile Redesign (Week 5-6)
- Build `FlippableIdentityCard` component
- Build mode-specific profile components (Airbnb-style cards)
- Build "Mach's in Röbel" page
- Implement shared menu items below

### Phase 3: Feed Redesign (Week 7-8)
- Build "Für Dich" algorithmic feed (weighted scoring)
- Build "Rathaus" Town Hall feed
- Top tab navigation between the two feeds
- Role-gated posting in Rathaus

### Phase 4: Röbel Card — Points System (Week 9-10)
- Points earning logic (Supabase Edge Functions)
- Points display in wallet + profile card
- Digital stamp card system
- Partner enrollment flow in org mode

### Phase 5: Explore + Map Enhancement (Week 11-12)
- List/Map toggle
- Rich POI cards with live data
- Explorer checkpoints + QR scanning + badges
- Category grid + search

### Phase 6: Org Mode Features (Week 13-14)
- Org Dashboard (extended analytics)
- Verein management hub
- Fraktion/Partei tools
- Röbel Card Partner dashboard

### Phase 7: Performance + Polish (Week 15-16)
- FlashList migration
- Component memoization
- Lazy loading per mode
- Animation tuning
- expo-image consistency

### Critical Files to Modify
- `apps/expo/context/ExtendedModeContext.tsx` → replaced by `AppModeContext.tsx`
- `apps/expo/app/_layout.tsx` → restructured for tab groups
- `apps/expo/app/index.tsx` → 3-way mode branching
- `apps/expo/components/BottomNavigation.tsx` → replaced by expo-router tabs
- `apps/expo/context/UserContext.tsx` → mode availability logic
- `apps/expo/app/profile.tsx` → complete redesign with flippable card
- `apps/expo/lib/prompts/mecky-system-prompt.ts` → mode-aware personas
- `apps/expo/app/wallet.tsx` → add Röbel Points section

---

## 12. Verification

### How to Test End-to-End

1. **Mode switching:** Create test accounts with different roles. Verify tourist sees 3 tabs with locked features, citizen sees full feed + governance, org sees dashboard.
2. **Röbel Points:** Vote on a proposal → verify points credited. Visit a checkpoint → verify badge awarded. Redeem at partner → verify balance decremented.
3. **Stamp cards:** Scan business QR → verify stamp added. Complete card → verify reward notification.
4. **Feed algorithm:** Switch between tourist/citizen accounts → verify different content ranking.
5. **Performance:** Profile home screen with React DevTools. Verify FlatList/FlashList virtualization. Measure FPS during scroll on physical device.
6. **Flippable card:** Tap card → verify smooth flip animation. Verify front/back content correct per mode.
7. **Growth flow:** New user downloads → tourist mode → explores → taps "Bürger werden" → verification flow → citizen mode unlocks → mode switcher appears.
