/**
 * EnhancedTable - Table with virtual scroll, resizable columns, bulk selection
 * 
 * Use this wrapper for large data tables to get:
 * - Virtual scrolling for performance
 * - Resizable columns
 * - Bulk selection with keyboard shortcuts
 * - Persistent view preferences
 */

import { useRef, ReactNode, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useVirtualScroll } from "@/hooks/useVirtualScroll";
import { useColumnResize } from "@/hooks/useColumnResize";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { useViewPreferences } from "@/hooks/useViewPreferences";
import { useGlobalKeyboardShortcuts } from "@/hooks/useKeyboardNavigation";
import { AdminTable, AdminTableHeader, AdminTableBody, AdminTableRow, AdminTableHead, AdminTableCell } from "@/components/admin/AdminUI";
import { AdminCheckbox } from "@/components/admin/AdminFormPrimitives";
import { GripVertical } from "lucide-react";

export interface ColumnDef<T> {
  id: string;
  header: string;
  accessor: keyof T | ((item: T) => ReactNode);
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  sortable?: boolean;
  sticky?: boolean;
}

interface EnhancedTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  getRowId: (item: T) => string;
  onRowClick?: (item: T) => void;
  viewId: string; // For persisting preferences
  containerHeight?: number;
  rowHeight?: number;
  enableVirtualScroll?: boolean;
  enableColumnResize?: boolean;
  enableBulkSelection?: boolean;
  bulkActions?: ReactNode;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  isLoading?: boolean;
  emptyState?: ReactNode;
  className?: string;
}

export function EnhancedTable<T>({
  data,
  columns,
  getRowId,
  onRowClick,
  viewId,
  containerHeight = 600,
  rowHeight = 48,
  enableVirtualScroll = true,
  enableColumnResize = true,
  enableBulkSelection = true,
  bulkActions,
  selectedIds: externalSelectedIds,
  onSelectionChange,
  isLoading,
  emptyState,
  className,
}: EnhancedTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);

  // View preferences for sort/column order persistence
  const { preferences, setSort, setColumnWidth } = useViewPreferences(viewId);

  // Column resize - columns needs to be array of strings
  const columnIds = useMemo(() => columns.map(c => c.id), [columns]);
  const defaultWidths = useMemo(() => 
    Object.fromEntries(columns.map(col => [col.id, col.width || 150])),
    [columns]
  );
  
  const { columnWidths, startResize, isResizing, resizingColumn } = useColumnResize({
    columns: columnIds,
    defaultWidths,
    persistKey: `table-${viewId}`,
  });

  // Bulk selection
  const {
    selectedIds: internalSelectedSet,
    isSelected,
    toggleSelection,
    selectAll,
    deselectAll,
    selectedCount,
    isSelectionMode,
  } = useBulkSelection({
    items: data,
    getItemId: getRowId,
  });

  // Convert Set to array for external compatibility
  const internalSelectedIds = useMemo(() => Array.from(internalSelectedSet), [internalSelectedSet]);
  const selectedIds = externalSelectedIds ?? internalSelectedIds;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  
  const handleToggle = (item: T) => {
    if (onSelectionChange) {
      const id = getRowId(item);
      const newIds = selectedSet.has(id)
        ? selectedIds.filter(i => i !== id)
        : [...selectedIds, id];
      onSelectionChange(newIds);
    } else {
      toggleSelection(item);
    }
  };

  // Virtual scroll
  const {
    virtualItems,
    totalHeight,
    containerRef: scrollContainerRef,
    onScroll,
  } = useVirtualScroll({
    itemCount: data.length,
    itemHeight: rowHeight,
    containerHeight,
    overscan: 5,
  });

  // Keyboard shortcuts
  useGlobalKeyboardShortcuts({
    "ctrl+a": () => {
      if (enableBulkSelection) {
        selectAll();
      }
    },
    "escape": () => {
      deselectAll();
    },
  });

  const renderCell = (item: T, column: ColumnDef<T>) => {
    if (typeof column.accessor === "function") {
      return column.accessor(item);
    }
    const value = item[column.accessor];
    return value !== null && value !== undefined ? String(value) : "";
  };

  const allSelected = data.length > 0 && selectedSet.size === data.length;
  const someSelected = selectedSet.size > 0 && selectedSet.size < data.length;

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-[hsl(var(--admin-hover))] rounded" />
        ))}
      </div>
    );
  }

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  // Non-virtual rendering for smaller datasets
  if (!enableVirtualScroll || data.length < 50) {
    return (
      <div className={cn("relative overflow-auto", className)}>
        <AdminTable>
          <AdminTableHeader>
            <AdminTableRow className="hover:bg-transparent">
              {enableBulkSelection && (
                <AdminTableHead className="w-10">
                  <AdminCheckbox
                    checked={allSelected || (someSelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => {
                      if (checked) selectAll();
                      else deselectAll();
                    }}
                  />
                </AdminTableHead>
              )}
              {columns.map((column) => (
                <AdminTableHead
                  key={column.id}
                  style={{ width: columnWidths[column.id] || column.width }}
                  className={cn(
                    "relative group",
                    column.sticky && "sticky left-0 bg-[hsl(var(--admin-surface))] z-10"
                  )}
                >
                  <span>{column.header}</span>
                  {enableColumnResize && (
                    <div
                      className={cn(
                        "absolute right-0 top-0 h-full w-1 cursor-col-resize opacity-0 group-hover:opacity-100 bg-[hsl(var(--admin-accent))]",
                        resizingColumn === column.id && "opacity-100"
                      )}
                      onMouseDown={(e) => startResize(column.id, e.clientX)}
                    >
                      <GripVertical className="h-3 w-3 absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-[hsl(var(--admin-text-muted))]" />
                    </div>
                  )}
                </AdminTableHead>
              ))}
            </AdminTableRow>
          </AdminTableHeader>
          <AdminTableBody>
            {data.map((item) => {
              const id = getRowId(item);
              const selected = selectedSet.has(id);
              return (
                <AdminTableRow
                  key={id}
                  className={cn(
                    "cursor-pointer",
                    selected && "bg-[hsl(var(--admin-selected))]"
                  )}
                  onClick={() => onRowClick?.(item)}
                >
                  {enableBulkSelection && (
                    <AdminTableCell onClick={(e) => e.stopPropagation()}>
                      <AdminCheckbox
                        checked={selected}
                        onCheckedChange={() => handleToggle(item)}
                      />
                    </AdminTableCell>
                  )}
                  {columns.map((column) => (
                    <AdminTableCell
                      key={column.id}
                      style={{ width: columnWidths[column.id] || column.width }}
                      className={cn(
                        column.sticky && "sticky left-0 bg-[hsl(var(--admin-surface))] z-10"
                      )}
                    >
                      {renderCell(item, column)}
                    </AdminTableCell>
                  ))}
                </AdminTableRow>
              );
            })}
          </AdminTableBody>
        </AdminTable>
      </div>
    );
  }

  // Virtual scroll for large datasets
  return (
    <div
      ref={scrollContainerRef}
      className={cn("relative overflow-auto", className)}
      style={{ height: containerHeight }}
      onScroll={onScroll}
    >
      <AdminTable>
        <AdminTableHeader className="sticky top-0 z-20 bg-[hsl(var(--admin-surface))]">
          <AdminTableRow className="hover:bg-transparent">
            {enableBulkSelection && (
              <AdminTableHead className="w-10">
                <AdminCheckbox
                  checked={allSelected || (someSelected ? "indeterminate" : false)}
                  onCheckedChange={(checked) => {
                    if (checked) selectAll();
                    else deselectAll();
                  }}
                />
              </AdminTableHead>
            )}
            {columns.map((column) => (
              <AdminTableHead
                key={column.id}
                style={{ width: columnWidths[column.id] || column.width }}
                className={cn(
                  "relative group",
                  column.sticky && "sticky left-0 bg-[hsl(var(--admin-surface))] z-10"
                )}
              >
                <span>{column.header}</span>
                {enableColumnResize && (
                  <div
                    className={cn(
                      "absolute right-0 top-0 h-full w-1 cursor-col-resize opacity-0 group-hover:opacity-100 bg-[hsl(var(--admin-accent))]",
                      resizingColumn === column.id && "opacity-100"
                    )}
                    onMouseDown={(e) => startResize(column.id, e.clientX)}
                  />
                )}
              </AdminTableHead>
            ))}
          </AdminTableRow>
        </AdminTableHeader>
        <AdminTableBody style={{ height: totalHeight, position: "relative" }}>
          {virtualItems.map((virtualRow) => {
            const item = data[virtualRow.index];
            const id = getRowId(item);
            const selected = selectedSet.has(id);
            return (
              <AdminTableRow
                key={id}
                className={cn(
                  "cursor-pointer absolute w-full",
                  selected && "bg-[hsl(var(--admin-selected))]"
                )}
                style={{
                  height: rowHeight,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => onRowClick?.(item)}
              >
                {enableBulkSelection && (
                  <AdminTableCell onClick={(e) => e.stopPropagation()}>
                    <AdminCheckbox
                      checked={selected}
                      onCheckedChange={() => handleToggle(item)}
                    />
                  </AdminTableCell>
                )}
                {columns.map((column) => (
                  <AdminTableCell
                    key={column.id}
                    style={{ width: columnWidths[column.id] || column.width }}
                  >
                    {renderCell(item, column)}
                  </AdminTableCell>
                ))}
              </AdminTableRow>
            );
          })}
        </AdminTableBody>
      </AdminTable>
    </div>
  );
}
