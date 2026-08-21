import { useState, useCallback, useMemo, useRef, useEffect } from "react";

interface VirtualScrollOptions {
  itemCount: number;
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

interface VirtualScrollResult {
  virtualItems: { index: number; start: number; size: number }[];
  totalHeight: number;
  startIndex: number;
  endIndex: number;
  scrollToIndex: (index: number, align?: "start" | "center" | "end") => void;
  containerRef: React.RefObject<HTMLDivElement>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

export function useVirtualScroll({
  itemCount,
  itemHeight,
  containerHeight,
  overscan = 5,
}: VirtualScrollOptions): VirtualScrollResult {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalHeight = itemCount * itemHeight;

  const { startIndex, endIndex, virtualItems } = useMemo(() => {
    const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const endIdx = Math.min(itemCount - 1, startIdx + visibleCount + overscan * 2);

    const items: { index: number; start: number; size: number }[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      items.push({
        index: i,
        start: i * itemHeight,
        size: itemHeight,
      });
    }

    return {
      startIndex: startIdx,
      endIndex: endIdx,
      virtualItems: items,
    };
  }, [scrollTop, itemHeight, containerHeight, itemCount, overscan]);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const scrollToIndex = useCallback(
    (index: number, align: "start" | "center" | "end" = "start") => {
      if (!containerRef.current) return;

      let scrollPosition = index * itemHeight;

      if (align === "center") {
        scrollPosition = index * itemHeight - containerHeight / 2 + itemHeight / 2;
      } else if (align === "end") {
        scrollPosition = index * itemHeight - containerHeight + itemHeight;
      }

      containerRef.current.scrollTop = Math.max(0, scrollPosition);
    },
    [itemHeight, containerHeight]
  );

  return {
    virtualItems,
    totalHeight,
    startIndex,
    endIndex,
    scrollToIndex,
    containerRef,
    onScroll,
  };
}

// Hook for dynamic row heights
interface DynamicVirtualScrollOptions {
  itemCount: number;
  estimatedItemHeight: number;
  containerHeight: number;
  overscan?: number;
}

export function useDynamicVirtualScroll({
  itemCount,
  estimatedItemHeight,
  containerHeight,
  overscan = 5,
}: DynamicVirtualScrollOptions) {
  const [scrollTop, setScrollTop] = useState(0);
  const [measuredHeights, setMeasuredHeights] = useState<Map<number, number>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  const measureItem = useCallback((index: number, height: number) => {
    setMeasuredHeights((prev) => {
      if (prev.get(index) === height) return prev;
      const next = new Map(prev);
      next.set(index, height);
      return next;
    });
  }, []);

  const getItemHeight = useCallback(
    (index: number) => measuredHeights.get(index) ?? estimatedItemHeight,
    [measuredHeights, estimatedItemHeight]
  );

  const { virtualItems, totalHeight, startIndex, endIndex } = useMemo(() => {
    // Calculate positions
    const positions: number[] = [0];
    for (let i = 0; i < itemCount; i++) {
      positions.push(positions[i] + getItemHeight(i));
    }
    const total = positions[itemCount] || 0;

    // Find visible range
    let startIdx = 0;
    for (let i = 0; i < itemCount; i++) {
      if (positions[i + 1] > scrollTop) {
        startIdx = Math.max(0, i - overscan);
        break;
      }
    }

    let endIdx = itemCount - 1;
    for (let i = startIdx; i < itemCount; i++) {
      if (positions[i] > scrollTop + containerHeight) {
        endIdx = Math.min(itemCount - 1, i + overscan);
        break;
      }
    }

    const items: { index: number; start: number; size: number }[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      items.push({
        index: i,
        start: positions[i],
        size: getItemHeight(i),
      });
    }

    return {
      virtualItems: items,
      totalHeight: total,
      startIndex: startIdx,
      endIndex: endIdx,
    };
  }, [scrollTop, itemCount, containerHeight, overscan, getItemHeight]);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const scrollToIndex = useCallback(
    (index: number) => {
      if (!containerRef.current) return;
      
      let position = 0;
      for (let i = 0; i < index; i++) {
        position += getItemHeight(i);
      }
      
      containerRef.current.scrollTop = position;
    },
    [getItemHeight]
  );

  return {
    virtualItems,
    totalHeight,
    startIndex,
    endIndex,
    scrollToIndex,
    containerRef,
    onScroll,
    measureItem,
  };
}
