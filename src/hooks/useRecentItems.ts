import { useState, useEffect, useCallback } from "react";

export interface RecentItem {
  id: string;
  type: "customer" | "artist" | "vendor" | "artisan" | "partner" | "registration";
  name: string;
  subtitle?: string;
  url: string;
  viewedAt: number;
}

const STORAGE_KEY = "admin_recent_items";
const MAX_ITEMS = 10;

export function useRecentItems() {
  const [items, setItems] = useState<RecentItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error("Failed to save recent items:", error);
    }
  }, [items]);

  const addItem = useCallback((item: Omit<RecentItem, "viewedAt">) => {
    setItems((prev) => {
      // Remove existing entry for same item
      const filtered = prev.filter((i) => !(i.id === item.id && i.type === item.type));
      
      // Add new item at the beginning
      const newItem: RecentItem = { ...item, viewedAt: Date.now() };
      const updated = [newItem, ...filtered].slice(0, MAX_ITEMS);
      
      return updated;
    });
  }, []);

  const removeItem = useCallback((id: string, type: string) => {
    setItems((prev) => prev.filter((i) => !(i.id === id && i.type === type)));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Get items grouped by type
  const groupedItems = items.reduce((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push(item);
    return acc;
  }, {} as Record<string, RecentItem[]>);

  return {
    items,
    addItem,
    removeItem,
    clearAll,
    groupedItems,
    hasItems: items.length > 0,
  };
}
