import { useState, useCallback, useEffect, useRef } from "react";

interface ColumnWidths {
  [columnId: string]: number;
}

interface UseColumnResizeOptions {
  columns: string[];
  defaultWidths?: ColumnWidths;
  minWidth?: number;
  maxWidth?: number;
  persistKey?: string;
}

interface UseColumnResizeResult {
  columnWidths: ColumnWidths;
  startResize: (columnId: string, startX: number) => void;
  isResizing: boolean;
  resizingColumn: string | null;
  resetWidths: () => void;
}

export function useColumnResize({
  columns,
  defaultWidths = {},
  minWidth = 50,
  maxWidth = 500,
  persistKey,
}: UseColumnResizeOptions): UseColumnResizeResult {
  // Initialize widths from localStorage or defaults
  const getInitialWidths = (): ColumnWidths => {
    if (persistKey) {
      try {
        const saved = localStorage.getItem(`column-widths-${persistKey}`);
        if (saved) {
          return JSON.parse(saved);
        }
      } catch {
        // Ignore parse errors
      }
    }

    const initial: ColumnWidths = {};
    columns.forEach((col) => {
      initial[col] = defaultWidths[col] ?? 150;
    });
    return initial;
  };

  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(getInitialWidths);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  // Persist widths to localStorage
  useEffect(() => {
    if (persistKey && !resizingColumn) {
      try {
        localStorage.setItem(`column-widths-${persistKey}`, JSON.stringify(columnWidths));
      } catch {
        // Ignore storage errors
      }
    }
  }, [columnWidths, persistKey, resizingColumn]);

  const startResize = useCallback(
    (columnId: string, startX: number) => {
      setResizingColumn(columnId);
      startXRef.current = startX;
      startWidthRef.current = columnWidths[columnId] ?? 150;
    },
    [columnWidths]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!resizingColumn) return;

      const delta = e.clientX - startXRef.current;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));

      setColumnWidths((prev) => ({
        ...prev,
        [resizingColumn]: newWidth,
      }));
    },
    [resizingColumn, minWidth, maxWidth]
  );

  const handleMouseUp = useCallback(() => {
    setResizingColumn(null);
  }, []);

  useEffect(() => {
    if (resizingColumn) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
    }
  }, [resizingColumn, handleMouseMove, handleMouseUp]);

  const resetWidths = useCallback(() => {
    const initial: ColumnWidths = {};
    columns.forEach((col) => {
      initial[col] = defaultWidths[col] ?? 150;
    });
    setColumnWidths(initial);
    
    if (persistKey) {
      localStorage.removeItem(`column-widths-${persistKey}`);
    }
  }, [columns, defaultWidths, persistKey]);

  return {
    columnWidths,
    startResize,
    isResizing: !!resizingColumn,
    resizingColumn,
    resetWidths,
  };
}

// Hook for column reordering
interface UseColumnReorderOptions {
  columns: string[];
  persistKey?: string;
}

export function useColumnReorder({ columns, persistKey }: UseColumnReorderOptions) {
  const getInitialOrder = (): string[] => {
    if (persistKey) {
      try {
        const saved = localStorage.getItem(`column-order-${persistKey}`);
        if (saved) {
          const order = JSON.parse(saved);
          // Validate that all columns exist
          if (columns.every((c) => order.includes(c)) && order.length === columns.length) {
            return order;
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
    return columns;
  };

  const [columnOrder, setColumnOrder] = useState<string[]>(getInitialOrder);
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Persist order to localStorage
  useEffect(() => {
    if (persistKey && !draggingColumn) {
      try {
        localStorage.setItem(`column-order-${persistKey}`, JSON.stringify(columnOrder));
      } catch {
        // Ignore storage errors
      }
    }
  }, [columnOrder, persistKey, draggingColumn]);

  const startDrag = useCallback((columnId: string) => {
    setDraggingColumn(columnId);
  }, []);

  const onDragOver = useCallback((columnId: string) => {
    if (draggingColumn && columnId !== draggingColumn) {
      setDropTarget(columnId);
    }
  }, [draggingColumn]);

  const endDrag = useCallback(() => {
    if (draggingColumn && dropTarget) {
      setColumnOrder((prev) => {
        const newOrder = [...prev];
        const fromIndex = newOrder.indexOf(draggingColumn);
        const toIndex = newOrder.indexOf(dropTarget);
        
        newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, draggingColumn);
        
        return newOrder;
      });
    }
    setDraggingColumn(null);
    setDropTarget(null);
  }, [draggingColumn, dropTarget]);

  const resetOrder = useCallback(() => {
    setColumnOrder(columns);
    if (persistKey) {
      localStorage.removeItem(`column-order-${persistKey}`);
    }
  }, [columns, persistKey]);

  return {
    columnOrder,
    draggingColumn,
    dropTarget,
    startDrag,
    onDragOver,
    endDrag,
    resetOrder,
  };
}
