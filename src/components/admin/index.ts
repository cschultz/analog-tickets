/**
 * Admin Design System - Single Source of Truth
 * 
 * This file exports all admin UI components. Always import from here
 * instead of individual component files to ensure consistency.
 * 
 * RULES:
 * 1. NO ORANGE - orange-* classes are banned
 * 2. ONE FONT - Inter only (enforced by admin-theme)
 * 3. TOKENS ONLY - use semantic tokens, never hardcoded hex colors
 * 4. SHARED COMPONENTS - use these components, no page-level styling
 * 5. ADMIN PRIMITIVES ONLY - never import raw UI primitives in admin pages
 */

// ============ CORE LAYOUT ============
export { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from './AdminCard';
export { AdminPageHeader } from './AdminPageHeader';

// ============ ADMIN UI COMPONENTS ============
export {
  AdminButton,
  AdminInput,
  AdminSearchInput,
  AdminTabs,
  AdminTabsList,
  AdminTabsTrigger,
  AdminTabsContent,
  AdminBadge,
  AdminToolbar,
  AdminToolbarLeft,
  AdminToolbarRight,
  AdminTable,
  AdminTableHeader,
  AdminTableBody,
  AdminTableRow,
  AdminTableHead,
  AdminTableCell,
  AdminTableEmpty,
  AdminTableLoading,
  AdminEmptyState,
  AdminStatCard,
  AdminPagination,
} from './AdminUI';
export { AdminConfirmDialog } from './AdminConfirmDialog';
export { StatusPill, StatusDot, AdminStatusIndicator } from './StatusPill';
export { TagChip } from './TagChip';

// ============ FORM PRIMITIVES ============
export {
  AdminLabel,
  AdminTextarea,
  AdminCheckbox,
  AdminSwitch,
  AdminRadioGroup,
  AdminRadioGroupItem,
  AdminFormField,
} from './AdminFormPrimitives';

// ============ SELECT ============
export {
  AdminSelect,
  AdminSelectItem,
  AdminSelectGroup,
  AdminSelectLabel,
  AdminSelectSeparator,
} from './AdminSelect';

// ============ DIALOG ============
export {
  AdminDialog,
  AdminDialogTrigger,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminDialogDescription,
  AdminDialogBody,
  AdminDialogFooter,
  AdminConfirmDialogExpanded,
} from './AdminDialog';
export type { AdminConfirmIntent } from './AdminDialog';

// ============ TOOLTIP ============
export {
  AdminTooltipProvider,
  AdminTooltip,
  AdminInlineHelp,
} from './AdminTooltip';

// ============ COLLAPSIBLE ============
export {
  AdminCollapsible,
  AdminCollapsibleTrigger,
  AdminCollapsibleContent,
  AdminAccordionItem,
} from './AdminCollapsible';

// ============ SCROLL AREA ============
export { AdminScrollArea } from './AdminScrollArea';

// ============ SHEET ============
export {
  AdminSheet,
  AdminSheetPortal,
  AdminSheetOverlay,
  AdminSheetTrigger,
  AdminSheetClose,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetFooter,
  AdminSheetTitle,
  AdminSheetDescription,
} from './AdminSheet';

// ============ PRIMITIVES ============
export { 
  AdminAvatar, 
  ActivityTimestamp, 
  TypeIcon, 
  TypeLabel, 
  StatusDot as PrimitiveStatusDot, 
  QuickAction, 
  StatValue,
  getTypeColor 
} from './AdminPrimitives';

// ============ COLOR UTILITIES ============
export {
  colorToIntent,
  getIntentFromColor,
  intentBgClasses,
  intentBgMutedClasses,
  getBgClassFromColor,
  intentBorderClasses,
  getBorderClassFromColor,
  intentTextClasses,
  getTextClassFromColor,
  entityTypeTextClasses,
  getEntityTypeTextClass,
} from './AdminColors';
export type { AdminIntent, EntityType as AdminEntityType } from './AdminColors';

// ============ DATA DISPLAY ============
export { InlineEdit } from './InlineEdit';
export { PersonAvatar, PersonAvatarGroup, PersonBadge } from './PersonAvatar';
export { OwnerPicker, OwnerDisplay } from './OwnerPicker';
export { EmailAliasManager } from './EmailAliasManager';

// ============ SPECIALIZED ============
export { AdminNotifications } from './AdminNotifications';
export { CommandPalette } from './CommandPalette';
export { DatabaseView } from './DatabaseView';
export { MobileTabs } from './MobileTabs';
export { AdminMobileNav } from './AdminMobileNav';
export { default as PreviewTokenManager } from './PreviewTokenManager';
export { RecordPage } from './RecordPage';
export { default as SalesPacingAnalysis } from './SalesPacingAnalysis';
export { QuickActionsFAB } from './QuickActionsFAB';
export { AnimatedStatCard } from './AnimatedStatCard';
export { ActivityFeed } from './ActivityFeed';
export { DashboardMetrics } from './DashboardMetrics';
export { CSVExport } from './CSVExport';

// ============ OVERLAY / MENU ============
export { 
  AdminOverlay, 
  AdminMenu, 
  AdminMenuSeparator, 
  AdminMenuLabel, 
  AdminDropdown 
} from './AdminOverlay';
export type { AdminMenuItem, AdminMenuProps, AdminOverlayProps, AdminDropdownProps } from './AdminOverlay';
export { AdminActionMenu, createActionItem } from './AdminActionMenu';
export type { AdminActionMenuProps } from './AdminActionMenu';

// ============ EMAIL PREVIEWS ============
export { EmailPreviewModal } from './EmailPreviewModal';
export { DripEmailPreviewModal } from './DripEmailPreviewModal';
export { EmailTemplateConfigManager } from './EmailTemplateConfigManager';
// Admin primitives barrel export

// ============ ENHANCED TABLE FEATURES ============
export { EnhancedTable } from './EnhancedTable';
export type { ColumnDef } from './EnhancedTable';
export { AutoSaveForm, useAutoSaveForm } from './AutoSaveForm';
export { BulkActionBar, commonBulkActions } from './BulkActionBar';
export { RealtimeStatusIndicator, LiveUpdatePulse } from './RealtimeStatusIndicator';

// ============ ERROR HANDLING ============
export { AdminErrorBoundary, withAdminErrorBoundary } from './AdminErrorBoundary';
