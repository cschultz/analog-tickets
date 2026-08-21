import { useState, useCallback, useMemo } from "react";

interface UseBulkSelectionOptions<T> {
  items: T[];
  getItemId: (item: T) => string;
}

export function useBulkSelection<T>({ items, getItemId }: UseBulkSelectionOptions<T>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const toggleSelection = useCallback(
    (item: T) => {
      const id = getItemId(item);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [getItemId]
  );

  const selectItem = useCallback(
    (item: T) => {
      setSelectedIds((prev) => new Set(prev).add(getItemId(item)));
    },
    [getItemId]
  );

  const deselectItem = useCallback(
    (item: T) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(getItemId(item));
        return next;
      });
    },
    [getItemId]
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map(getItemId)));
  }, [items, getItemId]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (item: T) => selectedIds.has(getItemId(item)),
    [selectedIds, getItemId]
  );

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(getItemId(item))),
    [items, selectedIds, getItemId]
  );

  const toggleSelectionMode = useCallback(() => {
    setIsSelectionMode((prev) => {
      if (prev) {
        // Exiting selection mode, clear selections
        setSelectedIds(new Set());
      }
      return !prev;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    selectedItems,
    selectedCount: selectedIds.size,
    isSelectionMode,
    toggleSelection,
    selectItem,
    deselectItem,
    selectAll,
    deselectAll,
    isSelected,
    toggleSelectionMode,
    exitSelectionMode,
  };
}
