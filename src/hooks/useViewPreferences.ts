import { useState, useEffect, useCallback } from "react";

interface ViewPreferences {
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  columnWidths?: Record<string, number>;
  columnOrder?: string[];
  hiddenColumns?: string[];
  pageSize?: number;
  filters?: Record<string, any>;
  viewMode?: "table" | "board" | "list";
}

const STORAGE_KEY_PREFIX = "admin_view_prefs_";

export function useViewPreferences(viewId: string) {
  const storageKey = `${STORAGE_KEY_PREFIX}${viewId}`;

  const [preferences, setPreferences] = useState<ViewPreferences>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Persist to localStorage whenever preferences change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch (error) {
      console.error("Failed to save view preferences:", error);
    }
  }, [preferences, storageKey]);

  const updatePreferences = useCallback((updates: Partial<ViewPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferences({});
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  const setColumnWidth = useCallback((column: string, width: number) => {
    setPreferences((prev) => ({
      ...prev,
      columnWidths: { ...prev.columnWidths, [column]: width },
    }));
  }, []);

  const setColumnOrder = useCallback((order: string[]) => {
    setPreferences((prev) => ({ ...prev, columnOrder: order }));
  }, []);

  const toggleColumnVisibility = useCallback((column: string) => {
    setPreferences((prev) => {
      const hidden = prev.hiddenColumns || [];
      const isHidden = hidden.includes(column);
      return {
        ...prev,
        hiddenColumns: isHidden
          ? hidden.filter((c) => c !== column)
          : [...hidden, column],
      };
    });
  }, []);

  const setSort = useCallback((column: string, direction: "asc" | "desc") => {
    setPreferences((prev) => ({
      ...prev,
      sortColumn: column,
      sortDirection: direction,
    }));
  }, []);

  const setFilter = useCallback((key: string, value: any) => {
    setPreferences((prev) => ({
      ...prev,
      filters: { ...prev.filters, [key]: value },
    }));
  }, []);

  return {
    preferences,
    updatePreferences,
    resetPreferences,
    setColumnWidth,
    setColumnOrder,
    toggleColumnVisibility,
    setSort,
    setFilter,
    // Convenience getters
    sortColumn: preferences.sortColumn,
    sortDirection: preferences.sortDirection,
    columnWidths: preferences.columnWidths || {},
    columnOrder: preferences.columnOrder || [],
    hiddenColumns: preferences.hiddenColumns || [],
    pageSize: preferences.pageSize || 25,
    filters: preferences.filters || {},
    viewMode: preferences.viewMode || "table",
  };
}
