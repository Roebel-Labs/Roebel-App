# Restaurant Ordering System — Design Spec

## Context

Restaurant owners (citizens with Unternehmen accounts) need a digital ordering system. Visitors scan a QR code on their table, browse the menu, and submit orders from their phone. The kitchen sees incoming orders in real-time and moves them through states (New → In Progress → Done). Multiple guests at the same table share one session, and all orders merge into one view per table for the kitchen.

This spec covers the **core ordering loop**: table sessions, guest ordering, and kitchen ticket management. Deferred to future specs: AI menu generation (photo → menu items), in-app payment, and manual order entry by staff.

---

## Design Decisions

| Decision | Choice |
|---|---|
| Scope | Sessions + ordering flow + kitchen tickets |
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
One order = one person's submission at a table.

```sql
CREATE TABLE orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  guest_name    TEXT,
  guest_token   TEXT NOT NULL,
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

export type Order = {
  id: string;
  session_id: string;
  guest_name: string | null;
  guest_token: string;
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
3. Sees orders grouped by table, sorted by time:
   - **New orders** highlighted at top
   - Each order shows: table number, guest name, items list, time since ordered
4. Chef taps order status to advance: New → In Progress → Done
5. Status change pushed to guest via Supabase Realtime
6. Can close a table session when guests leave (archives all orders)

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
| Order Menu | `/order/[slug]/[table]` | Anyone | Browse menu, add to cart |
| Order Cart | `/order/cart` | Anyone (in session) | Review cart, enter name, submit |
| Order Status | `/order/status` | Anyone (in session) | Track order status in real-time |
| Kitchen Dashboard | `/kitchen` | Restaurant account owners | View/manage all active orders |
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

// Order CRUD
submitOrder(sessionId, guestToken, guestName, items) → Order
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
| `apps/expo/app/kitchen/index.tsx` | Kitchen dashboard |
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
- [ ] Kitchen screen shows orders grouped by table
- [ ] New orders appear in real-time (no refresh needed)
- [ ] Status transitions: New → In Progress → Done
- [ ] Status change reflected to guest in real-time
- [ ] Can close a table session
- [ ] Only restaurant account owners can access kitchen

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
