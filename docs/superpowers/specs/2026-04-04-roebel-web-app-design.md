# Röbel Web App — Full Architecture & Vision Spec

## Context

The Röbel Web App (`apps/web`) is the Next.js 15 companion to the Expo mobile app. It serves three distinct audiences through a layered routing architecture:

1. **Public visitors** — SEO-friendly landing pages, event listings, news, and legal pages (no wallet required)
2. **Authenticated users** — Full social platform with feed, messaging, marketplace, governance, and profile (wallet required, behind `/app/*`)
3. **Administrators** — Content moderation, event management, push notifications, and business approval (behind `/admin/*`)

**Current state:** ~130 route files, 176 components, 25 server actions, 30+ API endpoints. Feature-rich but no mode system (tourist/citizen/org), no Röbel Card integration, and no algorithmic feed — these are the mobile app's next evolution and need web equivalents.

**Goal:** Align with the mobile super app vision — implement the three-mode architecture, Röbel Card system, and Town Hall on web while leveraging Next.js strengths (SSR, server components, SEO).

---

## 1. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15.4.8 (App Router, React 19.1) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS 3.3 + CSS variables (dark mode via class strategy) |
| UI Library | shadcn/ui (Radix primitives) + custom components |
| Web3 | Thirdweb SDK v5, ethers.js, Base Mainnet (chain 8453) |
| Auth | Thirdweb in-app wallet (phone, email, Google, Apple, Facebook) |
| Database | Supabase (Postgres, Auth, Realtime, Edge Functions) |
| Storage | Irys (immutable content), Supabase Storage (media) |
| AI | Anthropic Claude API (Mecky news bot), OpenAI (event chat) |
| Maps | Mapbox GL + react-map-gl, Google Places Autocomplete |
| Payments | Stripe (event tickets) |
| Email | Resend (transactional) |
| Push | Firebase Cloud Messaging |
| Privacy | Semaphore Protocol (anonymous voting, SNARK proofs) |
| Rich Text | Tiptap editor |
| Graphs | ReactFlow (social/governance visualization) |
| Analytics | Vercel Analytics |
| Fonts | Geist Sans/Mono, Inter, "Perfectly Nineties" (headings) |
| Package Manager | pnpm (workspace) |

---

## 2. Routing Architecture

### 2.1 Three Route Layers

```
src/app/
├── layout.tsx                    # Root: ThemeProvider → ThirdwebProvider → GlobalWalletRedirect
├── page.tsx                      # Landing page (public)
├── globals.css                   # CSS variables, Tiptap prose styles
│
├── (public routes)/              # No auth required, SEO-indexed
│   ├── about/
│   ├── business/                 # Business landing page
│   ├── datenschutz/              # Data protection (GDPR)
│   ├── delete-account/
│   ├── design-system/            # Design system showcase
│   ├── events/[id]/              # Public event detail
│   ├── graph/                    # Social graph (public view)
│   ├── impressum/                # Legal info
│   ├── karte/                    # Public map
│   ├── landesmeisterschaft/      # Regional championship event
│   ├── login/                    # Auth entry point
│   ├── messages/                 # Public messaging (+ layout, [conversationId])
│   ├── mint/                     # NFT minting
│   ├── news/[slug]/              # News article detail
│   ├── notifications/            # Public notification view
│   ├── privacy/                  # Privacy policy
│   ├── profile/[wallet_address]/ # Public user profile
│   ├── proposals/                # Proposals list, [id] detail, create
│   ├── semaphore/                # Anonymous voting system
│   │   ├── identity/             # Identity management
│   │   ├── proposals/            # Anonymous proposals
│   │   ├── admin/citizens/       # Citizen group management
│   │   └── status/               # Protocol status
│   ├── submit/                   # Manual event submission
│   ├── submit-ai/                # AI-powered event submission
│   ├── support/
│   ├── ticket/[code]/            # Ticket verification
│   └── verifizierung/            # Identity verification hub
│       ├── antraege/             # Verification requests
│       ├── bescheiniger-beantragen/  # Request attester role
│       ├── buerger-beantragen/   # Request citizen status
│       └── nachweis/[id]/        # Evidence detail
│
├── app/                          # Authenticated routes (AuthGuard + AppShell)
│   ├── layout.tsx                # AuthGuard → MessagingProvider → AppShell
│   ├── page.tsx                  # Main feed / dashboard
│   ├── angebote/                 # Deals & offers
│   │   └── [id]/
│   ├── einstellungen/            # Settings (theme, profile)
│   ├── events/                   # My events
│   │   └── [id]/
│   ├── gewerbe/                  # Business management
│   │   ├── [slug]/               # Business detail
│   │   ├── erstellen/            # Create business
│   │   ├── bearbeiten/           # Edit business
│   │   └── angebote/             # Business deals
│   │       └── [id]/
│   ├── graph/                    # Social graph (authenticated)
│   ├── karte/                    # Interactive map
│   ├── marktplatz/               # Marketplace
│   │   ├── [id]/                 # Listing detail
│   │   │   └── bearbeiten/       # Edit listing
│   │   ├── erstellen/            # Create listing
│   │   └── meine/                # My listings
│   ├── messages/                 # Messaging (authenticated)
│   │   └── [conversationId]/
│   ├── news/                     # News feed
│   │   └── [slug]/
│   ├── notifications/            # Notifications
│   ├── posts/[id]/               # Community post detail
│   ├── profile/                  # My profile
│   │   └── [wallet_address]/     # Other user profile
│   ├── proposals/                # DAO proposals (voting)
│   │   ├── [id]/
│   │   └── create/
│   ├── submit/                   # Content submission
│   ├── submit-ai/                # AI-powered submission
│   ├── support/
│   └── verifizierung/            # Verification (authenticated)
│       ├── antraege/
│       ├── bescheiniger-beantragen/
│       ├── buerger-beantragen/
│       └── nachweis/[id]/
│
└── admin/                        # Admin dashboard
    ├── login/
    └── dashboard/
        ├── layout.tsx            # Admin shell
        ├── page.tsx              # Dashboard overview
        ├── alerts/               # CRUD: service alerts
        ├── announcements/        # CRUD: community announcements
        ├── events/               # Event moderation
        ├── feedback/             # User feedback review
        ├── flagged-posts/        # Content moderation
        ├── gewerbe/              # Business approval
        ├── mecky/                # AI news bot config
        ├── movies/               # Cinema listings CRUD
        ├── news/                 # News article CRUD
        ├── notifications/        # Push notification management
        │   ├── send/
        │   ├── history/
        │   └── devices/
        └── speisekarten/         # Restaurant menu CRUD
```

### 2.2 Layout Hierarchy

```
RootLayout (layout.tsx)
├── ThemeProvider (dark/light via next-themes)
│   └── ThirdwebProvider
│       ├── GlobalWalletRedirect (wallet state handler)
│       ├── ConditionalFooter (hides on /app/* routes)
│       ├── Toaster + Sonner (notifications)
│       └── Vercel Analytics
│
├── Public pages → rendered directly in RootLayout
│
├── /app/* → AppLayout
│   ├── AuthGuard (redirects to /login if no wallet)
│   │   └── MessagingProvider (Supabase Realtime context)
│   │       └── AppShell
│   │           ├── AppHeader (top nav, wallet, search, notifications)
│   │           ├── AppSidebar (left nav menu)
│   │           ├── Main content area
│   │           └── AppRightPanel (trending, notifications, ads)
│
└── /admin/* → AdminLayout
    └── Dashboard layout with admin nav
```

---

## 3. API Routes

### 3.1 Authentication
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/link-wallet` | Link wallet address to user account |
| POST | `/api/auth/verify-phone/send` | Send phone verification SMS |
| POST | `/api/auth/verify-phone/verify` | Verify phone number code |

### 3.2 AI & Chat
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/chat/event-submission` | AI-powered event form (OpenAI) |
| GET | `/api/cron/mecky` | Scheduled news generation (Claude API) |

### 3.3 Evidence & Verification
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/evidence/[id]` | Retrieve encrypted evidence |
| GET | `/api/evidence/list` | List evidence by user |
| POST | `/api/evidence/store` | Store encrypted evidence (EIP-712) |

### 3.4 Content & Media
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/irys/upload` | Upload to Irys (immutable storage) |
| POST | `/api/upload-image` | Upload image to Supabase Storage |
| POST | `/api/upload-media` | Upload video/media |
| GET | `/api/og-metadata` | Open Graph metadata for link previews |

### 3.5 Proposals & Voting
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/proposals/store` | Store proposal in Supabase (after on-chain) |
| POST | `/api/votes/record` | Record a vote |
| GET | `/api/votes/stats` | Vote statistics |
| GET | `/api/votes/leaderboard` | Voting leaderboard |

### 3.6 Users
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/api/users/profile` | Get/create user profile |
| GET | `/api/users/profile/[wallet_address]` | Get specific user |
| DELETE | `/api/users/delete` | Account deletion |
| GET | `/api/users/nft-status` | Check NFT ownership |

### 3.7 Tickets & Payments
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/tickets/create-checkout` | Stripe checkout session |
| POST | `/api/tickets/redeem` | Mark ticket as used |
| POST | `/api/tickets/verify` | Verify ticket code |
| POST | `/api/tickets/webhook` | Stripe webhook handler |

### 3.8 Maps
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/geocode` | Google Maps address geocoding |

---

## 4. Server Actions

Grouped by domain, all in `src/app/actions/`:

### Content & Social
| File | Operations |
|------|-----------|
| `posts.ts` | Create, read, like, comment on social posts |
| `news.ts` | News article CRUD |
| `announcements.ts` | Community announcements |
| `alerts.ts` | Service alerts |
| `feedback.ts` | Feedback submissions |
| `movies.ts` | Cinema listings |
| `mecky.ts` | AI news bot management |

### Business & Commerce
| File | Operations |
|------|-----------|
| `businesses.ts` | Business CRUD |
| `business-stats.ts` | Business analytics |
| `submit-business.ts` | Business submission flow |
| `restaurants.ts` | Restaurant/menu management |
| `local-ads.ts` | Local advertisements |
| `marketplace.ts` | Marketplace listing CRUD |

### Events
| File | Operations |
|------|-----------|
| `manage-events.ts` | Event CRUD |
| `submit-event.ts` | Event submission flow |

### Notifications & Search
| File | Operations |
|------|-----------|
| `app-notifications.ts` | In-app notifications |
| `push-notifications.ts` | Push notifications (Firebase) |
| `notification-counts.ts` | Badge counts |
| `global-search.ts` | Full-text search across all content |

### Admin
| File | Operations |
|------|-----------|
| `admin-login.ts` | Admin authentication |
| `admin-logout.ts` | Admin logout |
| `admin-posts.ts` | Content moderation |
| `admin-businesses.ts` | Business approval |
| `dashboard-auth.ts` | Dashboard access control |

---

## 5. Component Library

### 5.1 App Shell (`components/app/`)
| Component | Purpose |
|-----------|---------|
| `AppShell.tsx` | Main layout wrapper (header + sidebar + right panel + content) |
| `AppHeader.tsx` | Top bar: wallet connection, global search, notifications |
| `AppSidebar.tsx` | Left navigation menu |
| `AppMobileNav.tsx` | Mobile bottom/hamburger navigation |
| `AppRightPanel.tsx` | Right sidebar: trending topics, notifications, local ads |
| `AuthGuard.tsx` | Route protection — redirects to /login if no wallet |
| `GlobalWalletRedirect.tsx` | Handles wallet connection state transitions |
| `HomeRedirect.tsx` | Navigation logic for landing → app routing |

### 5.2 Feed & Social (`components/app/`)
| Component | Purpose |
|-----------|---------|
| `FeedCard.tsx` | Generic feed item (events, news, ads) |
| `FeedFilters.tsx` | Content type filtering |
| `PostCard.tsx` | Community post display |
| `PostComposer.tsx` | Create new post (text, images, polls) |
| `PostMediaGrid.tsx` | Media gallery in posts |
| `MediaLightbox.tsx` | Full-screen media viewer |
| `PollDisplay.tsx` / `PollCreator.tsx` | Polling system |
| `CommentSection.tsx` | Comments thread |
| `LikeButton.tsx` / `ReportButton.tsx` | Engagement actions |
| `LinkPreview.tsx` | Rich link previews |
| `CategoryBadge.tsx` / `CategorySelector.tsx` | Post categorization |
| `AlertCard.tsx` | Service alert display |
| `CommunityGuidelines.tsx` | Community rules |

### 5.3 Events (`components/events/`)
| Component | Purpose |
|-----------|---------|
| `events-page.tsx` | Main events page layout |
| `events-hero.tsx` | Hero section with featured events |
| `events-grid.tsx` | Event card grid |
| `events-header.tsx` | Page header with filters |
| `events-filters.tsx` | Date, category, location filters |
| `event-submission-form.tsx` | Manual event creation form |
| `ai-event-submission-chat.tsx` | AI-assisted event creation |
| `event-management.tsx` | Admin event controls |
| `AppEventCard.tsx` | Event card in authenticated feed |
| `EventInterestButton.tsx` | RSVP / interest button |

### 5.4 Proposals & Governance (`components/proposals/`)
| Component | Purpose |
|-----------|---------|
| `ProposalCard.tsx` | Proposal in list view |
| `ProposalHero.tsx` | Proposal detail header |
| `ProposalContent.tsx` | Full proposal content |
| `ProposalMetadata.tsx` | Dates, stats, info |
| `ProposalEditor.tsx` | Rich text proposal editor (Tiptap) |
| `VotingPanel.tsx` | Vote interaction (For/Against/Abstain) |
| `VoteResults.tsx` | Vote outcome display |
| `ProposalTimeline.tsx` | State timeline visualization |
| `ProposalCountdown.tsx` | Deadline timer |
| `MarkdownRenderer.tsx` | Proposal body rendering |

### 5.5 Messaging (`components/messages/`)
| Component | Purpose |
|-----------|---------|
| `MessagingProvider.tsx` | Supabase Realtime context |
| `MessagesLayout.tsx` | Split-pane message layout |
| `ConversationList.tsx` | Conversation list |
| `ContactList.tsx` / `ContactCard.tsx` | Contact management |
| `ChatView.tsx` / `ChatBubble.tsx` | Chat interface |
| `MessageInput.tsx` | Message composer |
| `EmojiPicker.tsx` | Emoji selection |
| `ProductContextBanner.tsx` | Product context in marketplace chats |
| `MessageNotificationListener.tsx` | Real-time notification handler |

### 5.6 Business & Marketplace
| Component | Purpose |
|-----------|---------|
| `BusinessCard.tsx` | Business directory card |
| `ListingCard.tsx` | Marketplace item card |
| `ListingForm.tsx` | Create/edit marketplace listing |

### 5.7 Verification (`components/verification/`)
| Component | Purpose |
|-----------|---------|
| `StatusBadge.tsx` | Verification status indicator |
| `RequestCard.tsx` | Verification request card |
| `SignatureProgress.tsx` | Multi-signature progress |
| `PrivacyNotice.tsx` | Privacy disclosure |

### 5.8 UI Foundation (`components/ui/`)
shadcn/ui components (Radix-based):
- `button`, `input`, `textarea`, `select`, `checkbox`, `switch` — Form controls
- `card`, `badge`, `avatar` — Display elements
- `dialog`, `alert-dialog`, `sheet`, `drawer` — Modals & drawers
- `dropdown-menu`, `collapsible` — Navigation/disclosure
- `multi-date-picker`, `image-upload-dropzone` — Specialized inputs
- `spinner`, `skeleton`, `notification-dot` — Loading & status
- `toaster`, `toast` — Toast notifications (Sonner)
- `label`, `typography`, `info-box` — Text & layout

### 5.9 Other Components
| Component | Purpose |
|-----------|---------|
| `ThemeProvider.tsx` | Dark/light mode (next-themes) |
| `MapView.tsx` | Mapbox GL map |
| `GooglePlacesAutocomplete.tsx` | Location search |
| `RichTextEditor.tsx` + `EditorMenuBar.tsx` | Tiptap editor |
| `ConditionalFooter.tsx` | Footer (hidden on /app/* routes) |
| `news-carousel.tsx` | News carousel on landing page |
| `feedback-form.tsx` | Feedback widget |
| Social graph components | ReactFlow network visualization |

---

## 6. Data Layer

### 6.1 Hooks (`src/hooks/`)

| Hook | Purpose |
|------|---------|
| `useUserProfile` | Logged-in user profile from Supabase |
| `usePublicProfile` | Any user's public profile |
| `useVerificationStatus` | NFT ownership & verification state |
| `useConversations` | User's conversation list |
| `useMessages` | Messages in a conversation |
| `useContacts` | Contact list |
| `useUnreadMessages` | Unread message count |
| `useUnreadNotifications` | Unread notification count |
| `useNotificationCounts` | Badge counts |
| `useSocialGraph` | Network/follower graph |
| `useRequests` | Pending requests (friend, verification) |
| `use-toast` | Sonner toast notifications |

### 6.2 Types (`src/types/`)

| File | Defines |
|------|---------|
| `post.ts` | Posts, comments, polls, engagement |
| `business.ts` | Business profiles, deals |
| `event-dates.ts` | Event scheduling |
| `marketplace.ts` | Marketplace listings |
| `verification.ts` | NFT, identity, encrypted evidence |
| `restaurant.ts` | Restaurant/menu data |
| `google-places.ts` | Maps/geocoding data |
| `search.ts` | Search results |
| `ticket-types.ts` | Event tickets |
| `push-notifications.ts` | Push notification payload |
| `feedback.ts` | Feedback structure |
| `mecky.ts` | News bot data |
| `app-notifications.ts` | In-app notification structure |

### 6.3 Library (`src/lib/`)

**Database:**
- `supabase.ts` — Main client + proposal operations
- `supabase/server.ts` — Server-side client (with auth token)
- `supabase/client.ts` — Browser client
- `supabase/admin.ts` — Service role operations
- `supabase-users.ts` — User profile CRUD
- `supabase-tickets.ts` — Ticket operations

**Blockchain:**
- `chains.ts` — Base Mainnet config (chainId 8453)
- `wallet-config.ts` — Thirdweb in-app wallet setup
- `contracts/contracts.ts` — Contract instances & addresses
- `contracts/citizenNFT.ts` — NFT ABI & methods
- `contracts/citizenRegistry.ts` — Citizen registry
- `contracts/anonymousGovernor.ts` — Voting contracts
- `contracts/verification-contracts.ts` — Verification system

**Privacy:**
- `semaphore-config.ts` — Protocol config (group 7, 7-day voting, 10% quorum, 51% support)
- `semaphore.ts` — Identity & proof generation
- `crypto/encryption.ts` — EIP-712 data encryption

**Integrations:**
- `irys.ts` — Immutable storage
- `stripe.ts` — Payment processing
- `resend.ts` — Email service
- `firebase-admin.ts` — Push notifications
- `blockscout.ts` — Block explorer
- `maps/mapbox.ts` — Map configuration

---

## 7. Web3 Integration

### 7.1 Smart Contracts (Base Mainnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| CitizenNFT (v3) | `0x78C88B01664Df4AA2F026DA68e834B4f33a3d751` | Soulbound citizenship NFT (1 NFT = 1 vote) |
| Attester Governor | `0x572c97329ACaCBeBA74e28E3998674E9058A095a` | DAO governance |
| AttesterNFT | `0x9b6cc0f9BC74E0a64f662028C4CF52e00bD35D4f` | Attester role NFT |

### 7.2 Wallet Authentication
- Thirdweb `inAppWallet` with `smartAccount` (gasless ERC-4337)
- Auth methods: phone, email, Google, Apple, Facebook
- Wallet connection displayed in `AppHeader`
- `AuthGuard` component protects `/app/*` routes

### 7.3 Semaphore Anonymous Voting
- Privacy-preserving voting via zk-SNARKs
- Citizen group ID: 7
- Voting delay: 1 day, voting period: 7 days
- Quorum: 10%, support threshold: 51%
- Full UI: identity management, anonymous proposal creation, vote casting

---

## 8. Design System

### 8.1 Theme Implementation

CSS variables in `globals.css`, toggled via `ThemeProvider` (next-themes, class strategy).

**Light Mode:**
| Token | Value | Usage |
|-------|-------|-------|
| Background | `#ffffff` | Page background |
| Primary | `#194383` (HSL 217 68% 31%) | Brand color, links, CTAs |
| Text | `#0a0a0a` | Primary text |
| Muted | `#737373` | Secondary text |
| Border | `#e5e5e5` | Borders |
| Radius | `10px` | Border radius |

**Dark Mode:**
| Token | Value | Usage |
|-------|-------|-------|
| Background | `#202124` | Page background |
| Primary | `#8AB4F8` (HSL 217 91% 76%) | Brand color, links |
| Text | `#e8eaed` | Primary text |
| Muted | `#9aa0a6` | Secondary text |
| Border | `#3c4043` | Borders |

### 8.2 Typography
| Element | Font | Style |
|---------|------|-------|
| h1, h2 | "Perfectly Nineties" | Display headings |
| h3-h6 | Geist Sans | `letter-spacing: -0.02em` |
| Body | Geist Sans | Regular weight |
| Code | Geist Mono | Monospace |
| Accent | Inter | Google font fallback |

### 8.3 Design Tokens (`lib/design-tokens.ts`)

Semantic Tailwind class mappings for:
- **Colors:** `text.*`, `background.*`, `border.*` — all reference CSS variables
- **Typography:** `h1`–`h4`, `body`, `bodyLarge`, `bodySmall`, `label`, `caption`, `mono`, `link`
- **Spacing:** `page.*`, `section.*`, `content.*`, `items.*`, `inline.*`, `card.*`, `form.*`
- **Components:** `card.*` (base/interactive/elevated), `button.*`, `input.*`, `link.*`
- **Status:** Generic (pending/success/error/warning/info) + proposal-specific states

### 8.4 UI Components
shadcn/ui (New York style) with Radix primitives. Config in `components.json`:
- Style: `new-york`
- Icons: `lucide`
- Path aliases: `@/components`, `@/lib`, `@/hooks`

---

## 9. Admin Dashboard

Full content management system at `/admin/dashboard/`:

| Section | Capabilities |
|---------|-------------|
| **Alerts** | Create/edit/delete service alerts (Baustelle, Sperrung, etc.) |
| **Announcements** | Community announcements CRUD |
| **Events** | Moderate submitted events, edit, approve/reject |
| **Feedback** | Review user feedback submissions |
| **Flagged Posts** | Content moderation for reported posts |
| **Gewerbe** | Business approval workflow |
| **Mecky** | Configure AI news bot (prompts, frequency, RSS sources) |
| **Movies** | Cinema program CRUD (Burgtheater Röbel) |
| **News** | News article CRUD with rich text editor |
| **Notifications** | Send push notifications, view history, manage devices |
| **Speisekarten** | Restaurant menu management |

---

## 10. Three-Mode Architecture — Web Adaptation

### 10.1 Mode System (aligned with mobile)

The web app currently has no mode system. To align with the mobile super app:

**Identity Layer** (`UserRole`): Derived from CitizenNFT ownership + business registration.
- `tourist` — No NFT, no business
- `resident` — Has CitizenNFT
- `business` — Has business registration
- `official` — Has attester role

**View Layer** (`AppMode`): Stored in localStorage (web equivalent of AsyncStorage).
- `tourist` — Default for unverified users
- `citizen` — Full civic features
- `org` — Business/organization management

### 10.2 Web-Specific Mode Implementation

Unlike mobile's 3-tab navigation, the web uses a sidebar + header layout. Mode switching affects:

1. **Sidebar navigation** — Show/hide menu items based on mode
   - Tourist: Feed, Events, Map, Businesses, News → no Governance, Marketplace (create), Messages
   - Citizen: Everything + Governance, Marketplace, Messages, Verification
   - Org: Everything + Business Dashboard, Deal Management, Analytics

2. **Feed content** — Same algorithmic ranking as mobile, but rendered in card grid or list
3. **Right panel** — Mode-aware widgets (tourist tips vs civic stats vs business metrics)
4. **Profile page** — Mode-specific sections (mirrors mobile's flippable card concept as a card with tabs)

### 10.3 New Context: `AppModeContext` (Web)

```
src/lib/context/AppModeContext.tsx
- Reads NFT status from useVerificationStatus hook
- Reads business ownership from user profile
- Computes availableModes, defaultMode
- Persists activeMode to localStorage
- Exposes: { activeMode, availableModes, setMode, canSwitchModes }
```

### 10.4 Mode Switcher Location

Desktop: Profile dropdown in `AppHeader` (top-right, next to wallet)
Mobile web: Settings page (`/app/einstellungen`)

---

## 11. Röbel Card on Web

### 11.1 Points Display
- **Profile page:** Points balance card (prominent, above-the-fold)
- **Sidebar widget:** Compact points display with "Earn more" CTA
- **Right panel:** Recent points activity

### 11.2 Partner Dashboard (`/app/gewerbe/roebel-card`)
For business owners in org mode:
- Stamp card configuration
- Redemption statistics
- Offer management (points multipliers, exclusive access)
- QR code generation for in-store scanning

### 11.3 Points History (`/app/wallet` or `/app/roebel-card`)
- Transaction log (earned/spent)
- Tier progress visualization
- Active stamp cards
- Achievement badges

### 11.4 Admin: Röbel Card Management
New admin section:
- Partner enrollment approval
- Points economy dashboard (total issued, redeemed, burn rate)
- Checkpoint management (Explorer QR codes)

---

## 12. Feed & Town Hall — Web

### 12.1 Current Feed (`/app/page.tsx`)
Currently a social feed with `PostComposer` + `PostCard` list + `FeedFilters`. No algorithmic ranking, no content interleaving.

### 12.2 Redesigned Feed (aligned with mobile)

**Two-tab layout** at top of feed:

**"Für Dich" tab:**
- Algorithmic feed (same rule-based ranking as mobile)
- Content types: posts, events, deals, governance nudges, news, Mecky tips
- Server-side ranking via Supabase query + edge function
- Infinite scroll with cursor-based pagination

**"Rathaus" tab:**
- Town Hall — civic communication channel
- Only verified citizens + orgs can POST
- Everyone can READ
- Content: announcements, proposals, civic discussions, Verein news
- Tourist CTA: "Werde Bürger, um teilzunehmen"

### 12.3 Context Bar
Pinned at top of feed (both tabs):
- Weather + Müritz lake temperature
- Current date
- Active event count
- Quick links to trending content

### 12.4 Web-Specific Advantages
- **Server Components:** Pre-render feed on server for fast initial load
- **Streaming:** Use React Suspense + streaming for progressive feed loading
- **SEO:** Public feed items indexed (events, news, proposals)
- **Desktop layout:** Three-column: sidebar | feed | right panel (trending + ads)

---

## 13. Navigation & Layout Patterns

### 13.1 Desktop Layout (≥1024px)
```
┌──────────────────────────────────────────────────────────┐
│  AppHeader (logo, search, notifications, wallet, mode)   │
├────────┬──────────────────────────────┬──────────────────┤
│        │                              │                  │
│ Sidebar│     Main Content Area        │   Right Panel    │
│  240px │      flex-1                  │     320px        │
│        │                              │                  │
│ Feed   │  (page content)              │ Trending         │
│ Events │                              │ Notifications    │
│ Map    │                              │ Local Ads        │
│ Market │                              │ Röbel Card       │
│ Gov    │                              │ Weather Widget   │
│ Msgs   │                              │                  │
│ ...    │                              │                  │
│        │                              │                  │
├────────┴──────────────────────────────┴──────────────────┤
│  (no footer on /app/* routes)                            │
└──────────────────────────────────────────────────────────┘
```

### 13.2 Mobile Layout (<1024px)
- Header collapses to hamburger menu
- Sidebar becomes drawer/sheet
- Right panel hidden (content moves to feed or separate pages)
- `AppMobileNav` provides bottom navigation

### 13.3 Public Pages Layout
- Simple header with logo + login CTA
- Full-width content
- Footer with links (Impressum, Datenschutz, About)
- No sidebar, no right panel

---

## 14. Performance Strategy

### 14.1 Current Architecture Strengths
- Next.js 15 App Router with Server Components by default
- Server Actions for mutations (no API round-trips for form submissions)
- Supabase server-side client with auth token forwarding

### 14.2 Improvements Needed

1. **Feed virtualization:** Current feed renders all posts. Add windowed rendering for long feeds (e.g., `react-window` or `@tanstack/virtual`).

2. **Image optimization:** Use Next.js `<Image>` component consistently. Currently some components use raw `<img>` tags.

3. **Route-level code splitting:** Next.js handles this automatically, but heavy components (Mapbox, Tiptap editor, ReactFlow) should use `dynamic()` imports.

4. **Streaming & Suspense:** Add `loading.tsx` files for all major routes. Currently only `/app/` and `/admin/events/` have loading states.

5. **Caching strategy:**
   - Static: Landing page, legal pages, design system → ISR with long revalidation
   - Dynamic: Feed, proposals, messages → no cache, real-time
   - Hybrid: Events, news, businesses → ISR with short revalidation (60s)

6. **Bundle analysis:** Ensure tree-shaking of ethers.js, Semaphore WASM, and Mapbox GL (only loaded on routes that need them).

---

## 15. Feature Parity Matrix — Web vs Mobile

| Feature | Web (Current) | Mobile (Current) | Web (Target) |
|---------|:---:|:---:|:---:|
| Events (browse) | ✅ | ✅ | ✅ |
| Events (create) | ✅ (AI + manual) | ✅ | ✅ |
| News | ✅ | ✅ | ✅ |
| Movies/Kino | ✅ (admin) | ✅ | ✅ |
| Restaurants/Menus | ✅ (admin) | ✅ | ✅ |
| Map | ✅ (Mapbox) | ✅ (Mapbox) | ✅ |
| Marketplace | ✅ | ✅ | ✅ |
| Deals/Angebote | ✅ | ✅ | ✅ |
| Social Feed | ✅ | ✅ | ✅ + algorithm |
| Governance | ✅ (+ Semaphore) | ✅ | ✅ |
| Messaging | ✅ | ✅ | ✅ |
| Wallet | ❌ | ✅ | ✅ |
| Verification | ✅ | ✅ | ✅ |
| Admin Dashboard | ✅ | ❌ | ✅ |
| Ticket Sales | ✅ (Stripe) | ❌ | ✅ |
| Design System Page | ✅ | ✅ | ✅ |
| Mode System | ❌ | 🚧 | ✅ |
| Röbel Card | ❌ | 🚧 | ✅ |
| Town Hall (Rathaus) | ❌ | 🚧 | ✅ |
| Algorithmic Feed | ❌ | 🚧 | ✅ |
| Explorer/Checkpoints | ❌ | 🚧 | ❌ (mobile-only) |
| Mecky AI Chat | ❌ | ✅ | ✅ |
| Push Notifications | ✅ (admin send) | ✅ | ✅ |

---

## 16. Implementation Phases (aligned with mobile)

### Phase 0: Foundation (aligned with mobile Week 1-2)
- Create `AppModeContext` for web (localStorage persistence)
- Add `AppMode` types to web (shared with mobile via `packages/`)
- Mode derivation from NFT status + business ownership
- Add mode switcher to `AppHeader` dropdown
- Supabase migrations (shared with mobile — same database)

**Critical files:**
- New: `src/lib/context/AppModeContext.tsx`
- Modify: `src/components/app/AppHeader.tsx` (add mode switcher)
- Modify: `src/components/app/AppSidebar.tsx` (mode-aware nav items)
- Modify: `src/components/app/AppRightPanel.tsx` (mode-aware widgets)

### Phase 1: Navigation & Mode Awareness (Week 3-4)
- Make sidebar navigation mode-aware (show/hide items)
- Mode-aware right panel widgets
- Update `AuthGuard` to initialize mode from NFT status
- Tourist mode restrictions (read-only governance, no marketplace creation)

### Phase 2: Profile & Identity Card (Week 5-6)
- Redesign `/app/profile` with card-style identity display (web equivalent of flippable card)
- Mode-specific profile sections
- Points balance display
- Badge/stamp collection
- "Mach's in Röbel" section for citizens

### Phase 3: Feed Redesign (Week 7-8)
- Add "Für Dich" / "Rathaus" tabs to `/app/page.tsx`
- Implement rule-based feed algorithm (server action or edge function)
- Context bar (weather, lake, date)
- Content type interleaving (events, deals, governance nudges)
- Role-gated posting in Rathaus

### Phase 4: Röbel Card — Points (Week 9-10)
- Points display in profile + sidebar widget
- Points transaction history page
- Partner dashboard for businesses (org mode)
- Admin: points economy dashboard
- Stamp card management UI

### Phase 5: Explore & Map Enhancement (Week 11-12)
- Enhanced map with richer POI cards
- Category filtering overlay
- Live data integration (open/closed, events)
- Search across all content types

### Phase 6: Org Mode Features (Week 13-14)
- Business analytics dashboard
- Deal performance metrics
- Röbel Card partner stats
- Org management hub (Verein, Fraktion tools)

### Phase 7: Performance & Polish (Week 15-16)
- Feed virtualization
- Dynamic imports for heavy components
- Loading states for all routes
- Image optimization audit
- Bundle size optimization
- Accessibility audit (WCAG 2.1 AA)

### Phase 8: Mecky AI on Web (Week 17-18)
- Chat widget or dedicated `/app/mecky` page
- Mode-aware system prompts (same as mobile)
- Tool integration (event search, business recommendations)
- Streaming responses

---

## 17. Verification

### How to Test End-to-End

1. **Mode switching:** Log in with different wallet addresses (tourist, citizen, business owner). Verify sidebar nav items change. Verify tourist sees restricted views with CTAs.

2. **Feed algorithm:** Switch between tourist/citizen accounts → verify different content ranking in "Für Dich" tab. Verify Rathaus tab restricts posting to verified users.

3. **Röbel Points:** Perform earning actions (vote, attend event) → verify points credited in profile. Check partner dashboard for redemption tracking.

4. **Auth flow:** Disconnect wallet → verify redirect to login. Reconnect → verify return to previous page. Test all auth methods (phone, email, Google).

5. **Responsive layout:** Test at 1440px (full three-column), 1024px (collapsed right panel), 768px (mobile layout), 375px (small mobile).

6. **Admin dashboard:** Create/edit/delete for each content type. Send push notification. Moderate flagged content.

7. **Semaphore voting:** Generate identity, join group, cast anonymous vote, verify proof on-chain.

8. **Performance:** Lighthouse audit on landing page (target: 90+ performance). Profile feed page with React DevTools — verify no unnecessary re-renders.

9. **Dark mode:** Toggle theme in settings → verify all pages render correctly in both modes.

10. **Cross-platform parity:** Compare feed content between web and mobile for same user → verify consistent data.

---

## 18. Environment Variables

```bash
# Thirdweb (Blockchain)
NEXT_PUBLIC_TEMPLATE_CLIENT_ID=

# Supabase (Database)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Maps
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=

# AI
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Blockchain Storage
IRYS_UPLOAD_PRIVATE_KEY=

# Security
CRON_SECRET=

# Payments
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Email
RESEND_API_KEY=

# Push Notifications
FIREBASE_SERVICE_ACCOUNT_KEY=

# Mapbox
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=
```

---

## 19. Database Tables (shared with mobile — same Supabase instance)

### Existing Tables
| Table | Purpose |
|-------|---------|
| `users` | User profiles (wallet address, display name, bio, interests) |
| `posts` | Social feed posts |
| `post_comments` | Comment threads |
| `post_polls` | Poll data |
| `post_likes` | Engagement tracking |
| `events` | Event listings |
| `businesses` | Business directory |
| `business_deals` | Offers/promotions |
| `marketplace_listings` | Classified ads |
| `proposals` | DAO proposals |
| `votes` | Proposal votes |
| `messages` | Direct messages |
| `notifications` | In-app notifications |
| `news_articles` | News content |
| `verification_requests` | Identity verification |
| `tickets` | Event tickets |
| `admin_alerts` | Service alerts |
| `announcements` | Community announcements |

### New Tables (from mobile super app spec, shared)
| Table | Purpose |
|-------|---------|
| `roebel_points_ledger` | Immutable points transaction log |
| `roebel_card` | Materialized card status (balance, tier, streak) |
| `roebel_card_partners` | Business partner enrollment |
| `stamp_cards` | Digital stamp tracking |
| `explorer_checkpoints` | Gamified discovery POIs |
| `explorer_completions` | User checkpoint visits |
| `organizations` | Extended org types (Verein, Partei, Fraktion) |

---

## 20. Key Differences from Mobile Spec

| Aspect | Mobile (Expo) | Web (Next.js) |
|--------|--------------|---------------|
| Navigation | 3-tab bottom bar | Sidebar + header |
| Mode switching | Tab content adapts | Sidebar items + right panel adapt |
| Identity card | Flippable card animation | Tabbed card or expandable card |
| Feed | FlashList virtualization | react-window or @tanstack/virtual |
| Explorer/QR | Camera + GPS checkpoints | Not applicable (mobile-only feature) |
| Offline | AsyncStorage persistence | localStorage + service worker (future) |
| Admin | Not available | Full admin dashboard |
| Ticket sales | Not available | Stripe checkout integration |
| Semaphore voting | Not implemented | Full implementation |
| SEO | Not applicable | SSR + metadata for public pages |
| Rich text editor | Not available | Tiptap (proposals, news) |
