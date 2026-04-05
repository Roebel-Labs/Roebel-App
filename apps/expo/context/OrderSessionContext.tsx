import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
        const newToken = generateUUID();
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
