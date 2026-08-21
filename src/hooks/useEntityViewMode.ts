import { useState, useEffect } from "react";

export type EntityViewMode = "table" | "board";

/**
 * Persisted view mode for entity screens (Artists, Partners, Artisans, Vendors, WineCamp)
 * Stores preference in localStorage per entity type
 */
export function useEntityViewMode(entityType: string, defaultMode: EntityViewMode = "table") {
  const storageKey = `admin-entity-view-${entityType}`;
  
  const [viewMode, setViewMode] = useState<EntityViewMode>(() => {
    if (typeof window === "undefined") return defaultMode;
    const stored = localStorage.getItem(storageKey);
    if (stored === "table" || stored === "board") {
      return stored;
    }
    return defaultMode;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, viewMode);
  }, [viewMode, storageKey]);

  // Helper to check if board view is active (works with both "board" and legacy "kanban")
  const isBoard = viewMode === "board";
  const isTable = viewMode === "table";

  return { viewMode, setViewMode, isBoard, isTable };
}
