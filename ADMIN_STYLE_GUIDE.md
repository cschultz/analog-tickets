# Admin Style Guide - MANDATORY

> **This file is referenced by AI and enforced by lint rules. All admin UI MUST follow these guidelines.**

## Directory Scope

These rules apply to ALL files in:
- `src/pages/admin/**`
- `src/components/admin/**`
- `src/components/social/**`
- Any component imported by admin pages

## Required Primitives

### ❌ NEVER use directly in admin:
```tsx
// RAW HTML ELEMENTS
<label>           // Use <AdminLabel>
<button>          // Use <AdminButton>
<input>           // Use <AdminInput>
<textarea>        // Use <AdminTextarea>
<select>          // Use <AdminSelect>

// SHADCN PRIMITIVES (use Admin wrappers instead)
<Dialog>          // Use <AdminDialog>
<DialogContent>   // Use <AdminDialogContent>
<Badge>           // Use <AdminBadge>
<Card>            // Use <AdminCard>
<Tabs>            // Use <AdminTabs>
<Table>           // Use <AdminTable>

// DIRECT COLORS (use semantic tokens)
text-white        // Use text-[hsl(var(--admin-text))] or semantic
text-black        // Exception: photo overlays only
bg-red-*          // Use bg-[hsl(var(--admin-error))]
bg-green-*        // Use bg-[hsl(var(--admin-success))]
text-red-*        // Use text-[hsl(var(--admin-error))]
text-green-*      // Use text-[hsl(var(--admin-success))]
```

### ✅ ALWAYS use in admin:
```tsx
// LAYOUT
<AdminCard>, <AdminCardHeader>, <AdminCardContent>, <AdminCardTitle>

// FORMS
<AdminLabel required>, <AdminInput>, <AdminTextarea>, <AdminSelect>
<AdminCheckbox>, <AdminSwitch>, <AdminRadioGroup>
<AdminFormField> // convenience wrapper

// BUTTONS
<AdminButton variant="admin|adminOutline|adminGhost">

// FEEDBACK
<AdminBadge intent="success|warning|danger|info|neutral">
<AdminEmptyState>

// DIALOGS
<AdminDialog>, <AdminDialogContent>, <AdminDialogHeader>, <AdminDialogTitle>

// DATA
<AdminTable>, <AdminTableHeader>, <AdminTableRow>, <AdminTableCell>
<AdminTabs>, <AdminTabsList>, <AdminTabsTrigger>, <AdminTabsContent>

// COLORS (semantic tokens only)
text-[hsl(var(--admin-text))]
text-[hsl(var(--admin-text-muted))]
text-[hsl(var(--admin-text-subtle))]
bg-[hsl(var(--admin-surface))]
bg-[hsl(var(--admin-hover))]
border-[hsl(var(--admin-border))]
text-[hsl(var(--admin-error))]
text-[hsl(var(--admin-success))]
text-[hsl(var(--admin-warning))]
bg-[hsl(var(--admin-accent))]
```

## Exceptions

1. **Photo overlays** - `text-white` and `bg-black/60` are allowed for legibility on images
2. **Third-party components** - When wrapping external libraries, document the exception

## Import Pattern

Always import from the barrel:
```tsx
import { 
  AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle,
  AdminButton, AdminInput, AdminLabel, AdminBadge 
} from "@/components/admin";

import { 
  AdminDialog, AdminDialogContent, AdminDialogHeader, AdminDialogTitle 
} from "@/components/admin/AdminDialog";
```

## ⚠️ Primitive Architecture (CRITICAL)

Base shadcn primitives in `src/components/ui/` (dialog.tsx, sheet.tsx, drawer.tsx, alert-dialog.tsx) use **neutral Tailwind tokens** (`bg-background`, `text-foreground`, `border-border`). They must NEVER contain:
- `admin-theme` or `font-admin` classes
- `--admin-*` CSS variable references
- Any admin-specific styling

**Why:** These base primitives are shared by the public Analog site AND the admin backend. Admin styling is applied exclusively through the Admin wrapper components (`AdminDialog`, `AdminSheet`, etc.) which add `admin-theme` and `--admin-*` tokens themselves.

**Rule:** When building admin features, always use `AdminDialog`/`AdminSheet`/etc. Never import directly from `@/components/ui/dialog` or `@/components/ui/sheet` in admin code.

## Validation

Run `npm run lint:admin` to check for violations before committing.
