# Restaurant Ordering System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a QR-based restaurant ordering system where guests scan a table QR, browse the menu, submit orders, and the kitchen manages tickets in real-time — including staff-placed orders with search.

**Architecture:** Supabase tables for sessions/orders with Realtime subscriptions push live updates to both guests and kitchen. OrderSessionContext manages guest-side cart + session state. Kitchen screens gated by restaurant account ownership via AccountContext.

**Tech Stack:** Expo Router, Supabase (Postgres + Realtime), React Context, react-native-qrcode-svg, NativeWind v5 (className), AsyncStorage

**Spec:** `docs/superpowers/specs/2026-04-05-restaurant-ordering-design.md`

---

## File Map

### New Files

| File | Responsibility |
|---|---|
| `supabase/migrations/006_restaurant_ordering.sql` | DB schema: restaurant_tables, table_sessions, orders + restaurants.account_id |
| `apps/expo/lib/types/orders.ts` | TypeScript types: Order, TableSession, RestaurantTable, CartItem, OrderItem |
| `apps/expo/lib/supabase-orders.ts` | All order/session/table DB queries + Realtime subscriptions |
| `apps/expo/context/OrderSessionContext.tsx` | Guest ordering state: cart, session, orders, guest token |
| `apps/expo/app/order/[slug]/[table].tsx` | Guest menu screen (no search) |
| `apps/expo/app/order/cart.tsx` | Guest cart review + submit |
| `apps/expo/app/order/status.tsx` | Guest real-time order tracking |
| `apps/expo/app/kitchen/index.tsx` | Kitchen dashboard: live sessions + order tickets |
| `apps/expo/app/kitchen/order/[sessionId].tsx` | Staff order screen (with search) |
| `apps/expo/app/kitchen/tables.tsx` | Table management + QR generation |
| `apps/expo/components/order/OrderableMenuItemCard.tsx` | Menu item with "+" add button |
| `apps/expo/components/order/OrderStatusCard.tsx` | Single order status display |
| `apps/expo/components/kitchen/KitchenOrderCard.tsx` | Kitchen ticket card with status toggle |
| `apps/expo/components/kitchen/TableQRCode.tsx` | QR code render + share |

### Modified Files

| File | Change |
|---|---|
| `apps/expo/lib/types.ts` | Add `account_id` to `RestaurantRecord` |
| `apps/expo/app/_layout.tsx` | Add new Stack.Screen entries for `/order/*` and `/kitchen/*` |

---

## Task 1: SQL Migration

**Files:**
- Create: `supabase/migrations/006_restaurant_ordering.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- MIGRATION 6: Restaurant Ordering System
-- ============================================================

-- 1. Link restaurants to accounts
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_restaurants_account ON restaurants(account_id);

-- 2. Restaurant tables (for QR codes)
CREATE TABLE IF NOT EXISTS restaurant_tables (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_number   TEXT NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, table_number)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_restaurant ON restaurant_tables(restaurant_id);
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "restaurant_tables_select" ON restaurant_tables FOR SELECT USING (true);
CREATE POLICY "restaurant_tables_insert" ON restaurant_tables FOR INSERT WITH CHECK (true);
CREATE POLICY "restaurant_tables_update" ON restaurant_tables FOR UPDATE USING (true);
CREATE POLICY "restaurant_tables_delete" ON restaurant_tables FOR DELETE USING (true);

-- 3. Table sessions
CREATE TABLE IF NOT EXISTS table_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_number   TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_table_sessions_restaurant ON table_sessions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_table_sessions_status ON table_sessions(status);
ALTER TABLE table_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "table_sessions_select" ON table_sessions FOR SELECT USING (true);
CREATE POLICY "table_sessions_insert" ON table_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "table_sessions_update" ON table_sessions FOR UPDATE USING (true);

-- 4. Orders
CREATE TABLE IF NOT EXISTS orders (
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

CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_select" ON orders FOR SELECT USING (true);
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_update" ON orders FOR UPDATE USING (true);

-- 5. Enable Realtime for orders and table_sessions
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE table_sessions;
```

- [ ] **Step 2: Run the migration in Supabase**

Apply via Supabase Dashboard (SQL Editor) or `supabase db push`. Verify tables exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006_restaurant_ordering.sql
git commit -m "feat: add restaurant ordering schema (tables, sessions, orders)"
git push
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `apps/expo/lib/types/orders.ts`
- Modify: `apps/expo/lib/types.ts`

- [ ] **Step 1: Create order types file**

Create `apps/expo/lib/types/orders.ts`:

```typescript
import type { MenuItemRecord } from '../types';

// ── Order Types ──────────────────────────────────────────

export type OrderStatus = 'new' | 'in_progress' | 'done';
export type SessionStatus = 'active' | 'closed';
export type OrderPlacedBy = 'guest' | 'staff';

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

// ── Kitchen view helpers ─────────────────────────────────

export type SessionWithOrders = {
  session: TableSession;
  orders: Order[];
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Neu',
  in_progress: 'In Bearbeitung',
  done: 'Fertig',
};

export const ORDER_STATUS_NEXT: Record<OrderStatus, OrderStatus | null> = {
  new: 'in_progress',
  in_progress: 'done',
  done: null,
};
```

- [ ] **Step 2: Add `account_id` to RestaurantRecord in types.ts**

In `apps/expo/lib/types.ts`, find the `RestaurantRecord` type and add `account_id` field after `updated_at`:

```typescript
  // ... existing fields ...
  updated_at: string;
  account_id: string | null;
};
```

- [ ] **Step 3: Commit**

```bash
git add apps/expo/lib/types/orders.ts apps/expo/lib/types.ts
git commit -m "feat: add order/session/cart TypeScript types"
git push
```

---

## Task 3: Supabase Orders Module

**Files:**
- Create: `apps/expo/lib/supabase-orders.ts`

- [ ] **Step 1: Create the module with session management**

Create `apps/expo/lib/supabase-orders.ts`:

```typescript
import { supabase } from './supabase';
import type { MenuItemRecord } from './types';
import type {
  Order,
  OrderStatus,
  OrderPlacedBy,
  OrderItem,
  TableSession,
  RestaurantTable,
  SessionWithOrders,
} from './types/orders';

// ── Session Management ───────────────────────────────────

export async function findOrCreateSession(
  restaurantId: string,
  tableNumber: string
): Promise<TableSession | null> {
  // Check for existing active session
  const { data: existing } = await supabase
    .from('table_sessions' as any)
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('table_number', tableNumber)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) return existing as TableSession;

  // Create new session
  const { data, error } = await supabase
    .from('table_sessions' as any)
    .insert({ restaurant_id: restaurantId, table_number: tableNumber })
    .select()
    .single();

  if (error) {
    console.error('findOrCreateSession error:', error);
    return null;
  }
  return data as TableSession;
}

export async function closeSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('table_sessions' as any)
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) {
    console.error('closeSession error:', error);
    throw error;
  }
}

export async function fetchActiveSessionsForRestaurant(
  restaurantId: string
): Promise<TableSession[]> {
  const { data, error } = await supabase
    .from('table_sessions' as any)
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchActiveSessionsForRestaurant error:', error);
    return [];
  }
  return data as TableSession[];
}

// ── Order CRUD ───────────────────────────────────────────

export async function submitOrder(
  sessionId: string,
  guestToken: string,
  guestName: string | null,
  items: OrderItem[],
  placedBy: OrderPlacedBy = 'guest'
): Promise<Order | null> {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const { data, error } = await supabase
    .from('orders' as any)
    .insert({
      session_id: sessionId,
      guest_token: guestToken,
      guest_name: guestName,
      placed_by: placedBy,
      items: JSON.stringify(items),
      total,
      status: 'new',
    })
    .select()
    .single();

  if (error) {
    console.error('submitOrder error:', error);
    return null;
  }
  return { ...data, items: typeof data.items === 'string' ? JSON.parse(data.items) : data.items } as Order;
}

export async function fetchSessionOrders(sessionId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders' as any)
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('fetchSessionOrders error:', error);
    return [];
  }
  return (data as any[]).map(d => ({
    ...d,
    items: typeof d.items === 'string' ? JSON.parse(d.items) : d.items,
  })) as Order[];
}

export async function fetchGuestOrders(
  sessionId: string,
  guestToken: string
): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders' as any)
    .select('*')
    .eq('session_id', sessionId)
    .eq('guest_token', guestToken)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('fetchGuestOrders error:', error);
    return [];
  }
  return (data as any[]).map(d => ({
    ...d,
    items: typeof d.items === 'string' ? JSON.parse(d.items) : d.items,
  })) as Order[];
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus
): Promise<void> {
  const { error } = await supabase
    .from('orders' as any)
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) {
    console.error('updateOrderStatus error:', error);
    throw error;
  }
}

// ── Kitchen Queries ──────────────────────────────────────

export async function fetchKitchenOrders(
  restaurantId: string
): Promise<SessionWithOrders[]> {
  // Get active sessions
  const sessions = await fetchActiveSessionsForRestaurant(restaurantId);
  if (sessions.length === 0) return [];

  // Get all orders for active sessions
  const sessionIds = sessions.map(s => s.id);
  const { data: allOrders, error } = await supabase
    .from('orders' as any)
    .select('*')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('fetchKitchenOrders error:', error);
    return sessions.map(s => ({ session: s, orders: [] }));
  }

  const ordersBySession = new Map<string, Order[]>();
  for (const raw of allOrders as any[]) {
    const order: Order = {
      ...raw,
      items: typeof raw.items === 'string' ? JSON.parse(raw.items) : raw.items,
    };
    const list = ordersBySession.get(order.session_id) || [];
    list.push(order);
    ordersBySession.set(order.session_id, list);
  }

  return sessions.map(session => ({
    session,
    orders: ordersBySession.get(session.id) || [],
  }));
}

// ── Table Management ─────────────────────────────────────

export async function fetchRestaurantTables(
  restaurantId: string
): Promise<RestaurantTable[]> {
  const { data, error } = await supabase
    .from('restaurant_tables' as any)
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('table_number', { ascending: true });

  if (error) {
    console.error('fetchRestaurantTables error:', error);
    return [];
  }
  return data as RestaurantTable[];
}

export async function createRestaurantTable(
  restaurantId: string,
  tableNumber: string
): Promise<RestaurantTable | null> {
  const { data, error } = await supabase
    .from('restaurant_tables' as any)
    .insert({ restaurant_id: restaurantId, table_number: tableNumber })
    .select()
    .single();

  if (error) {
    console.error('createRestaurantTable error:', error);
    return null;
  }
  return data as RestaurantTable;
}

export async function deleteRestaurantTable(tableId: string): Promise<void> {
  const { error } = await supabase
    .from('restaurant_tables' as any)
    .delete()
    .eq('id', tableId);

  if (error) {
    console.error('deleteRestaurantTable error:', error);
    throw error;
  }
}

// ── Menu Search (staff only) ─────────────────────────────

export async function searchMenuItems(
  restaurantId: string,
  query: string
): Promise<MenuItemRecord[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_available', true)
    .ilike('name', `%${query}%`)
    .order('name', { ascending: true })
    .limit(20);

  if (error) {
    console.error('searchMenuItems error:', error);
    return [];
  }
  return data as MenuItemRecord[];
}

// ── Realtime Subscriptions ───────────────────────────────

export function subscribeToSessionOrders(
  sessionId: string,
  onInsert: (order: Order) => void,
  onUpdate: (order: Order) => void
) {
  const channel = supabase
    .channel(`session-orders-${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'orders',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        const raw = payload.new as any;
        onInsert({
          ...raw,
          items: typeof raw.items === 'string' ? JSON.parse(raw.items) : raw.items,
        });
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        const raw = payload.new as any;
        onUpdate({
          ...raw,
          items: typeof raw.items === 'string' ? JSON.parse(raw.items) : raw.items,
        });
      }
    )
    .subscribe();

  return channel;
}

export function subscribeToKitchenOrders(
  restaurantId: string,
  onOrderChange: () => void
) {
  // Subscribe to new sessions and order changes for this restaurant
  // We listen to table_sessions for new sessions and orders for order updates
  const channel = supabase
    .channel(`kitchen-${restaurantId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'table_sessions',
        filter: `restaurant_id=eq.${restaurantId}`,
      },
      () => onOrderChange()
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
      },
      (payload) => {
        // Filter client-side: only react to orders belonging to this restaurant's sessions
        // The kitchen refetches all data on any order change (simple approach)
        onOrderChange();
      }
    )
    .subscribe();

  return channel;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/expo/lib/supabase-orders.ts
git commit -m "feat: add supabase-orders module (sessions, orders, tables, realtime)"
git push
```

---

## Task 4: OrderSessionContext

**Files:**
- Create: `apps/expo/context/OrderSessionContext.tsx`

- [ ] **Step 1: Create the context**

Create `apps/expo/context/OrderSessionContext.tsx`:

```typescript
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabase';
import {
  findOrCreateSession,
  submitOrder as submitOrderDB,
  fetchGuestOrders,
  subscribeToSessionOrders,
} from '@/lib/supabase-orders';
import type { RestaurantWithMenus, MenuItemRecord } from '@/lib/types';
import type { TableSession, CartItem, Order, OrderItem } from '@/lib/types/orders';

const GUEST_TOKEN_KEY = '@guest_token';

interface OrderSessionContextValue {
  session: TableSession | null;
  restaurant: RestaurantWithMenus | null;

  cart: CartItem[];
  addToCart: (item: MenuItemRecord, quantity: number, notes?: string) => void;
  removeFromCart: (index: number) => void;
  updateCartItem: (index: number, quantity: number, notes?: string) => void;
  clearCart: () => void;
  cartTotal: number;

  orders: Order[];
  submitOrder: () => Promise<void>;

  guestToken: string;
  guestName: string | null;
  setGuestName: (name: string) => void;

  leaveSession: () => void;
  isLoading: boolean;
  isSubmitting: boolean;
}

const OrderSessionContext = createContext<OrderSessionContextValue | undefined>(undefined);

interface Props {
  children: React.ReactNode;
  restaurant: RestaurantWithMenus;
  tableNumber: string;
}

export function OrderSessionProvider({ children, restaurant, tableNumber }: Props) {
  const [session, setSession] = useState<TableSession | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [guestToken, setGuestToken] = useState<string>('');
  const [guestName, setGuestName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const channelRef = useRef<any>(null);

  // Load or create guest token
  useEffect(() => {
    AsyncStorage.getItem(GUEST_TOKEN_KEY).then((token) => {
      if (token) {
        setGuestToken(token);
      } else {
        const newToken = uuidv4();
        AsyncStorage.setItem(GUEST_TOKEN_KEY, newToken);
        setGuestToken(newToken);
      }
    });
  }, []);

  // Find or create session, load existing orders
  useEffect(() => {
    if (!guestToken || !restaurant.id) return;

    async function init() {
      setIsLoading(true);
      try {
        const sess = await findOrCreateSession(restaurant.id, tableNumber);
        setSession(sess);

        if (sess) {
          const existing = await fetchGuestOrders(sess.id, guestToken);
          setOrders(existing);
        }
      } catch (error) {
        console.error('OrderSession init error:', error);
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [guestToken, restaurant.id, tableNumber]);

  // Subscribe to realtime order updates
  useEffect(() => {
    if (!session?.id) return;

    const channel = subscribeToSessionOrders(
      session.id,
      (newOrder) => {
        if (newOrder.guest_token === guestToken) {
          setOrders((prev) => {
            if (prev.some((o) => o.id === newOrder.id)) return prev;
            return [...prev, newOrder];
          });
        }
      },
      (updatedOrder) => {
        if (updatedOrder.guest_token === guestToken) {
          setOrders((prev) =>
            prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
          );
        }
      }
    );

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [session?.id, guestToken]);

  const addToCart = useCallback((item: MenuItemRecord, quantity: number, notes?: string) => {
    setCart((prev) => {
      const existing = prev.findIndex((c) => c.menuItem.id === item.id && c.notes === (notes || null));
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], quantity: updated[existing].quantity + quantity };
        return updated;
      }
      return [...prev, { menuItem: item, quantity, notes: notes || null }];
    });
  }, []);

  const removeFromCart = useCallback((index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateCartItem = useCallback((index: number, quantity: number, notes?: string) => {
    setCart((prev) => {
      if (quantity <= 0) return prev.filter((_, i) => i !== index);
      const updated = [...prev];
      updated[index] = { ...updated[index], quantity, notes: notes !== undefined ? notes : updated[index].notes };
      return updated;
    });
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const cartTotal = useMemo(
    () => cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0),
    [cart]
  );

  const submitOrder = useCallback(async () => {
    if (!session || cart.length === 0) return;
    setIsSubmitting(true);
    try {
      const items: OrderItem[] = cart.map((c) => ({
        menu_item_id: c.menuItem.id,
        name: c.menuItem.name,
        price: c.menuItem.price,
        quantity: c.quantity,
        notes: c.notes,
      }));
      const order = await submitOrderDB(session.id, guestToken, guestName, items, 'guest');
      if (order) {
        setOrders((prev) => [...prev, order]);
        setCart([]);
      }
    } catch (error) {
      console.error('submitOrder error:', error);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }, [session, cart, guestToken, guestName]);

  const leaveSession = useCallback(() => {
    setSession(null);
    setCart([]);
    setOrders([]);
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const value = useMemo<OrderSessionContextValue>(
    () => ({
      session, restaurant, cart, addToCart, removeFromCart, updateCartItem,
      clearCart, cartTotal, orders, submitOrder, guestToken, guestName,
      setGuestName, leaveSession, isLoading, isSubmitting,
    }),
    [session, restaurant, cart, addToCart, removeFromCart, updateCartItem,
     clearCart, cartTotal, orders, submitOrder, guestToken, guestName,
     leaveSession, isLoading, isSubmitting]
  );

  return (
    <OrderSessionContext.Provider value={value}>
      {children}
    </OrderSessionContext.Provider>
  );
}

export function useOrderSession(): OrderSessionContextValue {
  const ctx = useContext(OrderSessionContext);
  if (!ctx) throw new Error('useOrderSession must be used within OrderSessionProvider');
  return ctx;
}
```

- [ ] **Step 2: Install uuid dependency**

```bash
cd apps/expo && pnpm add uuid && pnpm add -D @types/uuid
```

- [ ] **Step 3: Commit**

```bash
git add apps/expo/context/OrderSessionContext.tsx apps/expo/package.json apps/expo/pnpm-lock.yaml
git commit -m "feat: add OrderSessionContext for guest ordering state"
git push
```

---

## Task 5: Guest Order Screens

**Files:**
- Create: `apps/expo/components/order/OrderableMenuItemCard.tsx`
- Create: `apps/expo/app/order/[slug]/[table].tsx`
- Create: `apps/expo/app/order/cart.tsx`
- Create: `apps/expo/app/order/status.tsx`
- Modify: `apps/expo/app/_layout.tsx`

- [ ] **Step 1: Create OrderableMenuItemCard**

Create `apps/expo/components/order/OrderableMenuItemCard.tsx`:

```typescript
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import type { MenuItemRecord } from '@/lib/types';
import { formatMenuPrice } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  item: MenuItemRecord;
  onAdd: (item: MenuItemRecord, quantity: number, notes?: string) => void;
};

export default function OrderableMenuItemCard({ item, onAdd }: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  const handleAdd = () => {
    onAdd(item, quantity, notes.trim() || undefined);
    setExpanded(false);
    setQuantity(1);
    setNotes('');
  };

  return (
    <Pressable
      onPress={() => setExpanded(!expanded)}
      style={{ borderBottomWidth: 1, borderBottomColor: colors.borderSecondary, paddingVertical: 14, paddingHorizontal: 16 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ fontSize: 15, fontFamily: 'Inter-Regular', color: colors.textPrimary }}>{item.name}</Text>
          {item.description ? (
            <Text style={{ fontSize: 13, fontFamily: 'Inter-Regular', color: colors.textSecondary, marginTop: 2 }} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 15, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>
            {formatMenuPrice(item.price)}
          </Text>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: colors.onPrimary, fontSize: 18, fontFamily: 'Inter-Medium' }}>+</Text>
          </View>
        </View>
      </View>

      {expanded && (
        <View style={{ marginTop: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable
              onPress={() => setQuantity(Math.max(1, quantity - 1))}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }}
            >
              <Text style={{ fontSize: 18, color: colors.textPrimary }}>-</Text>
            </Pressable>
            <Text style={{ fontSize: 16, fontFamily: 'Inter-Medium', color: colors.textPrimary, minWidth: 24, textAlign: 'center' }}>
              {quantity}
            </Text>
            <Pressable
              onPress={() => setQuantity(quantity + 1)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }}
            >
              <Text style={{ fontSize: 18, color: colors.textPrimary }}>+</Text>
            </Pressable>
          </View>
          <TextInput
            placeholder="Anmerkung (z.B. ohne Zwiebeln)"
            placeholderTextColor={colors.textTertiary}
            value={notes}
            onChangeText={setNotes}
            style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: 'Inter-Regular', color: colors.textPrimary }}
          />
          <Pressable
            onPress={handleAdd}
            style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ color: colors.onPrimary, fontSize: 15, fontFamily: 'Inter-Medium' }}>
              Hinzufügen ({formatMenuPrice(item.price * quantity)})
            </Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}
```

- [ ] **Step 2: Create guest order menu screen**

Create `apps/expo/app/order/[slug]/[table].tsx`:

```typescript
import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useRestaurantDetail } from '@/hooks/useRestaurantDetail';
import { OrderSessionProvider, useOrderSession } from '@/context/OrderSessionContext';
import OrderableMenuItemCard from '@/components/order/OrderableMenuItemCard';
import { formatMenuPrice } from '@/lib/utils';

function OrderMenuContent() {
  const router = useRouter();
  const { colors } = useTheme();
  const { restaurant, cart, addToCart, cartTotal, isLoading } = useOrderSession();

  if (isLoading || !restaurant) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const categories = restaurant.menu_categories || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={{ fontSize: 20, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>{restaurant.name}</Text>
        <Text style={{ fontSize: 14, fontFamily: 'Inter-Regular', color: colors.textSecondary, marginTop: 2 }}>Speisekarte</Text>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {categories.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, color: colors.textTertiary }}>Keine Speisekarte vorhanden</Text>
          </View>
        ) : (
          categories.map((cat) => (
            <View key={cat.id} style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 17, fontFamily: 'Inter-Medium', color: colors.textPrimary, paddingHorizontal: 16, marginBottom: 8 }}>
                {cat.name}
              </Text>
              {(cat.menu_items || []).filter((i: any) => i.is_available !== false).map((item: any) => (
                <OrderableMenuItemCard key={item.id} item={item} onAdd={addToCart} />
              ))}
            </View>
          ))
        )}
        <View style={{ height: 120 }} />
      </ScrollView>

      {cart.length > 0 && (
        <Pressable
          onPress={() => router.push('/order/cart')}
          style={{ position: 'absolute', bottom: 32, left: 16, right: 16, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}
        >
          <View style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2 }}>
            <Text style={{ color: colors.onPrimary, fontSize: 15, fontFamily: 'Inter-Medium' }}>{cart.reduce((s, c) => s + c.quantity, 0)}</Text>
          </View>
          <Text style={{ color: colors.onPrimary, fontSize: 16, fontFamily: 'Inter-Medium' }}>Warenkorb ansehen</Text>
          <Text style={{ color: colors.onPrimary, fontSize: 15, fontFamily: 'Inter-Medium' }}>{formatMenuPrice(cartTotal)}</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

export default function OrderMenuScreen() {
  const { slug, table } = useLocalSearchParams<{ slug: string; table: string }>();
  const { restaurant, loading } = useRestaurantDetail(slug || '');
  const { colors } = useTheme();

  if (loading || !restaurant) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <OrderSessionProvider restaurant={restaurant} tableNumber={table || '1'}>
      <OrderMenuContent />
    </OrderSessionProvider>
  );
}
```

- [ ] **Step 3: Create cart screen**

Create `apps/expo/app/order/cart.tsx`:

```typescript
import React from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useOrderSession } from '@/context/OrderSessionContext';
import { formatMenuPrice } from '@/lib/utils';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function OrderCartScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { cart, removeFromCart, updateCartItem, cartTotal, guestName, setGuestName, submitOrder, isSubmitting } = useOrderSession();

  const handleSubmit = async () => {
    if (cart.length === 0) {
      Alert.alert('Warenkorb leer', 'Bitte fügen Sie mindestens ein Gericht hinzu.');
      return;
    }
    try {
      await submitOrder();
      router.replace('/order/status');
    } catch {
      Alert.alert('Fehler', 'Bestellung konnte nicht gesendet werden.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 18, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>Warenkorb</Text>
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }}>
        {cart.length === 0 ? (
          <Text style={{ color: colors.textTertiary, textAlign: 'center', marginTop: 40 }}>Dein Warenkorb ist leer</Text>
        ) : (
          cart.map((item, index) => (
            <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSecondary }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontFamily: 'Inter-Regular', color: colors.textPrimary }}>{item.menuItem.name}</Text>
                {item.notes ? <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{item.notes}</Text> : null}
                <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginTop: 4 }}>{formatMenuPrice(item.menuItem.price * item.quantity)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable onPress={() => updateCartItem(index, item.quantity - 1)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, color: colors.textPrimary }}>-</Text>
                </Pressable>
                <Text style={{ fontSize: 15, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>{item.quantity}</Text>
                <Pressable onPress={() => updateCartItem(index, item.quantity + 1)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, color: colors.textPrimary }}>+</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <View style={{ marginTop: 24 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginBottom: 8 }}>DEIN NAME (optional)</Text>
          <TextInput
            placeholder="z.B. Max"
            placeholderTextColor={colors.textTertiary}
            value={guestName || ''}
            onChangeText={setGuestName}
            style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter-Regular', color: colors.textPrimary }}
          />
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {cart.length > 0 && (
        <View style={{ position: 'absolute', bottom: 32, left: 16, right: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 16, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>Gesamt</Text>
            <Text style={{ fontSize: 16, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>{formatMenuPrice(cartTotal)}</Text>
          </View>
          <Pressable
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', opacity: isSubmitting ? 0.6 : 1 }}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={{ color: colors.onPrimary, fontSize: 16, fontFamily: 'Inter-Medium' }}>Bestellung senden</Text>
            )}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Create order status screen**

Create `apps/expo/app/order/status.tsx`:

```typescript
import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useOrderSession } from '@/context/OrderSessionContext';
import { formatMenuPrice } from '@/lib/utils';
import { ORDER_STATUS_LABELS } from '@/lib/types/orders';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  new: { bg: '#FEF3C7', text: '#92400E' },
  in_progress: { bg: '#DBEAFE', text: '#1E40AF' },
  done: { bg: '#D1FAE5', text: '#065F46' },
};

export default function OrderStatusScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { orders, restaurant, session, leaveSession } = useOrderSession();

  const handleBack = () => {
    // Go back to menu to order more
    router.back();
  };

  const handleLeave = () => {
    leaveSession();
    router.replace('/');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={{ fontSize: 20, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>Deine Bestellungen</Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 2 }}>
          {restaurant?.name} — Tisch {session?.table_number}
        </Text>
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }}>
        {orders.length === 0 ? (
          <Text style={{ color: colors.textTertiary, textAlign: 'center', marginTop: 40 }}>Noch keine Bestellungen</Text>
        ) : (
          orders.map((order) => {
            const statusColor = STATUS_COLORS[order.status] || STATUS_COLORS.new;
            return (
              <View key={order.id} style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <View style={{ backgroundColor: statusColor.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ color: statusColor.text, fontSize: 13, fontFamily: 'Inter-Medium' }}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, color: colors.textTertiary }}>
                    {new Date(order.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                {order.items.map((item, i) => (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                    <Text style={{ fontSize: 14, color: colors.textPrimary }}>{item.quantity}x {item.name}</Text>
                    <Text style={{ fontSize: 14, color: colors.textSecondary }}>{formatMenuPrice(item.price * item.quantity)}</Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderSecondary }}>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>Summe</Text>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>{formatMenuPrice(order.total)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={{ padding: 16, gap: 10 }}>
        <Pressable onPress={handleBack} style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ color: colors.onPrimary, fontSize: 15, fontFamily: 'Inter-Medium' }}>Weitere Bestellung aufgeben</Text>
        </Pressable>
        <Pressable onPress={handleLeave} style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary, fontSize: 15, fontFamily: 'Inter-Regular' }}>Sitzung verlassen</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 5: Add routes to _layout.tsx**

In `apps/expo/app/_layout.tsx`, add these Stack.Screen entries inside the `<Stack>` component, after the existing restaurant routes:

```typescript
<Stack.Screen name="order/[slug]/[table]" options={{ headerShown: false }} />
<Stack.Screen name="order/cart" options={{ headerShown: false }} />
<Stack.Screen name="order/status" options={{ headerShown: false }} />
<Stack.Screen name="kitchen/index" options={{ headerShown: false }} />
<Stack.Screen name="kitchen/order/[sessionId]" options={{ headerShown: false }} />
<Stack.Screen name="kitchen/tables" options={{ headerShown: false }} />
```

- [ ] **Step 6: Commit**

```bash
git add apps/expo/components/order/OrderableMenuItemCard.tsx apps/expo/app/order/ apps/expo/app/_layout.tsx
git commit -m "feat: add guest ordering screens (menu, cart, status)"
git push
```

---

## Task 6: Kitchen Dashboard

**Files:**
- Create: `apps/expo/components/kitchen/KitchenOrderCard.tsx`
- Create: `apps/expo/app/kitchen/index.tsx`

- [ ] **Step 1: Create KitchenOrderCard**

Create `apps/expo/components/kitchen/KitchenOrderCard.tsx`:

```typescript
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { formatMenuPrice } from '@/lib/utils';
import type { Order } from '@/lib/types/orders';
import { ORDER_STATUS_LABELS, ORDER_STATUS_NEXT } from '@/lib/types/orders';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  new: { bg: '#FEF3C7', text: '#92400E' },
  in_progress: { bg: '#DBEAFE', text: '#1E40AF' },
  done: { bg: '#D1FAE5', text: '#065F46' },
};

type Props = {
  order: Order;
  onStatusChange: (orderId: string, newStatus: string) => void;
};

export default function KitchenOrderCard({ order, onStatusChange }: Props) {
  const { colors } = useTheme();
  const statusColor = STATUS_COLORS[order.status] || STATUS_COLORS.new;
  const nextStatus = ORDER_STATUS_NEXT[order.status];
  const timeSince = getTimeSince(order.created_at);

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderLeftWidth: order.status === 'new' ? 4 : 0, borderLeftColor: '#F59E0B' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>
            {order.guest_name || 'Gast'}
          </Text>
          {order.placed_by === 'staff' && (
            <View style={{ backgroundColor: colors.borderSecondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>Personal</Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: 12, color: colors.textTertiary }}>{timeSince}</Text>
      </View>

      {order.items.map((item, i) => (
        <View key={i} style={{ flexDirection: 'row', paddingVertical: 3 }}>
          <Text style={{ fontSize: 14, color: colors.textPrimary, fontFamily: 'Inter-Medium', marginRight: 6 }}>{item.quantity}x</Text>
          <Text style={{ fontSize: 14, color: colors.textPrimary, flex: 1 }}>{item.name}</Text>
          {item.notes ? <Text style={{ fontSize: 12, color: colors.textTertiary, fontStyle: 'italic' }}>{item.notes}</Text> : null}
        </View>
      ))}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSecondary }}>
        <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>{formatMenuPrice(order.total)}</Text>
        {nextStatus ? (
          <Pressable
            onPress={() => onStatusChange(order.id, nextStatus)}
            style={{ backgroundColor: statusColor.bg, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}
          >
            <Text style={{ color: statusColor.text, fontSize: 13, fontFamily: 'Inter-Medium' }}>
              → {ORDER_STATUS_LABELS[nextStatus]}
            </Text>
          </Pressable>
        ) : (
          <View style={{ backgroundColor: STATUS_COLORS.done.bg, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}>
            <Text style={{ color: STATUS_COLORS.done.text, fontSize: 13, fontFamily: 'Inter-Medium' }}>Fertig</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function getTimeSince(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min`;
  return `vor ${Math.floor(mins / 60)} Std`;
}
```

- [ ] **Step 2: Create kitchen dashboard screen**

Create `apps/expo/app/kitchen/index.tsx`:

```typescript
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import {
  fetchKitchenOrders,
  updateOrderStatus,
  closeSession,
  findOrCreateSession,
  subscribeToKitchenOrders,
  fetchRestaurantTables,
} from '@/lib/supabase-orders';
import { supabase } from '@/lib/supabase';
import type { SessionWithOrders, OrderStatus, RestaurantTable } from '@/lib/types/orders';
import KitchenOrderCard from '@/components/kitchen/KitchenOrderCard';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function KitchenDashboardScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();

  const [sessionsWithOrders, setSessionsWithOrders] = useState<SessionWithOrders[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  // Find the restaurant linked to this account
  useEffect(() => {
    if (!activeAccount?.id) return;

    async function findRestaurant() {
      const { data } = await supabase
        .from('restaurants')
        .select('id')
        .eq('account_id', activeAccount!.id)
        .eq('status', 'published')
        .maybeSingle();

      if (data) setRestaurantId(data.id);
      else setLoading(false);
    }
    findRestaurant();
  }, [activeAccount?.id]);

  const loadData = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const [sessions, tbl] = await Promise.all([
        fetchKitchenOrders(restaurantId),
        fetchRestaurantTables(restaurantId),
      ]);
      setSessionsWithOrders(sessions);
      setTables(tbl);
    } catch (error) {
      console.error('Kitchen load error:', error);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime subscription
  useEffect(() => {
    if (!restaurantId) return;

    const channel = subscribeToKitchenOrders(restaurantId, () => {
      loadData();
    });
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [restaurantId, loadData]);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    await updateOrderStatus(orderId, newStatus as OrderStatus);
    loadData();
  };

  const handleCloseSession = async (sessionId: string) => {
    await closeSession(sessionId);
    setSelectedSession(null);
    loadData();
  };

  const handleCreateSession = async (tableNumber: string) => {
    if (!restaurantId) return;
    await findOrCreateSession(restaurantId, tableNumber);
    loadData();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (!restaurantId && !loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <Text style={{ fontSize: 16, color: colors.textTertiary, textAlign: 'center', padding: 32 }}>
          Kein Restaurant mit diesem Konto verknüpft
        </Text>
        <Pressable onPress={() => router.back()} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: colors.onPrimary, fontFamily: 'Inter-Medium' }}>Zurück</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const selected = selectedSession ? sessionsWithOrders.find(s => s.session.id === selectedSession) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => selectedSession ? setSelectedSession(null) : router.back()} style={{ marginRight: 12 }}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 18, fontFamily: 'Inter-Medium', color: colors.textPrimary, flex: 1 }}>
          {selectedSession ? `Tisch ${selected?.session.table_number}` : 'Küche'}
        </Text>
        <Pressable onPress={() => router.push('/kitchen/tables')} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surface, borderRadius: 8 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>Tische</Text>
        </Pressable>
      </View>

      {!selectedSession ? (
        // Session overview
        <ScrollView
          style={{ flex: 1, padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          {sessionsWithOrders.length === 0 && (
            <Text style={{ color: colors.textTertiary, textAlign: 'center', marginTop: 40 }}>Keine aktiven Tische</Text>
          )}
          {sessionsWithOrders.map(({ session, orders }) => {
            const newCount = orders.filter(o => o.status === 'new').length;
            const inProgressCount = orders.filter(o => o.status === 'in_progress').length;

            return (
              <Pressable
                key={session.id}
                onPress={() => setSelectedSession(session.id)}
                style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 10, borderLeftWidth: newCount > 0 ? 4 : 0, borderLeftColor: '#F59E0B' }}
              >
                <Text style={{ fontSize: 17, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>Tisch {session.table_number}</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                  {newCount > 0 && <Text style={{ fontSize: 13, color: '#92400E' }}>{newCount} neu</Text>}
                  {inProgressCount > 0 && <Text style={{ fontSize: 13, color: '#1E40AF' }}>{inProgressCount} in Bearbeitung</Text>}
                  <Text style={{ fontSize: 13, color: colors.textTertiary }}>{orders.length} gesamt</Text>
                </View>
              </Pressable>
            );
          })}

          {/* Create session for unused tables */}
          {tables.filter(t => t.is_active && !sessionsWithOrders.some(s => s.session.table_number === t.table_number)).length > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginBottom: 8 }}>Neue Sitzung starten</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {tables
                  .filter(t => t.is_active && !sessionsWithOrders.some(s => s.session.table_number === t.table_number))
                  .map(t => (
                    <Pressable
                      key={t.id}
                      onPress={() => handleCreateSession(t.table_number)}
                      style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}
                    >
                      <Text style={{ fontSize: 14, color: colors.textPrimary }}>+ Tisch {t.table_number}</Text>
                    </Pressable>
                  ))}
              </View>
            </View>
          )}
        </ScrollView>
      ) : (
        // Session detail: orders for selected table
        <ScrollView style={{ flex: 1, padding: 16 }}>
          {selected?.orders.map(order => (
            <KitchenOrderCard key={order.id} order={order} onStatusChange={handleStatusChange} />
          ))}

          <Pressable
            onPress={() => router.push(`/kitchen/order/${selectedSession}` as any)}
            style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 }}
          >
            <Text style={{ color: colors.onPrimary, fontSize: 15, fontFamily: 'Inter-Medium' }}>Bestellung aufnehmen</Text>
          </Pressable>

          <Pressable
            onPress={() => handleCloseSession(selectedSession)}
            style={{ borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 }}
          >
            <Text style={{ color: colors.error || '#DC2626', fontSize: 14, fontFamily: 'Inter-Regular' }}>Tisch schließen</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/expo/components/kitchen/KitchenOrderCard.tsx apps/expo/app/kitchen/index.tsx
git commit -m "feat: add kitchen dashboard with live session overview and order tickets"
git push
```

---

## Task 7: Staff Order Screen (with Search)

**Files:**
- Create: `apps/expo/app/kitchen/order/[sessionId].tsx`

- [ ] **Step 1: Create staff order screen**

Create `apps/expo/app/kitchen/order/[sessionId].tsx`:

```typescript
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { submitOrder, searchMenuItems } from '@/lib/supabase-orders';
import { fetchRestaurantBySlug } from '@/lib/supabase-restaurants';
import { formatMenuPrice } from '@/lib/utils';
import type { MenuItemRecord, RestaurantWithMenus } from '@/lib/types';
import type { CartItem, OrderItem, TableSession } from '@/lib/types/orders';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function StaffOrderScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const { colors } = useTheme();

  const [session, setSession] = useState<TableSession | null>(null);
  const [restaurant, setRestaurant] = useState<RestaurantWithMenus | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [guestName, setGuestName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MenuItemRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load session and restaurant data
  useEffect(() => {
    if (!sessionId) return;

    async function load() {
      const { data: sess } = await supabase
        .from('table_sessions' as any)
        .select('*')
        .eq('id', sessionId)
        .single();

      if (!sess) { setLoading(false); return; }
      setSession(sess as TableSession);

      // Get restaurant by ID, then fetch full menu by slug
      const { data: rest } = await supabase
        .from('restaurants')
        .select('slug')
        .eq('id', (sess as any).restaurant_id)
        .single();

      if (rest?.slug) {
        const full = await fetchRestaurantBySlug(rest.slug);
        setRestaurant(full);
      }
      setLoading(false);
    }
    load();
  }, [sessionId]);

  // Search menu items
  useEffect(() => {
    if (!searchQuery.trim() || !session?.restaurant_id) {
      setSearchResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      const results = await searchMenuItems(session.restaurant_id, searchQuery.trim());
      setSearchResults(results);
    }, 200);

    return () => clearTimeout(timeout);
  }, [searchQuery, session?.restaurant_id]);

  const addToCart = (item: MenuItemRecord) => {
    setCart(prev => {
      const existing = prev.findIndex(c => c.menuItem.id === item.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], quantity: updated[existing].quantity + 1 };
        return updated;
      }
      return [...prev, { menuItem: item, quantity: 1, notes: null }];
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0);

  const handleSubmit = async () => {
    if (cart.length === 0 || !session) return;

    setIsSubmitting(true);
    try {
      const items: OrderItem[] = cart.map(c => ({
        menu_item_id: c.menuItem.id,
        name: c.menuItem.name,
        price: c.menuItem.price,
        quantity: c.quantity,
        notes: c.notes,
      }));

      const staffToken = `staff-${Date.now()}`;
      await submitOrder(session.id, staffToken, guestName.trim() || null, items, 'staff');
      router.back();
    } catch {
      Alert.alert('Fehler', 'Bestellung konnte nicht aufgegeben werden.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const categories = restaurant?.menu_categories || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 18, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>
          Bestellung — Tisch {session?.table_number}
        </Text>
      </View>

      {/* Search bar (staff only) */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
        <TextInput
          placeholder="Gericht suchen..."
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter-Regular', color: colors.textPrimary }}
          autoFocus
        />
      </View>

      {/* Search results */}
      {searchResults.length > 0 && (
        <View style={{ paddingHorizontal: 16, maxHeight: 200 }}>
          <ScrollView style={{ backgroundColor: colors.surface, borderRadius: 12 }}>
            {searchResults.map(item => (
              <Pressable
                key={item.id}
                onPress={() => addToCart(item)}
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSecondary }}
              >
                <Text style={{ fontSize: 14, color: colors.textPrimary, flex: 1 }}>{item.name}</Text>
                <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>{formatMenuPrice(item.price)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Full menu browse (fallback when not searching) */}
        {!searchQuery.trim() && categories.map(cat => (
          <View key={cat.id} style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontFamily: 'Inter-Medium', color: colors.textPrimary, marginBottom: 6 }}>{cat.name}</Text>
            {(cat.menu_items || []).filter((i: any) => i.is_available !== false).map((item: any) => (
              <Pressable
                key={item.id}
                onPress={() => addToCart(item)}
                style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSecondary }}
              >
                <Text style={{ fontSize: 14, color: colors.textPrimary, flex: 1 }}>{item.name}</Text>
                <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>{formatMenuPrice(item.price)}</Text>
              </Pressable>
            ))}
          </View>
        ))}
        <View style={{ height: 200 }} />
      </ScrollView>

      {/* Cart + submit */}
      {cart.length > 0 && (
        <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: 16 }}>
          {cart.map((c, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
              <Text style={{ fontSize: 14, color: colors.textPrimary }}>{c.quantity}x {c.menuItem.name}</Text>
              <Pressable onPress={() => removeFromCart(i)}>
                <Text style={{ fontSize: 13, color: colors.error || '#DC2626' }}>Entfernen</Text>
              </Pressable>
            </View>
          ))}
          <TextInput
            placeholder="Gastname (optional)"
            placeholderTextColor={colors.textTertiary}
            value={guestName}
            onChangeText={setGuestName}
            style={{ backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.textPrimary, marginTop: 10 }}
          />
          <Pressable
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10, opacity: isSubmitting ? 0.6 : 1 }}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={{ color: colors.onPrimary, fontSize: 15, fontFamily: 'Inter-Medium' }}>
                Bestellung aufgeben ({formatMenuPrice(cartTotal)})
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/expo/app/kitchen/order/
git commit -m "feat: add staff order screen with menu search"
git push
```

---

## Task 8: Table Management + QR Codes

**Files:**
- Create: `apps/expo/components/kitchen/TableQRCode.tsx`
- Create: `apps/expo/app/kitchen/tables.tsx`

- [ ] **Step 1: Install QR code dependency**

```bash
cd apps/expo && pnpm add react-native-qrcode-svg react-native-svg
```

- [ ] **Step 2: Create TableQRCode component**

Create `apps/expo/components/kitchen/TableQRCode.tsx`:

```typescript
import React, { useRef } from 'react';
import { View, Text, Pressable, Share, Platform } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  slug: string;
  tableNumber: string;
};

export default function TableQRCode({ slug, tableNumber }: Props) {
  const { colors } = useTheme();
  const qrRef = useRef<any>(null);
  const url = `https://roebel.app/order/${slug}/${encodeURIComponent(tableNumber)}`;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `QR-Code für Tisch ${tableNumber}: ${url}`,
        url,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  return (
    <View style={{ alignItems: 'center', padding: 20 }}>
      <QRCode
        value={url}
        size={200}
        backgroundColor="white"
        color="black"
        getRef={(ref: any) => (qrRef.current = ref)}
      />
      <Text style={{ fontSize: 16, fontFamily: 'Inter-Medium', color: colors.textPrimary, marginTop: 16 }}>
        Tisch {tableNumber}
      </Text>
      <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>{url}</Text>
      <Pressable
        onPress={handleShare}
        style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 16 }}
      >
        <Text style={{ color: colors.onPrimary, fontSize: 14, fontFamily: 'Inter-Medium' }}>Teilen / Drucken</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 3: Create tables management screen**

Create `apps/expo/app/kitchen/tables.tsx`:

```typescript
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { supabase } from '@/lib/supabase';
import { fetchRestaurantTables, createRestaurantTable, deleteRestaurantTable } from '@/lib/supabase-orders';
import type { RestaurantTable } from '@/lib/types/orders';
import TableQRCode from '@/components/kitchen/TableQRCode';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function TableManagementScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantSlug, setRestaurantSlug] = useState<string | null>(null);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeAccount?.id) return;

    async function load() {
      const { data } = await supabase
        .from('restaurants')
        .select('id, slug')
        .eq('account_id', activeAccount!.id)
        .eq('status', 'published')
        .maybeSingle();

      if (data) {
        setRestaurantId(data.id);
        setRestaurantSlug(data.slug);
        const tbl = await fetchRestaurantTables(data.id);
        setTables(tbl);
      }
      setLoading(false);
    }
    load();
  }, [activeAccount?.id]);

  const handleAdd = async () => {
    if (!restaurantId || !newTableNumber.trim()) return;
    const table = await createRestaurantTable(restaurantId, newTableNumber.trim());
    if (table) {
      setTables(prev => [...prev, table]);
      setNewTableNumber('');
    }
  };

  const handleDelete = async (tableId: string) => {
    Alert.alert('Tisch entfernen?', 'Der QR-Code wird ungültig.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Entfernen',
        style: 'destructive',
        onPress: async () => {
          await deleteRestaurantTable(tableId);
          setTables(prev => prev.filter(t => t.id !== tableId));
          if (selectedTable === tableId) setSelectedTable(null);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const selectedTableObj = tables.find(t => t.id === selectedTable);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 18, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>Tische verwalten</Text>
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Add new table */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          <TextInput
            placeholder="Tischnummer (z.B. 1, Terrasse 2)"
            placeholderTextColor={colors.textTertiary}
            value={newTableNumber}
            onChangeText={setNewTableNumber}
            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.textPrimary }}
          />
          <Pressable
            onPress={handleAdd}
            style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, justifyContent: 'center' }}
          >
            <Text style={{ color: colors.onPrimary, fontFamily: 'Inter-Medium' }}>+</Text>
          </Pressable>
        </View>

        {/* Table list */}
        {tables.map(table => (
          <Pressable
            key={table.id}
            onPress={() => setSelectedTable(selectedTable === table.id ? null : table.id)}
            style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text style={{ fontSize: 15, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>Tisch {table.table_number}</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Text style={{ fontSize: 13, color: colors.primary }}>QR</Text>
              <Pressable onPress={() => handleDelete(table.id)}>
                <Text style={{ fontSize: 13, color: colors.error || '#DC2626' }}>Entfernen</Text>
              </Pressable>
            </View>
          </Pressable>
        ))}

        {/* QR code preview */}
        {selectedTableObj && restaurantSlug && (
          <View style={{ marginTop: 16, backgroundColor: colors.surface, borderRadius: 14 }}>
            <TableQRCode slug={restaurantSlug} tableNumber={selectedTableObj.table_number} />
          </View>
        )}

        {tables.length === 0 && (
          <Text style={{ color: colors.textTertiary, textAlign: 'center', marginTop: 40 }}>
            Noch keine Tische angelegt
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/expo/components/kitchen/TableQRCode.tsx apps/expo/app/kitchen/tables.tsx apps/expo/package.json
git commit -m "feat: add table management screen with QR code generation"
git push
```

---

## Task 9: Add account_id to RestaurantRecord + types.ts

**Files:**
- Modify: `apps/expo/lib/types.ts`

- [ ] **Step 1: Add account_id field**

In `apps/expo/lib/types.ts`, find the `RestaurantRecord` type and add after the last field before the closing `}`:

```typescript
  account_id: string | null;
```

- [ ] **Step 2: Commit**

```bash
git add apps/expo/lib/types.ts
git commit -m "feat: add account_id to RestaurantRecord type"
git push
```

---

## Task 10: Final Integration

**Files:**
- Modify: `apps/expo/app/_layout.tsx` (verify routes added in Task 5)

- [ ] **Step 1: Verify all routes are registered**

Open `apps/expo/app/_layout.tsx` and confirm these `Stack.Screen` entries exist (added in Task 5 Step 5):

```typescript
<Stack.Screen name="order/[slug]/[table]" options={{ headerShown: false }} />
<Stack.Screen name="order/cart" options={{ headerShown: false }} />
<Stack.Screen name="order/status" options={{ headerShown: false }} />
<Stack.Screen name="kitchen/index" options={{ headerShown: false }} />
<Stack.Screen name="kitchen/order/[sessionId]" options={{ headerShown: false }} />
<Stack.Screen name="kitchen/tables" options={{ headerShown: false }} />
```

- [ ] **Step 2: Test the full flow manually**

1. Run `pnpm dev:expo` and open on a device/simulator
2. Navigate to `/order/{restaurant-slug}/{table-number}` manually
3. Browse menu, add items to cart, submit order
4. Check Supabase: verify `table_sessions` and `orders` rows created
5. Switch to a restaurant Unternehmen account, open Kitchen
6. Verify the order appears with real-time updates
7. Advance order status: New → In Progress → Done
8. Verify the guest status screen updates in real-time

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete restaurant ordering system — sessions, orders, kitchen, staff ordering"
git push
```
