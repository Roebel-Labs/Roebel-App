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
  const sessions = await fetchActiveSessionsForRestaurant(restaurantId);
  if (sessions.length === 0) return [];

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
      () => onOrderChange()
    )
    .subscribe();

  return channel;
}
