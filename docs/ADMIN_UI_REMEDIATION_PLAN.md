# Admin UI Compliance Remediation Plan

> **Status**: ✅ COMPLETE | **Completed**: January 2026
> **Reference**: `docs/ADMIN_UI_RULES.md` | **Lint Script**: `scripts/lint-admin-ui.sh`

---

## Phase 1: High-Traffic Pages
**Priority**: Critical | **Estimated Files**: 8

### Scope
Core admin pages with highest daily usage that establish visual expectations.

### Files Included
| File | Issues |
|------|--------|
| `src/pages/admin/Registrations.tsx` | Raw Button, raw Badge, legacy colors, Popover pattern |
| `src/pages/admin/Dashboard.tsx` | Raw Button, text-muted-foreground |
| `src/pages/admin/Sales.tsx` | Raw Button import |
| `src/pages/admin/Customers.tsx` | Raw Button, text-muted-foreground |
| `src/pages/admin/CustomerDetail.tsx` | Raw Button, raw Badge |
| `src/pages/admin/Tickets.tsx` | Raw Button, legacy colors |
| `src/pages/admin/Inventory.tsx` | Raw Button, raw Tabs |
| `src/pages/admin/Upgrades.tsx` | Raw Button, legacy bg-green/yellow/red |

### Mechanical Transformations

#### 1.1 Replace Button Imports
```diff
- import { Button } from "@/components/ui/button";
+ import { AdminButton } from "@/components/admin/AdminUI";
```

**Variant Mapping:**
| Old Pattern | New Pattern |
|-------------|-------------|
| `<Button>` | `<AdminButton>` |
| `<Button variant="outline">` | `<AdminButton variant="outline">` |
| `<Button variant="destructive">` | `<AdminButton variant="destructive">` |
| `<Button variant="ghost">` | `<AdminButton variant="ghost">` |
| `<Button size="sm">` | `<AdminButton size="sm">` |
| `<Button size="icon">` | `<AdminButton size="icon">` |

#### 1.2 Replace Legacy Color Classes on Badges
```diff
- <Badge className="bg-green-100 text-green-800">Active</Badge>
+ <AdminBadge intent="success">Active</AdminBadge>

- <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
+ <AdminBadge intent="warning">Pending</AdminBadge>

- <Badge className="bg-red-100 text-red-800">Failed</Badge>
+ <AdminBadge intent="danger">Failed</AdminBadge>

- <Badge className="bg-blue-100 text-blue-800">Info</Badge>
+ <AdminBadge intent="info">Info</AdminBadge>

- <Badge variant="outline">Default</Badge>
+ <AdminBadge intent="neutral">Default</AdminBadge>
```

#### 1.3 Replace Popover with Sheet/AdminOverlay (Registrations.tsx)
```diff
- <Popover>
-   <PopoverTrigger asChild>
-     <Button variant="outline">Pick Date</Button>
-   </PopoverTrigger>
-   <PopoverContent>
-     <Calendar ... />
-   </PopoverContent>
- </Popover>
+ <Sheet>
+   <SheetTrigger asChild>
+     <AdminButton variant="outline">Pick Date</AdminButton>
+   </SheetTrigger>
+   <SheetContent>
+     <Calendar ... />
+   </SheetContent>
+ </Sheet>
```

#### 1.4 Replace Inline Status Colors
```diff
- <span className="text-green-600">Confirmed</span>
+ <span className="text-[hsl(var(--admin-success))]">Confirmed</span>

- <span className="text-red-600">Error</span>
+ <span className="text-[hsl(var(--admin-danger))]">Error</span>

- <span className="text-yellow-600">Warning</span>
+ <span className="text-[hsl(var(--admin-warning))]">Warning</span>
```

### Acceptance Criteria (Phase 1)
```bash
# Zero raw Button imports in Phase 1 files
grep -rn "from \"@/components/ui/button\"" src/pages/admin/{Registrations,Dashboard,Sales,Customers,CustomerDetail,Tickets,Inventory,Upgrades}.tsx
# Expected: 0 matches

# Zero legacy bg-color classes
grep -rn "bg-green-\|bg-red-\|bg-yellow-\|bg-amber-\|bg-blue-" src/pages/admin/{Registrations,Dashboard,Sales,Customers,CustomerDetail,Tickets,Inventory,Upgrades}.tsx
# Expected: 0 matches

# Zero Popover imports in Registrations
grep -n "from \"@/components/ui/popover\"" src/pages/admin/Registrations.tsx
# Expected: 0 matches
```

### Testing Checklist (Phase 1)
- [ ] **Desktop**: Registrations page loads, filters work, bulk actions function
- [ ] **Desktop**: Dashboard stats display correctly, charts render
- [ ] **Desktop**: Sales page shows reports, payment status badges correct
- [ ] **Desktop**: Customer list pagination works, detail view loads
- [ ] **Desktop**: Tickets page CRUD operations work
- [ ] **Desktop**: Inventory counts update correctly
- [ ] **Desktop**: Upgrades page offer creation works
- [ ] **Mobile**: All above pages render without horizontal scroll
- [ ] **Mobile**: Buttons are tappable (min 44px touch target)
- [ ] **Mobile**: Date pickers open in Sheet, not Popover
- [ ] **Visual**: No orange/legacy colors visible
- [ ] **Visual**: All badges use AdminBadge styling

---

## Phase 2: Production Pages
**Priority**: High | **Estimated Files**: 11

### Scope
Production management, artist relations, and pipeline pages.

### Files Included
| File | Issues |
|------|--------|
| `src/pages/admin/Pipeline.tsx` | Raw Card, raw Tabs, text-muted-foreground |
| `src/pages/admin/Artists.tsx` | Raw Button, raw Tabs |
| `src/pages/admin/Artisans.tsx` | Raw Card, text-muted-foreground |
| `src/pages/admin/Vendors.tsx` | Raw Button, Card, Tabs, legacy colors |
| `src/pages/admin/Partners.tsx` | Raw Tabs, text-muted-foreground |
| `src/pages/admin/WineCamp.tsx` | Raw Button, legacy bg-* classes |
| `src/pages/admin/VolunteerInterests.tsx` | Raw Card, legacy colors |
| `src/pages/admin/ProductionVolunteers.tsx` | Raw Button |
| `src/pages/admin/Pacing.tsx` | Raw Card |
| `src/pages/admin/Events.tsx` | Raw Button |
| `src/pages/admin/GuestLists.tsx` | Raw Button |

### Mechanical Transformations

#### 2.1 Replace Card Imports
```diff
- import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
+ import { AdminCard, AdminCardHeader, AdminCardTitle, AdminCardContent } from "@/components/admin/AdminCard";
```

**Component Mapping:**
| Old | New |
|-----|-----|
| `<Card>` | `<AdminCard>` |
| `<CardHeader>` | `<AdminCardHeader>` |
| `<CardTitle>` | `<AdminCardTitle>` |
| `<CardDescription>` | `<AdminCardDescription>` |
| `<CardContent>` | `<AdminCardContent>` |
| `<CardFooter>` | `<AdminCardFooter>` |

#### 2.2 Replace Tabs Imports
```diff
- import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
+ import { AdminTabs, AdminTabsList, AdminTabsTrigger, AdminTabsContent } from "@/components/admin/AdminUI";
```

**Component Mapping:**
| Old | New |
|-----|-----|
| `<Tabs>` | `<AdminTabs>` |
| `<TabsList>` | `<AdminTabsList>` |
| `<TabsTrigger>` | `<AdminTabsTrigger>` |
| `<TabsContent>` | `<AdminTabsContent>` |

#### 2.3 Replace text-muted-foreground
```diff
- <p className="text-muted-foreground">Description text</p>
+ <p className="text-[hsl(var(--admin-text-muted))]">Description text</p>

- <span className="text-sm text-muted-foreground">Helper</span>
+ <span className="text-sm text-[hsl(var(--admin-text-muted))]">Helper</span>
```

### Acceptance Criteria (Phase 2)
```bash
# Zero raw Card imports
grep -rn "from \"@/components/ui/card\"" src/pages/admin/{Pipeline,Artisans,Vendors,VolunteerInterests,Pacing}.tsx
# Expected: 0 matches

# Zero raw Tabs imports
grep -rn "from \"@/components/ui/tabs\"" src/pages/admin/{Pipeline,Artists,Vendors,Partners}.tsx
# Expected: 0 matches

# Zero text-muted-foreground in Phase 2 files
grep -rn "text-muted-foreground" src/pages/admin/{Pipeline,Artisans,Vendors,Partners}.tsx
# Expected: 0 matches
```

### Testing Checklist (Phase 2)
- [ ] **Desktop**: Pipeline kanban drag-drop works, status updates persist
- [ ] **Desktop**: Artists page tabs switch correctly, email composer opens
- [ ] **Desktop**: Artisans cards display data, inline edit works
- [ ] **Desktop**: Vendors page filters work, all tabs accessible
- [ ] **Desktop**: Partners status updates, contracts link correctly
- [ ] **Desktop**: WineCamp stats cards render
- [ ] **Desktop**: Volunteer interests bulk actions work
- [ ] **Desktop**: Pacing charts render correctly
- [ ] **Mobile**: Cards stack vertically without overlap
- [ ] **Mobile**: Tabs are horizontally scrollable or use MobileTabs
- [ ] **Visual**: All cards use AdminCard border/shadow
- [ ] **Visual**: All muted text uses admin-text-muted token

---

## Phase 3: Support & Settings Pages
**Priority**: Medium | **Estimated Files**: 10

### Scope
Lower-traffic administrative, configuration, and support pages.

### Files Included
| File | Issues |
|------|--------|
| `src/pages/admin/Support.tsx` | Raw Button |
| `src/pages/admin/Settings.tsx` | Raw Button, raw Tabs |
| `src/pages/admin/Surveys.tsx` | Raw Tabs |
| `src/pages/admin/Emails.tsx` | Raw Tabs, raw Badge |
| `src/pages/admin/Inbox.tsx` | Raw Button, text-muted-foreground |
| `src/pages/admin/CustomOffers.tsx` | Raw Button, raw Badge |
| `src/pages/admin/Webhooks.tsx` | Raw Button, legacy colors |
| `src/pages/admin/SystemHealth.tsx` | Raw Tabs, legacy colors |
| `src/pages/admin/ChatLogs.tsx` | Raw Button |
| `src/pages/admin/Reminders.tsx` | Raw Button, raw Badge |

### Mechanical Transformations

#### 3.1 All Button → AdminButton (same as Phase 1)

#### 3.2 All Tabs → AdminTabs (same as Phase 2)

#### 3.3 All Badge → AdminBadge (same as Phase 1)

#### 3.4 StatusPill for Pipeline States
For consistent pipeline/status indicators:
```diff
- <Badge className="bg-green-100">confirmed</Badge>
+ <StatusPill status="confirmed" />

- <Badge className="bg-yellow-100">pending</Badge>
+ <StatusPill status="pending" />
```

### Acceptance Criteria (Phase 3)
```bash
# Zero raw Button imports
grep -rn "from \"@/components/ui/button\"" src/pages/admin/{Support,Settings,Surveys,Emails,Inbox,CustomOffers,Webhooks,SystemHealth,ChatLogs,Reminders}.tsx
# Expected: 0 matches

# Zero raw Tabs imports
grep -rn "from \"@/components/ui/tabs\"" src/pages/admin/{Settings,Surveys,Emails,SystemHealth}.tsx
# Expected: 0 matches

# Zero legacy colors
grep -rn "bg-green-\|bg-red-\|bg-yellow-" src/pages/admin/{Webhooks,SystemHealth}.tsx
# Expected: 0 matches
```

### Testing Checklist (Phase 3)
- [ ] **Desktop**: Support chat logs load, conversation view works
- [ ] **Desktop**: Settings tabs all accessible, forms save
- [ ] **Desktop**: Surveys CRUD operations work
- [ ] **Desktop**: Emails compose, send, logs display
- [ ] **Desktop**: Inbox messages load, reply works
- [ ] **Desktop**: Custom offers create/edit/send
- [ ] **Desktop**: Webhooks monitoring displays events
- [ ] **Desktop**: System health indicators accurate
- [ ] **Mobile**: Settings form inputs are full-width
- [ ] **Mobile**: All tabs accessible via scroll or MobileTabs
- [ ] **Visual**: Status indicators consistent with StatusPill

---

## Phase 4: Shared Components
**Priority**: Low (but enables future compliance) | **Estimated Files**: 15+

### Scope
Shared components used across multiple admin pages. Fixes here cascade to all consumers.

### Files Included
| File | Issues |
|------|--------|
| `src/layouts/AdminLayout.tsx` | Raw Badge, text-red-600 |
| `src/components/SalesReport.tsx` | Raw Badge |
| `src/components/EventManager.tsx` | Raw Button |
| `src/components/TicketManagement.tsx` | Raw Button, raw Badge |
| `src/components/BulkPaymentReminders.tsx` | Raw Button |
| `src/components/VerifyPendingPayments.tsx` | Raw Button |
| `src/components/CleanupOldRegistrations.tsx` | Raw Button |
| `src/components/EventRemindersManager.tsx` | Raw Badge with legacy colors |
| `src/components/contracts/ContractManager.tsx` | Raw Badge with legacy colors |
| `src/components/production/*.tsx` | Mixed patterns |
| `src/components/artists/*.tsx` | Some legacy patterns remain |
| `src/components/email/*.tsx` | Verify full compliance |

### Mechanical Transformations

#### 4.1 AdminLayout.tsx Fixes
```diff
- import { Badge } from "@/components/ui/badge";
+ import { AdminBadge } from "@/components/admin/AdminUI";

- <span className="text-red-600">Error</span>
+ <span className="text-[hsl(var(--admin-danger))]">Error</span>
```

#### 4.2 Icon Size Standardization
Establish consistent icon sizing:
```diff
# Navigation icons
- <Icon className="h-4 w-4" />  # inconsistent
+ <Icon className="h-5 w-5" />  # standard nav size

# Inline/button icons
- <Icon className="h-3 w-3" />  # too small
+ <Icon className="h-4 w-4" />  # standard inline size

# Large display icons
- <Icon className="h-6 w-6" />  # ok for cards
+ <Icon className="h-6 w-6" />  # keep as-is
```

**Icon Size Rules:**
| Context | Size |
|---------|------|
| Inside AdminButton | `h-4 w-4` |
| Navigation items | `h-5 w-5` |
| Card headers | `h-5 w-5` |
| Empty states | `h-12 w-12` or larger |
| Status indicators | `h-3 w-3` (StatusDot) |

#### 4.3 Component-Level Badge Cleanup
Each shared component using Badge must migrate:
```diff
// EventRemindersManager.tsx
- <Badge className="bg-green-100 text-green-700">Sent</Badge>
+ <AdminBadge intent="success" size="sm">Sent</AdminBadge>

// ContractManager.tsx  
- <Badge className="bg-yellow-100 text-yellow-800">Draft</Badge>
+ <AdminBadge intent="warning" size="sm">Draft</AdminBadge>
```

### Acceptance Criteria (Phase 4)
```bash
# Zero raw Badge imports in shared components
grep -rn "from \"@/components/ui/badge\"" src/components/{SalesReport,EventManager,TicketManagement,BulkPaymentReminders,EventRemindersManager}.tsx src/layouts/AdminLayout.tsx
# Expected: 0 matches

# Zero legacy colors in AdminLayout
grep -n "text-red-\|bg-red-\|text-green-\|bg-green-" src/layouts/AdminLayout.tsx
# Expected: 0 matches

# Zero h-3 w-3 icons (except StatusDot)
grep -rn "h-3 w-3" src/pages/admin/*.tsx src/components/admin/*.tsx | grep -v StatusDot
# Expected: 0 matches (or documented exceptions)
```

### Testing Checklist (Phase 4)
- [ ] **Desktop**: AdminLayout notifications badge renders correctly
- [ ] **Desktop**: Sales report badges consistent
- [ ] **Desktop**: Event manager actions work
- [ ] **Desktop**: Ticket management status indicators correct
- [ ] **Desktop**: All bulk operation buttons styled consistently
- [ ] **Desktop**: Contract statuses display correctly
- [ ] **Mobile**: Layout adapts, no overflow
- [ ] **Visual**: All icons appear balanced (not too small/large)
- [ ] **Visual**: No legacy red/green/yellow anywhere in admin

---

## Final Validation

### Full Compliance Check Script
After all phases complete, run:
```bash
./scripts/lint-admin-ui.sh
```

### Manual Grep Validation
```bash
# No raw UI component imports in admin pages
grep -rn "from \"@/components/ui/button\"" src/pages/admin/*.tsx
grep -rn "from \"@/components/ui/card\"" src/pages/admin/*.tsx  
grep -rn "from \"@/components/ui/tabs\"" src/pages/admin/*.tsx
grep -rn "from \"@/components/ui/badge\"" src/pages/admin/*.tsx

# No legacy color classes
grep -rn "bg-green-\|bg-red-\|bg-yellow-\|bg-amber-\|bg-blue-" src/pages/admin/*.tsx src/components/admin/*.tsx

# No text-muted-foreground
grep -rn "text-muted-foreground" src/pages/admin/*.tsx

# No Popover in admin (except documented exceptions)
grep -rn "from \"@/components/ui/popover\"" src/pages/admin/*.tsx
```

### Visual Audit Checklist
- [ ] Scan every admin page on desktop at 1440px width
- [ ] Scan every admin page on mobile at 375px width
- [ ] Confirm no orange/coral colors visible
- [ ] Confirm all buttons have consistent border-radius
- [ ] Confirm all cards have consistent shadow/border
- [ ] Confirm all status badges use same visual language
- [ ] Confirm navigation fades into background (not prominent)

---

## Rollback Plan

If a phase introduces regressions:
1. Revert the phase's commits (each phase should be a single PR)
2. Document the specific failure in this plan
3. Create targeted fix before re-attempting

---

## Timeline Estimate

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1 | 2-3 hours | None |
| Phase 2 | 2-3 hours | Phase 1 complete |
| Phase 3 | 1-2 hours | Phase 1 complete |
| Phase 4 | 2-3 hours | Phases 1-3 complete |

**Total**: 7-11 hours of focused remediation work

---

## Success Metrics

1. `scripts/lint-admin-ui.sh` exits with code 0
2. Zero grep matches for legacy patterns
3. Visual audit passes on all screens
4. No functional regressions in admin workflows
5. Mobile admin usable without horizontal scrolling
