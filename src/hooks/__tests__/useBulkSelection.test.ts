import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBulkSelection } from '../useBulkSelection';

interface TestItem {
  id: string;
  name: string;
}

describe('useBulkSelection', () => {
  const items: TestItem[] = [
    { id: '1', name: 'Item 1' },
    { id: '2', name: 'Item 2' },
    { id: '3', name: 'Item 3' },
  ];

  const getItemId = (item: TestItem) => item.id;

  describe('initial state', () => {
    it('starts with no selections', () => {
      const { result } = renderHook(() => 
        useBulkSelection({ items, getItemId })
      );
      
      expect(result.current.selectedCount).toBe(0);
      expect(result.current.selectedItems).toHaveLength(0);
      expect(result.current.isSelectionMode).toBe(false);
    });
  });

  describe('toggleSelection', () => {
    it('selects an item when not selected', () => {
      const { result } = renderHook(() => 
        useBulkSelection({ items, getItemId })
      );
      
      act(() => {
        result.current.toggleSelection(items[0]);
      });
      
      expect(result.current.selectedCount).toBe(1);
      expect(result.current.isSelected(items[0])).toBe(true);
    });

    it('deselects an item when already selected', () => {
      const { result } = renderHook(() => 
        useBulkSelection({ items, getItemId })
      );
      
      act(() => {
        result.current.toggleSelection(items[0]);
      });
      
      act(() => {
        result.current.toggleSelection(items[0]);
      });
      
      expect(result.current.selectedCount).toBe(0);
      expect(result.current.isSelected(items[0])).toBe(false);
    });
  });

  describe('selectItem', () => {
    it('adds item to selection', () => {
      const { result } = renderHook(() => 
        useBulkSelection({ items, getItemId })
      );
      
      act(() => {
        result.current.selectItem(items[0]);
      });
      
      expect(result.current.isSelected(items[0])).toBe(true);
    });

    it('does not duplicate if already selected', () => {
      const { result } = renderHook(() => 
        useBulkSelection({ items, getItemId })
      );
      
      act(() => {
        result.current.selectItem(items[0]);
        result.current.selectItem(items[0]);
      });
      
      expect(result.current.selectedCount).toBe(1);
    });
  });

  describe('deselectItem', () => {
    it('removes item from selection', () => {
      const { result } = renderHook(() => 
        useBulkSelection({ items, getItemId })
      );
      
      act(() => {
        result.current.selectItem(items[0]);
      });
      
      act(() => {
        result.current.deselectItem(items[0]);
      });
      
      expect(result.current.isSelected(items[0])).toBe(false);
    });

    it('does nothing if item not selected', () => {
      const { result } = renderHook(() => 
        useBulkSelection({ items, getItemId })
      );
      
      act(() => {
        result.current.deselectItem(items[0]);
      });
      
      expect(result.current.selectedCount).toBe(0);
    });
  });

  describe('selectAll', () => {
    it('selects all items', () => {
      const { result } = renderHook(() => 
        useBulkSelection({ items, getItemId })
      );
      
      act(() => {
        result.current.selectAll();
      });
      
      expect(result.current.selectedCount).toBe(3);
      expect(result.current.isSelected(items[0])).toBe(true);
      expect(result.current.isSelected(items[1])).toBe(true);
      expect(result.current.isSelected(items[2])).toBe(true);
    });
  });

  describe('deselectAll', () => {
    it('clears all selections', () => {
      const { result } = renderHook(() => 
        useBulkSelection({ items, getItemId })
      );
      
      act(() => {
        result.current.selectAll();
      });
      
      act(() => {
        result.current.deselectAll();
      });
      
      expect(result.current.selectedCount).toBe(0);
    });
  });

  describe('selectedItems', () => {
    it('returns array of selected items', () => {
      const { result } = renderHook(() => 
        useBulkSelection({ items, getItemId })
      );
      
      act(() => {
        result.current.selectItem(items[0]);
        result.current.selectItem(items[2]);
      });
      
      expect(result.current.selectedItems).toHaveLength(2);
      expect(result.current.selectedItems).toContainEqual(items[0]);
      expect(result.current.selectedItems).toContainEqual(items[2]);
    });

    it('updates when items prop changes', () => {
      const { result, rerender } = renderHook(
        ({ items }) => useBulkSelection({ items, getItemId }),
        { initialProps: { items } }
      );
      
      act(() => {
        result.current.selectItem(items[0]);
      });
      
      // Remove item 0 from the list
      const newItems = [items[1], items[2]];
      rerender({ items: newItems });
      
      // selectedItems should only include items still in the list
      expect(result.current.selectedItems).not.toContainEqual(items[0]);
    });
  });

  describe('selection mode', () => {
    it('toggles selection mode on', () => {
      const { result } = renderHook(() => 
        useBulkSelection({ items, getItemId })
      );
      
      act(() => {
        result.current.toggleSelectionMode();
      });
      
      expect(result.current.isSelectionMode).toBe(true);
    });

    it('toggles selection mode off and clears selections', () => {
      const { result } = renderHook(() => 
        useBulkSelection({ items, getItemId })
      );
      
      act(() => {
        result.current.toggleSelectionMode();
        result.current.selectAll();
      });
      
      act(() => {
        result.current.toggleSelectionMode();
      });
      
      expect(result.current.isSelectionMode).toBe(false);
      expect(result.current.selectedCount).toBe(0);
    });

    it('exitSelectionMode clears selections', () => {
      const { result } = renderHook(() => 
        useBulkSelection({ items, getItemId })
      );
      
      act(() => {
        result.current.toggleSelectionMode();
        result.current.selectAll();
      });
      
      act(() => {
        result.current.exitSelectionMode();
      });
      
      expect(result.current.isSelectionMode).toBe(false);
      expect(result.current.selectedCount).toBe(0);
    });
  });

  describe('isSelected', () => {
    it('returns true for selected items', () => {
      const { result } = renderHook(() => 
        useBulkSelection({ items, getItemId })
      );
      
      act(() => {
        result.current.selectItem(items[1]);
      });
      
      expect(result.current.isSelected(items[1])).toBe(true);
    });

    it('returns false for non-selected items', () => {
      const { result } = renderHook(() => 
        useBulkSelection({ items, getItemId })
      );
      
      act(() => {
        result.current.selectItem(items[0]);
      });
      
      expect(result.current.isSelected(items[1])).toBe(false);
    });
  });
});
