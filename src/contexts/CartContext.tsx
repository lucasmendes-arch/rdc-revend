import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/lib/supabase';

export interface CartItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  image?: string | null;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>, desiredQty?: number) => void;
  removeItem: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  clearCart: () => void;
  total: number;
  count: number;
  minOrderValue: number;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const STORAGE_KEY = 'rdc-cart-v1';

// Initialize cart from localStorage
const loadCartFromStorage = (): CartItem[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

interface CartProviderProps {
  children: ReactNode;
}

const USER_KEY = 'rdc-cart-user';

export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const prevUserRef = useRef<string | null>(null);

  // Use lazy initializer to read localStorage only on mount
  const [items, setItems] = useState<CartItem[]>(() => loadCartFromStorage());
  const [minOrderValue, setMinOrderValue] = useState<number>(500); // Default fallback
  const [cartOpen, setCartOpen] = useState<boolean>(false);

  useEffect(() => {
    supabase
      .from('store_settings')
      .select('min_cart_value')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (data?.min_cart_value) {
          setMinOrderValue(data.min_cart_value);
        }
      });
  }, []);

  // Clear cart when user changes (login/logout/switch account)
  useEffect(() => {
    if (authLoading) return; // Wait for AuthContext to resolve the initial session

    const currentUserId = user?.id || null;
    const storedUserId = localStorage.getItem(USER_KEY);

    if (prevUserRef.current === null) {
      // First render — check if stored user matches current
      prevUserRef.current = storedUserId;
      if (storedUserId && storedUserId !== currentUserId) {
        setItems([]);
        localStorage.removeItem(STORAGE_KEY);
      }
    } else if (prevUserRef.current !== currentUserId) {
      // User changed during session
      setItems([]);
      localStorage.removeItem(STORAGE_KEY);
    }

    if (currentUserId) {
      localStorage.setItem(USER_KEY, currentUserId);
    } else {
      localStorage.removeItem(USER_KEY);
    }
    prevUserRef.current = currentUserId;
  }, [user?.id, authLoading]);

  // Sync to localStorage whenever items change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = (item: Omit<CartItem, 'quantity'>, desiredQty: number = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      
      // Track AddToCart event
      if (window.fbq) {
        window.fbq('track', 'AddToCart', {
          content_ids: [item.id],
          content_name: item.name,
          value: item.price * desiredQty,
          currency: 'BRL',
          content_type: 'product'
        });
      }

      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + desiredQty } : i
        );
      }
      return [...prev, { ...item, quantity: desiredQty }];
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) {
      removeItem(id);
    } else {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, quantity: qty } : i))
      );
    }
  };

  const clearCart = () => {
    setItems([]);
  };

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  const value: CartContextType = {
    items,
    addItem,
    removeItem,
    updateQty,
    clearCart,
    total,
    count,
    minOrderValue,
    cartOpen,
    setCartOpen,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
