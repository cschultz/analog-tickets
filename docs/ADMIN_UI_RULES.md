# Admin UI Acceptance Checklist

This document defines the mandatory rules for all admin UI development. All new admin work must pass this checklist before merge.

## 🚫 Non-Negotiables

| Rule | Description |
|------|-------------|
| **NO ORANGE** | Zero usage of `bg-orange-*`, `text-orange-*`, `border-orange-*`, `ring-orange-*` classes |
| **TOKENS ONLY** | Use `hsl(var(--admin-*))` tokens. No hardcoded hex colors (`#xxx`) |
| **ONE FONT** | Inter only in admin. No `font-serif` or `font-display` |
| **SHARED COMPONENTS** | Import from `@/components/admin`, not custom implementations |

## ✅ Acceptance Checklist

Before submitting admin UI changes, verify:

### 1. Component Usage
- [ ] Uses `AdminButton` (not custom Button styling)
- [ ] Uses `AdminTabs` / `AdminTabsList` / `AdminTabsTrigger`
- [ ] Uses `AdminTable` / `AdminTableHeader` / `AdminTableBody` / `AdminTableCell`
- [ ] Uses `AdminInput` / `AdminSearchInput`
- [ ] Uses `AdminBadge` or `StatusPill` for status indicators
- [ ] Uses `AdminToolbar` for search/filter/action layouts
- [ ] Uses `AdminCard` for content containers
- [ ] Uses `AdminConfirmDialog` for destructive actions
- [ ] Uses `AdminDropdown` / `AdminMenu` / `AdminOverlay` for popups/dropdowns

### 1b. Form Primitives (NEW)
- [ ] Uses `AdminLabel` (not Label from @/components/ui)
- [ ] Uses `AdminTextarea` (not Textarea from @/components/ui)
- [ ] Uses `AdminCheckbox` (not Checkbox from @/components/ui)
- [ ] Uses `AdminSwitch` (not Switch from @/components/ui)
- [ ] Uses `AdminRadioGroup` / `AdminRadioGroupItem` (not RadioGroup from @/components/ui)
- [ ] Uses `AdminSelect` / `AdminSelectItem` (not Select from @/components/ui)
- [ ] Uses `AdminDialog` / `AdminDialogContent` (not Dialog from @/components/ui)
- [ ] Uses `AdminTooltip` / `AdminTooltipProvider` (not Tooltip from @/components/ui)
- [ ] Uses `AdminCollapsible` / `AdminAccordionItem` (not Collapsible from @/components/ui)
- [ ] Uses `AdminScrollArea` (not ScrollArea from @/components/ui)

### 2. Design Tokens
- [ ] All colors use `hsl(var(--admin-*))` tokens
- [ ] No hardcoded hex colors (`#fff`, `#000`, `#3b82f6`, etc.)
- [ ] No Tailwind color classes with specific shades (`blue-500`, `gray-200`, etc.)
- [ ] Semantic tokens used (`admin-success`, `admin-warning`, `admin-error`, `admin-info`)

### 3. States & Feedback
- [ ] Empty states use `AdminEmptyState` or `AdminTableEmpty`
- [ ] Loading states use `AdminTableLoading` or skeleton patterns
- [ ] Error states are properly styled with `admin-error` tokens

### 4. Action Hierarchy
- [ ] Safe actions (view/export/email): `adminOutline` or `adminGhost` variant
- [ ] Reversible actions (transfer): `adminOutline` with explanation
- [ ] Destructive actions (refund/archive/delete): `adminDestructive` variant
- [ ] Destructive actions require `AdminConfirmDialog` confirmation

### 5. Layout & Consistency
- [ ] Toolbar pattern: left = search/filters, right = actions
- [ ] Consistent spacing using standard gaps (`gap-2`, `gap-4`, `gap-6`)
- [ ] View toggles persist selection (use `useEntityViewMode` hook)
- [ ] Event scope is clearly labeled where applicable

### 6. Typography
- [ ] Headers use consistent sizing (`text-xl`, `text-lg`, `text-base`)
- [ ] Body text uses `text-sm` or `text-xs`
- [ ] Muted text uses `text-[hsl(var(--admin-text-muted))]`

### 7. Status Display in Popups/Overlays
- [ ] **NO pill-style** status labels inside popups, overlays, or menus
- [ ] Uses `AdminStatusIndicator` for status in popup contexts (text + subtle dot)
- [ ] Status display is **informational**, not promotional (no accent colors)
- [ ] Published/Draft/Archived statuses feel neutral and factual
- [ ] `StatusPill` reserved for tables/cards only, not popups

### 8. Popups & Overlays Acceptance Criteria
All admin popups, dropdowns, and floating menus must meet these criteria:

| Criteria | Requirement |
|----------|-------------|
| **Component** | Uses `AdminOverlay` / `AdminMenu` / `AdminDropdown` — no custom implementations |
| **Colors** | No new colors introduced. Uses only `--admin-*` tokens |
| **Status badges** | No pill-style status. Uses `AdminStatusIndicator` for status display |
| **Typography** | Matches Admin Style Guide (Inter, text-sm, proper token usage) |
| **Consistency** | Visual appearance identical across all admin sections |
| **Background** | White (`admin-surface`), not transparent or colored |
| **Border** | 1px neutral gray (`admin-border-strong`) |
| **Shadow** | Subtle, structural only — no glow, no heavy elevation |
| **Keyboard** | Supports keyboard navigation (Arrow keys, Enter, Escape) |
| **Dismiss** | Click outside or Escape key closes the popup |

**If any popup does not meet these criteria, it must be refactored before the task is considered complete.**

## 📦 Component Import Pattern

```tsx
// ✅ CORRECT - Import from central admin index
import { 
  AdminButton,
  AdminCard,
  AdminTable,
  AdminBadge,
  AdminConfirmDialog,
  AdminDropdown,
  AdminMenu,
  AdminOverlay
} from "@/components/admin";

// ❌ WRONG - Don't import from individual files
import { AdminButton } from "@/components/admin/AdminUI";
```

## 🎨 Token Usage Examples

```tsx
// ✅ CORRECT - Semantic tokens
<div className="bg-[hsl(var(--admin-surface))]">
<span className="text-[hsl(var(--admin-text-muted))]">
<div className="border-[hsl(var(--admin-border))]">

// ❌ WRONG - Hardcoded values
<div className="bg-white">
<span className="text-gray-500">
<div className="border-#e5e7eb">
```

## 🧭 Navigation Patterns

Admin pages use a consistent two-level navigation pattern:

### Level 1: Section Tabs (MobileTabs)
For switching between major sections within a page (e.g., Vendors, Contracts, Email tabs on the Vendors page).

| Platform | Component | Behavior |
|----------|-----------|----------|
| **Mobile** | Dropdown selector | Single dropdown showing current section with chevron |
| **Desktop** | Horizontal pills | Scrollable row of pill-shaped buttons |

```tsx
// ✅ CORRECT - Use MobileTabs for section navigation
import { MobileTabs } from "@/components/admin";

<MobileTabs
  tabs={[
    { value: "vendors", label: "Vendors", icon: Building2 },
    { value: "contracts", label: "Contracts", icon: FileText },
    { value: "email", label: "Send Emails", icon: Mail },
  ]}
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>
```

### Level 2: View Tabs (DatabaseView)
For switching between views of the same data (e.g., Table vs Board view).

| Platform | Component | Behavior |
|----------|-----------|----------|
| **Mobile** | Dropdown selector | Compact view selector |
| **Desktop** | Inline pill buttons | Subtle, within toolbar row |

```tsx
// ✅ CORRECT - Use DatabaseView for view toggles
import { DatabaseView } from "@/components/admin";

const VIEW_TABS = [
  { id: "table", label: "Table", type: "table" },
  { id: "board", label: "Board", type: "board" },
];

<DatabaseView
  tabs={VIEW_TABS}
  activeTab={viewMode}
  onTabChange={setViewMode}
  onNewRecord={() => setIsAddDialogOpen(true)}
>
  {/* Content */}
</DatabaseView>
```

### Navigation Styling Rules

- [ ] Active tabs use `admin-surface` with border and shadow
- [ ] Inactive tabs use `admin-text-secondary`, hover to `admin-text`
- [ ] Icons are 4x4 (`h-4 w-4`) and use `admin-text-muted`
- [ ] Mobile dropdowns use `admin-surface` background, `admin-border`
- [ ] NO colored/accented tab backgrounds
- [ ] NO pill-style badges inside navigation

### Production Category Pages

All production category pages (Artists, Vendors, Artisans, Partners, Volunteers) should follow this structure:

1. **AdminPageHeader** - Page title with icon and subtitle
2. **MobileTabs** - Section navigation (main entity, contracts, email, etc.)
3. **DatabaseView** - View toggle (table/board) with search, filters, bulk actions
4. **Content** - Table, Kanban board, or specialized views

This ensures consistency across all production management interfaces.

## 🔴 Destructive Action Pattern

```tsx
// ✅ CORRECT - Destructive action with confirmation
<AdminButton 
  variant="adminDestructive" 
  onClick={() => setShowConfirm(true)}
>
  <Trash2 className="h-4 w-4 mr-1" /> Delete
</AdminButton>

<AdminConfirmDialog
  open={showConfirm}
  onOpenChange={setShowConfirm}
  title="Delete Item"
  description="This will permanently delete the item."
  consequences={[
    "Remove all associated data",
    "This action cannot be undone",
  ]}
  scope="This affects the selected item only"
  actionType="destructive"
  actionLabel="Delete"
  icon="delete"
  onConfirm={handleDelete}
/>

// ❌ WRONG - Direct deletion without confirmation
<Button variant="destructive" onClick={handleDelete}>
  Delete
</Button>
```

## 📱 Mobile Guidelines (Admin Only)

This section defines mobile behavior for admin interfaces. Public website/front-end mobile styling is NOT affected by these rules.

### Philosophy

Admin mobile is optimized for:
- ✅ Checking status
- ✅ Light review
- ✅ Urgent actions

Admin mobile is NOT designed for:
- ❌ Heavy configuration
- ❌ Complex data entry
- ❌ Multi-step workflows

### Mobile Navigation

| Element | Behavior |
|---------|----------|
| **Persistent sidebar** | Hidden on mobile |
| **Menu trigger** | Single "Menu" button (top-left hamburger icon) |
| **Menu panel** | Full-height slide-over using `Sheet` component |
| **Menu style** | Flat, text-only labels; same neutral style as desktop |
| **Status indicators** | NO pills, NO colored badges in navigation |
| **Active state** | Subtle background highlight only |
| **Event selector** | Appears at TOP of mobile menu, visually quiet |

### Mobile Layout Rules

- [ ] One-column layout only
- [ ] No side-by-side panels
- [ ] No horizontal scrolling for core content
- [ ] Padding/spacing scale down but preserve visual hierarchy
- [ ] Use `AdminMobileNav` component for navigation

### Mobile Table Behavior

| Default Behavior | Mobile Adaptation |
|------------------|-------------------|
| Full table view | Collapses to stacked rows or simplified list |
| All columns visible | Non-essential columns hidden by default |
| Row hover actions | Row tap opens detail view |
| Bulk selection toolbar | Hidden or moved to overflow menu |

Use `MobileTabs` for tab-based navigation that converts to dropdown on mobile.

### Mobile Actions

| Action Type | Mobile Behavior |
|-------------|-----------------|
| **Primary** (Add, Create, Send) | Remains visible but singular; neutral styling (not orange) |
| **Secondary** | Moves to overflow menu (three-dot icon) |
| **Destructive** (Refund, Archive, Delete) | Requires confirmation; never placed near primary actions; may be disabled if unsafe |

### Mobile Email / Composer Flows

For focused, multi-step workflows like email composition on mobile:

| Step | Behavior |
|------|----------|
| **Recipients** | Compact summary bar at top (e.g., "Emailing 10 artists"); tap expands full artist selector sheet |
| **Settings** | Collapsed by default; groups template, CC, reply-to, merge fields in one section |
| **Composer** | Full-width, minimal chrome; subject + message fields are the visual center |
| **Actions** | Single primary CTA at bottom; navigation + overflow menu are secondary and subtle |

**Key Principles:**
- [ ] Editor is the dominant element on screen
- [ ] Settings do NOT compete visually with writing
- [ ] Only ONE primary action visible at a time
- [ ] Progress indicators are text-based, not colored bars
- [ ] No floating colored bars or pills

### Mobile Overlays & Modals

- [ ] All modals, dropdowns, and menus use `Sheet` component as bottom sheet
- [ ] Dismissible via swipe or clear close action
- [ ] NO floating popovers on mobile
- [ ] Full-height panels for complex content

### Mobile Status & Badges

- [ ] Use text + `StatusDot` only
- [ ] NO pill-style badges (`StatusPill` is desktop-only)
- [ ] NO color-heavy indicators

### Typography & Touch Targets

- [ ] Minimum touch target size: 44px
- [ ] Same typography system as desktop (Inter)
- [ ] Avoid dense text blocks
- [ ] Increase spacing between interactive elements

### Mobile Acceptance Criteria

Before submitting admin UI changes, verify on mobile:

- [ ] Admin is usable for review and light actions
- [ ] No hover-dependent patterns appear
- [ ] No tiny click targets (< 44px)
- [ ] Navigation uses mobile menu pattern (`AdminMobileNav`)
- [ ] No colored pills, cards, or legacy patterns
- [ ] Tables collapse appropriately
- [ ] Public website/front-end mobile styling unchanged

### Mobile Component Usage

```tsx
// ✅ CORRECT - Use mobile-aware components
import { AdminMobileNav } from "@/components/admin";
import { MobileTabs } from "@/components/admin";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

// Mobile navigation pattern
<Sheet>
  <SheetTrigger asChild>
    <AdminButton variant="adminGhost" size="icon" className="md:hidden">
      <Menu className="h-5 w-5" />
    </AdminButton>
  </SheetTrigger>
  <SheetContent side="left" className="w-[280px] p-0">
    <AdminMobileNav onNavigate={() => setOpen(false)} />
  </SheetContent>
</Sheet>

// ❌ WRONG - Desktop sidebar visible on mobile
<Sidebar className="flex"> {/* Will show on all screens */}
```

---

## 📖 Reference

- **Style Guide**: `/admin/style-guide` - Interactive component showcase
- **Admin Components**: `src/components/admin/index.ts` - All exports
- **Design Tokens**: `src/index.css` - CSS variable definitions
- **Mobile Components**: `src/components/admin/AdminMobileNav.tsx`

## 🤖 Automated Checks (Lint Gate)

The Admin UI lint script prevents regressions by blocking legacy patterns.

### Running Locally

```bash
# Make executable (first time only)
chmod +x scripts/lint-admin-ui.sh

# Run the lint check
./scripts/lint-admin-ui.sh
```

### Rules Enforced

| Rule | Pattern Blocked | Replacement |
|------|-----------------|-------------|
| 1 | `from "@/components/ui/button"` | `import { AdminButton } from "@/components/admin"` |
| 2 | `from "@/components/ui/card"` | `import { AdminCard, ... } from "@/components/admin"` |
| 3 | `from "@/components/ui/badge"` | `import { AdminBadge, StatusPill } from "@/components/admin"` |
| 4 | `from "@/components/ui/tabs"` | `import { AdminTabs, ... } from "@/components/admin"` |
| 5 | `text-muted-foreground` | `text-[hsl(var(--admin-text-muted))]` |
| 6 | `bg-green-*`, `bg-red-*`, `bg-yellow-*`, `bg-amber-*` | `AdminBadge` with intent or admin tokens |
| 7 | `bg-orange-*`, `text-orange-*` | Not used in admin |
| 8 | Hardcoded hex (`#fff`, `#3b82f6`) | `hsl(var(--admin-*))` tokens |
| 9 | `font-serif`, `font-display` | Inter only (default) |
| 10 | `from "@/components/ui/select"` | `import { AdminSelect, AdminSelectItem } from "@/components/admin"` |
| 11 | `from "@/components/ui/dialog"` | `import { AdminDialog, AdminDialogContent } from "@/components/admin"` |
| 12 | `from "@/components/ui/checkbox"` | `import { AdminCheckbox } from "@/components/admin"` |
| 13 | `from "@/components/ui/switch"` | `import { AdminSwitch } from "@/components/admin"` |
| 14 | `from "@/components/ui/textarea"` | `import { AdminTextarea } from "@/components/admin"` |
| 15 | `from "@/components/ui/label"` | `import { AdminLabel } from "@/components/admin"` |
| 16 | `from "@/components/ui/radio-group"` | `import { AdminRadioGroup, AdminRadioGroupItem } from "@/components/admin"` |
| 17 | `from "@/components/ui/tooltip"` | `import { AdminTooltip, AdminTooltipProvider } from "@/components/admin"` |
| 18 | `from "@/components/ui/collapsible"` | `import { AdminCollapsible, ... } from "@/components/admin"` |
| 19 | `from "@/components/ui/scroll-area"` | `import { AdminScrollArea } from "@/components/admin"` |
| 20 | `from "@/components/ui/popover"` | `import { AdminDropdown } from "@/components/admin"` |

### CI Integration

The lint runs automatically on every PR and push that touches admin files:
- `.github/workflows/admin-ui-lint.yml`

### Example Failure Output

```
╔══════════════════════════════════════════════════════════════╗
║              🔍 Admin UI Lint Check                          ║
╠══════════════════════════════════════════════════════════════╣
║  Enforcing Admin Style Guide compliance                      ║
╚══════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────┐
│ Rule 1: No legacy Button imports                            │
└─────────────────────────────────────────────────────────────┘
❌ VIOLATION: Legacy Button imports found
   Use: import { AdminButton } from "@/components/admin"

   Files affected:
   → src/pages/admin/Example.tsx:5:import { Button } from "@/components/ui/button"

┌─────────────────────────────────────────────────────────────┐
│ Rule 5: No text-muted-foreground usage                      │
└─────────────────────────────────────────────────────────────┘
❌ VIOLATION: text-muted-foreground found
   Use: text-[hsl(var(--admin-text-muted))]

   Files affected:
   → src/pages/admin/Example.tsx:42:  <span className="text-muted-foreground">

╔══════════════════════════════════════════════════════════════╗
║  ❌ FAILED: 2 rule violation(s) found                        ║
╠══════════════════════════════════════════════════════════════╣
║  Please fix the violations above.                            ║
╚══════════════════════════════════════════════════════════════╝
```

### Example Success Output

```
╔══════════════════════════════════════════════════════════════╗
║              🔍 Admin UI Lint Check                          ║
╚══════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────┐
│ Rule 1: No legacy Button imports                            │
└─────────────────────────────────────────────────────────────┘
✅ No legacy Button imports

... (all rules pass) ...

╔══════════════════════════════════════════════════════════════╗
║  ✅ PASSED: All 9 admin UI rules satisfied                   ║
╚══════════════════════════════════════════════════════════════╝
```
