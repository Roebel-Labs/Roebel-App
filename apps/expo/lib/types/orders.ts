import type { MenuItemRecord } from '../types';

// -- Order Types --

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

// -- Cart (local, not persisted to DB) --

export type CartItem = {
  menuItem: MenuItemRecord;
  quantity: number;
  notes: string | null;
};

// -- Kitchen view helpers --

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
