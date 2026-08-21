#!/bin/bash
#
# Admin UI Lint Script
# 
# This script checks for violations of the Admin UI design system rules.
# It prevents regression by catching legacy patterns before they merge.
#
# Run: ./scripts/lint-admin-ui.sh
# Exit code 0 = pass, 1 = violations found
#
# Rules enforced:
# IMPORT RULES (1-25): Block legacy shadcn imports
# STYLE RULES (26-40): Block non-admin color/style classes
#

set -e

# Admin paths to check
ADMIN_PATHS=(
  "src/modules/admin/pages"
  "src/components/admin"
  "src/layouts/AdminLayout.tsx"
)

# Additional admin components that should follow the rules
ADMIN_COMPONENTS=(
  "src/components/EventManager.tsx"
  "src/components/TicketManagement.tsx"
  "src/components/SalesReport.tsx"
  "src/components/BulkPaymentReminders.tsx"
  "src/components/CleanupOldRegistrations.tsx"
  "src/components/VerifyPendingPayments.tsx"
  "src/components/AccommodationInventoryManager.tsx"
  "src/components/EventGuestList.tsx"
  "src/components/BulkEmailAuditLog.tsx"
  "src/components/IndividualEmailComposer.tsx"
  "src/components/artists"
  "src/components/contracts"
  "src/components/production"
  "src/components/email"
)

VIOLATIONS=0

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              🔍 Admin UI Lint Check                          ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Enforcing Admin Style Guide compliance                      ║"
echo "║  See: docs/ADMIN_UI_RULES.md                                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Helper function to check a pattern across admin paths
check_pattern() {
  local pattern="$1"
  local message="$2"
  local fix="$3"
  local found=0
  
  for path in "${ADMIN_PATHS[@]}" "${ADMIN_COMPONENTS[@]}"; do
    if [ -e "$path" ]; then
      local results=$(grep -rn --include="*.tsx" --include="*.ts" -E "$pattern" "$path" 2>/dev/null || true)
      if [ -n "$results" ]; then
        if [ $found -eq 0 ]; then
          echo "❌ VIOLATION: $message"
          if [ -n "$fix" ]; then
            echo "   Fix: $fix"
          fi
          echo "   Files affected:"
        fi
        echo "$results" | head -20 | while read -r line; do
          echo "   → $line"
        done
        found=1
      fi
    fi
  done
  
  if [ $found -eq 1 ]; then
    VIOLATIONS=$((VIOLATIONS + 1))
    echo ""
  fi
  
  return $found
}

# Helper function to check import patterns
check_import() {
  local component="$1"
  local import_path="$2"
  local admin_replacement="$3"
  local rule_num="$4"
  
  echo "┌─────────────────────────────────────────────────────────────┐"
  echo "│ Rule $rule_num: No legacy $component imports                         │"
  echo "└─────────────────────────────────────────────────────────────┘"
  
  local FOUND=0
  for path in "${ADMIN_PATHS[@]}" "${ADMIN_COMPONENTS[@]}"; do
    if [ -e "$path" ]; then
      results=$(grep -rn --include="*.tsx" --include="*.ts" "from \"@/components/ui/$import_path\"" "$path" 2>/dev/null || true)
      if [ -n "$results" ]; then
        if [ $FOUND -eq 0 ]; then
          echo "❌ VIOLATION: Legacy $component imports found"
          echo "   Use: import { $admin_replacement } from \"@/components/admin\""
          echo ""
          echo "   Files affected:"
        fi
        echo "$results" | while read -r line; do
          echo "   → $line"
        done
        FOUND=1
      fi
    fi
  done
  
  if [ $FOUND -eq 0 ]; then
    echo "✅ No legacy $component imports"
  else
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
  echo ""
}

# ============================================================
# IMPORT RULES (1-25)
# ============================================================

check_import "Button" "button" "AdminButton" "1 "
check_import "Card" "card" "AdminCard, AdminCardHeader, AdminCardContent" "2 "
check_import "Badge" "badge" "AdminBadge, StatusPill" "3 "
check_import "Tabs" "tabs" "AdminTabs, AdminTabsList, AdminTabsTrigger, AdminTabsContent" "4 "
check_import "Select" "select" "AdminSelect, AdminSelectItem" "5 "
check_import "Dialog" "dialog" "AdminDialog, AdminDialogContent, AdminDialogHeader" "6 "
check_import "Checkbox" "checkbox" "AdminCheckbox" "7 "
check_import "Switch" "switch" "AdminSwitch" "8 "
check_import "Textarea" "textarea" "AdminTextarea" "9 "
check_import "Label" "label" "AdminLabel" "10"
check_import "RadioGroup" "radio-group" "AdminRadioGroup, AdminRadioGroupItem" "11"
check_import "Tooltip" "tooltip" "AdminTooltip, AdminTooltipProvider" "12"
check_import "Collapsible" "collapsible" "AdminCollapsible, AdminCollapsibleTrigger" "13"
check_import "ScrollArea" "scroll-area" "AdminScrollArea" "14"
check_import "Popover" "popover" "AdminDropdown" "15"
check_import "Input" "input" "AdminInput" "16"
check_import "Table" "table" "AdminTable, EnhancedTable" "17"
check_import "Alert" "alert" "Custom admin-styled div" "18"
check_import "Skeleton" "skeleton" "Custom admin-styled div with animate-pulse" "19"
check_import "Sheet" "sheet" "AdminSheet, AdminSheetContent, AdminSheetHeader" "20"
check_import "Calendar" "calendar" "AdminCalendar" "21"
check_import "Command" "command" "AdminCommand (custom)" "22"
check_import "Progress" "progress" "Custom admin-styled div" "23"
check_import "Accordion" "accordion" "AdminCollapsible or custom" "24"
check_import "DropdownMenu" "dropdown-menu" "AdminDropdown, AdminMenu" "25"

# ============================================================
# STYLE RULES (26-40)
# ============================================================

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ Rule 26: No text-muted-foreground usage                     │"
echo "└─────────────────────────────────────────────────────────────┘"
check_pattern 'text-muted-foreground' \
  "text-muted-foreground found" \
  "Use text-[hsl(var(--admin-text-muted))]" || true
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ Rule 27: No hardcoded status colors                         │"
echo "└─────────────────────────────────────────────────────────────┘"
check_pattern '(bg-green-|bg-red-|bg-yellow-|bg-amber-|text-green-|text-red-|text-yellow-|text-amber-|border-green-|border-red-|border-yellow-|border-amber-)' \
  "Hardcoded status colors found" \
  "Use AdminBadge intent variants or admin tokens like bg-[hsl(var(--admin-success)/0.1)]" || true
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ Rule 28: No orange classes                                  │"
echo "└─────────────────────────────────────────────────────────────┘"
check_pattern '(bg-orange|text-orange|border-orange|ring-orange)' \
  "Orange classes found" \
  "Admin UI does not use orange. Use --admin-warning or other tokens." || true
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ Rule 29: No font-serif or font-display                      │"
echo "└─────────────────────────────────────────────────────────────┘"
check_pattern '(font-serif|font-display)' \
  "font-serif or font-display found" \
  "Admin uses Inter only. Remove custom font classes." || true
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ Rule 30: No bg-primary usage                                │"
echo "└─────────────────────────────────────────────────────────────┘"
check_pattern 'bg-primary[^-]|bg-primary"' \
  "bg-primary found (non-admin token)" \
  "Use bg-[hsl(var(--admin-accent))] or bg-[hsl(var(--admin-info))]" || true
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ Rule 31: No text-primary-foreground                         │"
echo "└─────────────────────────────────────────────────────────────┘"
check_pattern 'text-primary-foreground' \
  "text-primary-foreground found (non-admin token)" \
  "Use text-[hsl(var(--admin-accent-foreground))] or text-[hsl(var(--admin-text))]" || true
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ Rule 32: No bg-muted usage                                  │"
echo "└─────────────────────────────────────────────────────────────┘"
check_pattern 'bg-muted[^-]|bg-muted"' \
  "bg-muted found (non-admin token)" \
  "Use bg-[hsl(var(--admin-bg-muted))] or bg-[hsl(var(--admin-bg-subtle))]" || true
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ Rule 33: No bg-card usage                                   │"
echo "└─────────────────────────────────────────────────────────────┘"
check_pattern 'bg-card[^-]|bg-card"' \
  "bg-card found (non-admin token)" \
  "Use bg-[hsl(var(--admin-card))]" || true
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ Rule 34: No border-border usage                             │"
echo "└─────────────────────────────────────────────────────────────┘"
check_pattern 'border-border' \
  "border-border found (non-admin token)" \
  "Use border-[hsl(var(--admin-border))] or border-[hsl(var(--admin-border-subtle))]" || true
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ Rule 35: No bg-black/text-white direct usage                │"
echo "└─────────────────────────────────────────────────────────────┘"
check_pattern '(bg-black[^/]|bg-black"|text-white[^/]|text-white")' \
  "bg-black or text-white found" \
  "Use admin tokens like bg-[hsl(var(--admin-bg))] and text-[hsl(var(--admin-text))]" || true
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ Rule 36: No bg-gray-* classes                               │"
echo "└─────────────────────────────────────────────────────────────┘"
check_pattern 'bg-gray-[0-9]' \
  "bg-gray-* classes found" \
  "Use admin tokens like bg-[hsl(var(--admin-bg-muted))]" || true
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ Rule 37: No bg-slate-* classes                              │"
echo "└─────────────────────────────────────────────────────────────┘"
check_pattern 'bg-slate-[0-9]' \
  "bg-slate-* classes found" \
  "Use admin tokens like bg-[hsl(var(--admin-bg-muted))]" || true
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ Rule 38: No bg-blue-* classes                               │"
echo "└─────────────────────────────────────────────────────────────┘"
check_pattern 'bg-blue-[0-9]' \
  "bg-blue-* classes found" \
  "Use admin tokens like bg-[hsl(var(--admin-info)/0.1)]" || true
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ Rule 39: No hover:bg-muted usage                            │"
echo "└─────────────────────────────────────────────────────────────┘"
check_pattern 'hover:bg-muted' \
  "hover:bg-muted found" \
  "Use hover:bg-[hsl(var(--admin-bg-muted))]" || true
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ Rule 40: No hardcoded hex colors                            │"
echo "└─────────────────────────────────────────────────────────────┘"

HEX_FOUND=0
for path in "${ADMIN_PATHS[@]}" "${ADMIN_COMPONENTS[@]}"; do
  if [ -e "$path" ]; then
    results=$(grep -rn --include="*.tsx" --include="*.ts" -E 'className.*#[0-9a-fA-F]{3,6}' "$path" 2>/dev/null | grep -v '//' || true)
    if [ -n "$results" ]; then
      if [ $HEX_FOUND -eq 0 ]; then
        echo "❌ VIOLATION: Hardcoded hex colors found"
        echo "   Fix: Use hsl(var(--admin-*)) tokens"
        echo ""
        echo "   Files affected:"
      fi
      echo "$results" | head -10 | while read -r line; do
        echo "   → $line"
      done
      HEX_FOUND=1
    fi
  fi
done

if [ $HEX_FOUND -eq 0 ]; then
  echo "✅ No hardcoded hex colors"
else
  VIOLATIONS=$((VIOLATIONS + 1))
fi
echo ""

# ============================================================
# SUMMARY
# ============================================================
echo "╔══════════════════════════════════════════════════════════════╗"
if [ $VIOLATIONS -gt 0 ]; then
  echo "║  ❌ FAILED: $VIOLATIONS rule violation(s) found                       ║"
  echo "╠══════════════════════════════════════════════════════════════╣"
  echo "║                                                              ║"
  echo "║  Please fix the violations above.                            ║"
  echo "║                                                              ║"
  echo "║  IMPORT FIXES:                                               ║"
  echo "║  • Button → AdminButton                                      ║"
  echo "║  • Card → AdminCard                                          ║"
  echo "║  • Badge → AdminBadge                                        ║"
  echo "║  • Tabs → AdminTabs                                          ║"
  echo "║  • Select → AdminSelect                                      ║"
  echo "║  • Dialog → AdminDialog                                      ║"
  echo "║  • Input → AdminInput                                        ║"
  echo "║  • Table → AdminTable / EnhancedTable                        ║"
  echo "║  • Sheet → AdminSheet                                        ║"
  echo "║  • All from \"@/components/admin\"                             ║"
  echo "║                                                              ║"
  echo "║  STYLE FIXES:                                                ║"
  echo "║  • text-muted-foreground → text-[hsl(var(--admin-text-muted))]║"
  echo "║  • bg-muted → bg-[hsl(var(--admin-bg-muted))]                ║"
  echo "║  • bg-primary → bg-[hsl(var(--admin-accent))]                ║"
  echo "║  • bg-green-* → bg-[hsl(var(--admin-success)/0.1)]           ║"
  echo "║  • bg-card → bg-[hsl(var(--admin-card))]                     ║"
  echo "║  • border-border → border-[hsl(var(--admin-border))]         ║"
  echo "║                                                              ║"
  echo "║  See: docs/ADMIN_UI_RULES.md                                 ║"
  echo "║  Reference: /admin/style-guide                               ║"
  echo "║                                                              ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  exit 1
else
  echo "║  ✅ PASSED: All 40 admin UI rules satisfied                  ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  exit 0
fi
