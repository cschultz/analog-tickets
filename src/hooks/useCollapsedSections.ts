import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "admin-nav-collapsed-sections";

/**
 * Hook to manage collapsed sections state with localStorage persistence.
 * Sections stay collapsed/expanded as you navigate around the admin.
 */
export function useCollapsedSections() {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    // Initialize from localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Sync to localStorage whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsedSections));
    } catch {
      // Ignore storage errors
    }
  }, [collapsedSections]);

  const toggleSection = useCallback((label: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  }, []);

  const isCollapsed = useCallback((label: string) => {
    return !!collapsedSections[label];
  }, [collapsedSections]);

  return {
    collapsedSections,
    toggleSection,
    isCollapsed,
  };
}
