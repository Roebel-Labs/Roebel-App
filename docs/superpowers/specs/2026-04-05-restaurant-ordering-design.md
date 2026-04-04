# Restaurant Ordering System — Design Spec

## Context

Restaurant owners (citizens with Unternehmen accounts) need a digital ordering system. Visitors scan a QR code on their table, browse the menu, and submit orders from their phone. The kitchen sees incoming orders in real-time and moves them through states (New → In Progress → Done). Multiple guests at the same table share one session, and all orders merge into one view per table for the kitchen.

This spec covers the **core ordering loop**: table sessions, guest ordering, kitchen ticket management, and staff-side manual ordering. Deferred to future specs: AI menu generation (photo → menu items) and in-app payment.

---

## Design Decisions

| Decision | Choice |
|---|---|
| Scope | Sessions + ordering flow + kitchen tickets + staff ordering |
| Restaurant link | Add `account_id` FK to existing `restaurants` table |
| Auth for ordering | No login required (anonymous guest token) |
| Kitchen view | Mobile app only (Expo), shown when acting as restaurant account |
| Real-time updates | Supabase Realtime (postgres_changes) |
| Order states | New → In Progress → Done (3 states) |
| Payment | No in-app payment (pay at restaurant traditionally) |
| Order items storage | JSONB array on order row (not normalized) |

---

## 1. Data Model

### New Tables

#### `restaurant_tables`
Table configuration for QR code generation.

```sql
CREATE TABLE restaurant_tables (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_number   TEXT NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, table_number)
);

CREATE INDEX idx_restaurant_tables_restaurant ON restaurant_tables(restaurant_id);
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "restaurant_tables_select" ON restaurant_tables FOR SELECT USING (true);
CREATE POLICY "restaurant_tables_insert" ON restaurant_tables FOR INSERT WITH CHECK (true);
CREATE POLICY "restaurant_tables_update" ON restaurant_tables FOR UPDATE USING (true);
CREATE POLICY "restaurant_tables_delete" ON restaurant_tables FOR DELETE USING (true);
```

#### `table_sessions`
An active dining session at a table. Created when the first guest scans the QR.

```sql
CREATE TABLE table_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_number   TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at      TIMESTAMPTZ
);

CREATE INDEX idx_table_sessions_restaurant ON table_sessions(restaurant_id);
CREATE INDEX idx_table_sessions_status ON table_sessions(status);
ALTER TABLE table_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "table_sessions_select" ON table_sessions FOR SELECT USING (true);
CREATE POLICY "table_sessions_insert" ON table_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "table_sessions_update" ON table_sessions FOR UPDATE USING (true);
```

#### `orders`
One order = one person's submission at a table. Can be placed by the guest (via QR scan) or by restaurant staff (manual entry).

```sql
CREATE TABLE orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  guest_name    TEXT,
  guest_token   TEXT NOT NULL,
  placed_by     TEXT NOT NULL DEFAULT 'guest' CHECK (placed_by IN ('guest', 'staff')),
  items         JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'done')),
  total         NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_session ON orders(session_id);
CREATE INDEX idx_orders_status ON orders(status);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_select" ON orders FOR SELECT USING (true);
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_update" ON orders FOR UPDATE USING (true);
```

**`items` JSONB structure:**
```typescript
type OrderItem = {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  notes: string | null;  // "ohne Zwiebeln", "extra scharf"
};
```

### Modified Tables

#### `restaurants`
```sql
ALTER TABLE restaurants ADD COLUMN account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX idx_restaurants_account ON restaurants(account_id);
```

---

## 2. TypeScript Types

```typescript
// ── Order Types ──────────────────────────────────────────

export type OrderStatus = 'new' | 'in_progress' | 'done';
export type SessionStatus = 'active' | 'closed';

export type OrderItem = {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  notes: string | null;
};

export type OrderPlacedBy = 'guest' | 'staff';

export type Order = {
  id: string;
  session_id: string;
  guest_name: string | null;
  guest_token: string;
  placed_by: OrderPlacedBy;
  items: OrderItem[];
  status: OrderStatus;
  total: number;
  created_at: string;
  updated_at: string;
};

export type TableSession = {
  id: string;
  restaurant_id: string;
  table_number: string;
  status: SessionStatus;
  created_at: string;
  closed_at: string | null;
};

export type RestaurantTable = {
  id: string;
  restaurant_id: string;
  table_number: string;
  is_active: boolean;
  created_at: string;
};

// ── Cart (local, not persisted to DB) ────────────────────

export type CartItem = {
  menuItem: MenuItemRecord;
  quantity: number;
  notes: string | null;
};
```

---

## 3. User Flows

### Flow A: Guest Orders Food

1. Guest scans QR code on restaurant table
2. Deep link opens: `https://roebel.app/order/{restaurant_slug}/{table_number}`
3. App checks for active session on this table:
   - Active session exists → join it
   - No active session → create new `table_session` (status: 'active')
4. Guest sees restaurant menu (existing menu_categories + menu_items)
5. Guest taps items to add to local cart (quantity selector, optional notes per item)
6. Guest optionally enters their name (e.g., "Max") for identification
7. Guest taps "Bestellung senden" → order inserted into DB with status 'new'
8. Guest sees order confirmation with real-time status tracking
9. Guest can submit additional orders (creates new order row in same session)

### Flow B: Kitchen Manages Orders

1. Restaurant owner/staff switches to their Unternehmen account in the app
2. Navigates to "Küche" (Kitchen) screen
3. Sees **live session overview**: all active tables with status indicators
   - Table 3: 2 orders (1 new, 1 in progress)
   - Table 7: 1 order (done)
   - + button to create a session for an unoccupied table
4. Taps a table → sees all orders for that session:
   - Each order shows: guest name, items list, placed_by badge (guest/staff), time since ordered
   - **New orders** highlighted
5. Chef taps order status to advance: New → In Progress → Done
6. Chef can tap "Bestellung aufnehmen" to place an order for a guest at that table (→ Flow D)
7. Status change pushed to guest via Supabase Realtime
8. Can close a table session when guests leave (archives all orders)

### Flow D: Staff Places Order for Guest

1. Restaurant staff opens the Kitchen screen (acting as restaurant account)
2. Sees **live view of all active table sessions** with order counts
3. Selects a table (e.g., "Tisch 3") — or creates a new session if the table has no active session
4. Taps "Bestellung aufnehmen" (Take order)
5. Sees the same menu as guests, **but with a search bar** for quick item lookup
6. Searches and adds items to a staff-side cart (e.g., types "Schni" → finds "Schnitzel")
7. Optionally enters guest name (e.g., "Gast 3")
8. Submits → order created with `placed_by: 'staff'`
9. Order appears in the kitchen ticket queue alongside guest-placed orders
10. Guest-placed and staff-placed orders for the same table are visible together

**Key difference from guest flow:** Staff has **search** for speed. Guests do **not** have search so they browse the full menu.

### Flow C: Restaurant Configures Tables

1. Restaurant owner navigates to table management screen
2. Adds tables with numbers/names: "1", "2", "Terrasse 1"
3. For each table, generates QR code (rendered in-app via `react-native-qrcode-svg`)
4. Can share/save QR image for printing

---

## 4. App Architecture

### New Screens

| Screen | Route | Access | Purpose |
|---|---|---|---|
| Order Menu | `/order/[slug]/[table]` | Anyone | Browse menu, add to cart (no search) |
| Order Cart | `/order/cart` | Anyone (in session) | Review cart, enter name, submit |
| Order Status | `/order/status` | Anyone (in session) | Track order status in real-time |
| Kitchen Dashboard | `/kitchen` | Restaurant account owners | Live view of sessions + order tickets |
| Staff Order | `/kitchen/order/[sessionId]` | Restaurant account owners | Place order for guest (with search) |
| Table Management | `/kitchen/tables` | Restaurant account owners | Add tables, generate QR codes |

### New Context: `OrderSessionContext`

Manages the guest's ordering session state. Mounted when entering an order flow, unmounted when leaving.

```typescript
interface OrderSessionContextValue {
  // Session state
  session: TableSession | null;
  restaurant: RestaurantWithMenus | null;

  // Cart (local, pre-submission)
  cart: CartItem[];
  addToCart: (item: MenuItemRecord, quantity: number, notes?: string) => void;
  removeFromCart: (index: number) => void;
  updateCartItem: (index: number, quantity: number, notes?: string) => void;
  clearCart: () => void;
  cartTotal: number;

  // Orders (submitted)
  orders: Order[];
  submitOrder: () => Promise<void>;

  // Guest identity
  guestToken: string;
  guestName: string | null;
  setGuestName: (name: string) => void;

  // Session lifecycle
  leaveSession: () => void;
  isLoading: boolean;
}
```

**Guest token:** UUID generated once per device, stored in AsyncStorage (`@guest_token`). Reused across sessions so returning visitors are recognized.

### New Supabase Module: `lib/supabase-orders.ts`

```typescript
// Session management
findOrCreateSession(restaurantId, tableNumber) → TableSession
closeSession(sessionId) → void

// Order CRUD (guest + staff)
submitOrder(sessionId, guestToken, guestName, items, placedBy: 'guest' | 'staff') → Order
fetchSessionOrders(sessionId) → Order[]
fetchGuestOrders(sessionId, guestToken) → Order[]
updateOrderStatus(orderId, status: OrderStatus) → void

// Kitchen queries
fetchKitchenOrders(restaurantId) → { table_number, session_id, orders: Order[] }[]
fetchActiveSessionsForRestaurant(restaurantId) → TableSession[]

// Table management
fetchRestaurantTables(restaurantId) → RestaurantTable[]
createTable(restaurantId, tableNumber) → RestaurantTable
deleteTable(tableId) → void
updateTable(tableId, updates) → RestaurantTable

// Menu search (staff only)
searchMenuItems(restaurantId, query) → MenuItemRecord[]

// Realtime subscriptions
subscribeToSessionOrders(sessionId, callback) → RealtimeChannel
subscribeToKitchenOrders(restaurantId, callback) → RealtimeChannel
```

### QR Code Strategy

- **Format:** Universal link `https://roebel.app/order/{slug}/{table_number}`
- **Expo deep linking:** Configured in app.config to handle `roebel.app/order/*`
- **Rendering:** `react-native-qrcode-svg` for in-app QR generation
- **Sharing:** Native share sheet to save/print QR image

### Navigation Gating

- `/order/*` routes: **no auth required** — anyone can access
- `/kitchen/*` routes: **gated by restaurant account ownership** — `isOwnerOf(restaurant.account_id)` via AccountContext
- Kitchen screen shown in navigation only when active account is a restaurant's Unternehmen

---

## 5. Files to Create/Modify

### New Files

| File | Purpose |
|---|---|
| `supabase/migrations/006_restaurant_ordering.sql` | Schema for tables, sessions, orders |
| `apps/expo/lib/supabase-orders.ts` | Order/session DB queries + Realtime |
| `apps/expo/lib/types/orders.ts` | Order, Session, Cart types |
| `apps/expo/context/OrderSessionContext.tsx` | Guest ordering session state |
| `apps/expo/app/order/[slug]/[table].tsx` | Order menu screen |
| `apps/expo/app/order/cart.tsx` | Cart review + submit |
| `apps/expo/app/order/status.tsx` | Real-time order tracking |
| `apps/expo/app/kitchen/index.tsx` | Kitchen dashboard (live sessions + tickets) |
| `apps/expo/app/kitchen/order/[sessionId].tsx` | Staff order screen (menu with search) |
| `apps/expo/app/kitchen/tables.tsx` | Table management + QR generation |
| `apps/expo/components/order/MenuBrowser.tsx` | Menu browsing with "Add" buttons |
| `apps/expo/components/order/CartSheet.tsx` | Cart bottom sheet |
| `apps/expo/components/order/OrderStatusCard.tsx` | Order status display |
| `apps/expo/components/kitchen/KitchenOrderCard.tsx` | Single order ticket |
| `apps/expo/components/kitchen/TableQRCode.tsx` | QR code display/share |

### Modified Files

| File | Change |
|---|---|
| `apps/expo/lib/types.ts` | Add `account_id` to RestaurantRecord |
| `apps/expo/app/_layout.tsx` | Add OrderSessionContext provider, new routes |
| `apps/expo/lib/supabase-restaurants.ts` | Add `fetchRestaurantBySlug` with account_id |

---

## 6. Verification

### Database
- [ ] Migration creates restaurant_tables, table_sessions, orders tables
- [ ] restaurants table has account_id column
- [ ] RLS policies allow read for all, write for authenticated
- [ ] Supabase Realtime enabled for orders and table_sessions tables

### Guest Ordering Flow
- [ ] QR code scan opens the correct restaurant/table
- [ ] Active session found or new one created
- [ ] Menu displays correctly with categories and items
- [ ] Cart: add, remove, update quantity, notes
- [ ] Order submission creates correct DB row with JSONB items
- [ ] Guest sees real-time status updates (New → In Progress → Done)
- [ ] Multiple guests at same table see same session
- [ ] Guest can submit multiple orders in same session

### Kitchen Flow
- [ ] Kitchen screen shows live view of active table sessions
- [ ] Each session shows order count, latest status
- [ ] New orders appear in real-time (no refresh needed)
- [ ] Status transitions: New → In Progress → Done
- [ ] Status change reflected to guest in real-time
- [ ] Can close a table session
- [ ] Only restaurant account owners can access kitchen

### Staff Ordering Flow
- [ ] Staff can select an active table session and tap "Bestellung aufnehmen"
- [ ] Staff can create a new session for a table directly from kitchen view
- [ ] Staff sees menu with **search bar** (type to filter items)
- [ ] Search filters by item name across all categories
- [ ] Staff can add items to cart, set quantity, add notes
- [ ] Staff enters optional guest name
- [ ] Submitted order has `placed_by: 'staff'`
- [ ] Staff-placed and guest-placed orders appear together in kitchen view
- [ ] Guest ordering screen does NOT have search functionality

### Table Management
- [ ] Add/remove tables for a restaurant
- [ ] QR code generated with correct deep link
- [ ] QR code can be shared/saved

### Edge Cases
- [ ] Guest scans QR for restaurant with no menu items → show empty state
- [ ] Guest submits empty cart → blocked by validation
- [ ] Session closed while guest is still ordering → graceful error
- [ ] Multiple concurrent sessions at same table prevented (only one active per table)
- [ ] Device without app installed → universal link falls back to web/app store
- [ ] Sessions are closed manually by restaurant staff (no auto-timeout in v1)
