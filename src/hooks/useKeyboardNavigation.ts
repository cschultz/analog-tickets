import { useEffect, useCallback, useState, RefObject, useMemo } from "react";

interface KeyboardNavigationOptions {
  containerRef: RefObject<HTMLElement>;
  itemSelector: string;
  onSelect?: (element: HTMLElement, index: number) => void;
  onOpen?: (element: HTMLElement, index: number) => void;
  onEscape?: () => void;
  enabled?: boolean;
  columns?: number; // For grid navigation
}

export function useKeyboardNavigation({
  containerRef,
  itemSelector,
  onSelect,
  onOpen,
  onEscape,
  enabled = true,
  columns = 1,
}: KeyboardNavigationOptions) {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const getItems = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.querySelectorAll(itemSelector));
  }, [containerRef, itemSelector]);

  const focusItem = useCallback(
    (index: number) => {
      const items = getItems();
      if (index >= 0 && index < items.length) {
        setFocusedIndex(index);
        items[index].focus();
        items[index].scrollIntoView({ block: "nearest", behavior: "smooth" });
        onSelect?.(items[index], index);
      }
    },
    [getItems, onSelect]
  );

  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const items = getItems();
      if (items.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
        case "j":
          e.preventDefault();
          if (columns > 1) {
            // Grid: move down one row
            const nextRow = focusedIndex + columns;
            focusItem(nextRow < items.length ? nextRow : focusedIndex);
          } else {
            focusItem(Math.min(focusedIndex + 1, items.length - 1));
          }
          break;

        case "ArrowUp":
        case "k":
          e.preventDefault();
          if (columns > 1) {
            // Grid: move up one row
            const prevRow = focusedIndex - columns;
            focusItem(prevRow >= 0 ? prevRow : focusedIndex);
          } else {
            focusItem(Math.max(focusedIndex - 1, 0));
          }
          break;

        case "ArrowRight":
        case "l":
          e.preventDefault();
          focusItem(Math.min(focusedIndex + 1, items.length - 1));
          break;

        case "ArrowLeft":
        case "h":
          e.preventDefault();
          focusItem(Math.max(focusedIndex - 1, 0));
          break;

        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < items.length) {
            onOpen?.(items[focusedIndex], focusedIndex);
          }
          break;

        case "Escape":
          e.preventDefault();
          setFocusedIndex(-1);
          onEscape?.();
          break;

        case "Home":
          e.preventDefault();
          focusItem(0);
          break;

        case "End":
          e.preventDefault();
          focusItem(items.length - 1);
          break;
      }
    };

    // Listen on window for global keyboard nav
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, containerRef, getItems, focusedIndex, focusItem, onOpen, onEscape, columns]);

  return {
    focusedIndex,
    setFocusedIndex,
    focusItem,
    resetFocus: () => setFocusedIndex(-1),
  };
}

// Global keyboard shortcuts hook
export function useGlobalKeyboardShortcuts(shortcuts: Record<string, () => void>) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const combo = [
        e.ctrlKey && "ctrl",
        e.metaKey && "meta",
        e.shiftKey && "shift",
        e.altKey && "alt",
        key,
      ]
        .filter(Boolean)
        .join("+");

      if (shortcuts[combo]) {
        e.preventDefault();
        shortcuts[combo]();
      } else if (shortcuts[key]) {
        e.preventDefault();
        shortcuts[key]();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts]);
}
