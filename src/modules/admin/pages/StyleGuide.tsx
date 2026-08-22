import { 
  AdminCard, 
  AdminCardContent, 
  AdminCardDescription, 
  AdminCardHeader, 
  AdminCardTitle,
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
  AdminConfirmDialog,
  AdminOverlay,
  AdminMenu,
  AdminMenuSeparator,
  AdminMenuLabel,
  AdminDropdown,
  StatusPill, 
  StatusDot,
  AdminStatusIndicator,
  // Form Primitives
  AdminLabel,
  AdminTextarea,
  AdminCheckbox,
  AdminSwitch,
  AdminRadioGroup,
  AdminRadioGroupItem,
  AdminFormField,
  // Select
  AdminSelect,
  AdminSelectItem,
  AdminSelectGroup,
  AdminSelectLabel,
  AdminSelectSeparator,
  // Dialog
  AdminDialog,
  AdminDialogTrigger,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminDialogDescription,
  AdminDialogBody,
  AdminDialogFooter,
  AdminConfirmDialogExpanded,
  // Tooltip
  AdminTooltipProvider,
  AdminTooltip,
  AdminInlineHelp,
  // Collapsible
  AdminCollapsible,
  AdminCollapsibleTrigger,
  AdminCollapsibleContent,
  AdminAccordionItem,
  // ScrollArea
  AdminScrollArea,
} from "@/components/admin";
import type { AdminMenuItem, AdminConfirmIntent } from "@/components/admin";
import { 
  Loader2, 
  Mail, 
  Send, 
  Trash2, 
  Plus, 
  Check, 
  X, 
  Search, 
  Download, 
  Filter, 
  MoreHorizontal, 
  FileText, 
  AlertCircle,
  Users,
  DollarSign,
  TrendingUp,
  Ticket,
  Archive,
  RefreshCcw,
  Edit,
  Copy,
  ExternalLink,
  Settings
} from "lucide-react";
import { useState } from "react";

export default function StyleGuidePage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showRefundConfirm, setShowRefundConfirm] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showExpandedConfirm, setShowExpandedConfirm] = useState(false);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  
  // Form state examples
  const [textareaValue, setTextareaValue] = useState("");
  const [checkboxChecked, setCheckboxChecked] = useState(false);
  const [switchChecked, setSwitchChecked] = useState(false);
  const [radioValue, setRadioValue] = useState("option1");
  const [selectValue, setSelectValue] = useState("");

  // Demo menu items for AdminMenu
  const demoMenuItems: AdminMenuItem[] = [
    { id: "edit", label: "Edit", icon: <Edit className="h-4 w-4" /> },
    { id: "copy", label: "Duplicate", icon: <Copy className="h-4 w-4" /> },
    { id: "open", label: "Open in new tab", icon: <ExternalLink className="h-4 w-4" />, description: "View full details" },
    { id: "settings", label: "Settings", icon: <Settings className="h-4 w-4" />, disabled: true },
    { id: "delete", label: "Delete", icon: <Trash2 className="h-4 w-4" />, destructive: true },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Admin Style Guide</h1>
        <p className="text-sm text-[hsl(var(--admin-text-secondary))]">Design system documentation for the admin interface</p>
      </div>

      {/* Non-Negotiable Rules */}
      <AdminCard className="border-[hsl(var(--admin-error))/30] bg-[hsl(var(--admin-error-muted))]">
        <AdminCardHeader>
          <AdminCardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[hsl(var(--admin-error))]" />
            Non-Negotiable Rules
          </AdminCardTitle>
          <AdminCardDescription>These rules MUST be followed throughout the admin UI</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2">
              <X className="h-4 w-4 text-[hsl(var(--admin-error))] mt-0.5 flex-shrink-0" />
              <span><strong>NO ORANGE</strong> — No bg-orange-*, text-orange-*, border-orange-*, ring-orange-* classes anywhere</span>
            </li>
            <li className="flex gap-2">
              <Check className="h-4 w-4 text-[hsl(var(--admin-success))] mt-0.5 flex-shrink-0" />
              <span><strong>ONE FONT</strong> — Inter only, enforced by <code className="text-xs bg-white/50 px-1 rounded">.admin-theme</code></span>
            </li>
            <li className="flex gap-2">
              <Check className="h-4 w-4 text-[hsl(var(--admin-success))] mt-0.5 flex-shrink-0" />
              <span><strong>TOKENS ONLY</strong> — Use <code className="text-xs bg-white/50 px-1 rounded">hsl(var(--admin-*))</code> tokens</span>
            </li>
            <li className="flex gap-2">
              <Check className="h-4 w-4 text-[hsl(var(--admin-success))] mt-0.5 flex-shrink-0" />
              <span><strong>SHARED COMPONENTS</strong> — Import from <code className="text-xs bg-white/50 px-1 rounded">@/components/admin</code></span>
            </li>
          </ul>
        </AdminCardContent>
      </AdminCard>

      {/* Color Tokens */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">Color Tokens</AdminCardTitle>
          <AdminCardDescription>Admin-specific color palette (Tailwind classes: admin-*)</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <div className="h-12 rounded-md bg-[hsl(var(--admin-primary))] flex items-center justify-center">
                <span className="text-[hsl(var(--admin-primary-foreground))] text-xs font-mono">--admin-primary</span>
              </div>
              <p className="text-sm font-medium">Primary</p>
            </div>
            <div className="space-y-2">
              <div className="h-12 rounded-md bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))] flex items-center justify-center">
                <span className="text-[hsl(var(--admin-text))] text-xs font-mono">--admin-surface</span>
              </div>
              <p className="text-sm font-medium">Surface</p>
            </div>
            <div className="space-y-2">
              <div className="h-12 rounded-md bg-[hsl(var(--admin-success-muted))] flex items-center justify-center">
                <span className="text-[hsl(var(--admin-success))] text-xs font-mono">--admin-success</span>
              </div>
              <p className="text-sm font-medium">Success</p>
            </div>
            <div className="space-y-2">
              <div className="h-12 rounded-md bg-[hsl(var(--admin-warning-muted))] flex items-center justify-center">
                <span className="text-[hsl(var(--admin-warning))] text-xs font-mono">--admin-warning</span>
              </div>
              <p className="text-sm font-medium">Warning (Amber)</p>
            </div>
            <div className="space-y-2">
              <div className="h-12 rounded-md bg-[hsl(var(--admin-error-muted))] flex items-center justify-center">
                <span className="text-[hsl(var(--admin-error))] text-xs font-mono">--admin-error</span>
              </div>
              <p className="text-sm font-medium">Error</p>
            </div>
            <div className="space-y-2">
              <div className="h-12 rounded-md bg-[hsl(var(--admin-info-muted))] flex items-center justify-center">
                <span className="text-[hsl(var(--admin-info))] text-xs font-mono">--admin-info</span>
              </div>
              <p className="text-sm font-medium">Info</p>
            </div>
            <div className="space-y-2">
              <div className="h-12 rounded-md bg-[hsl(var(--admin-accent-muted))] flex items-center justify-center">
                <span className="text-[hsl(var(--admin-accent))] text-xs font-mono">--admin-accent</span>
              </div>
              <p className="text-sm font-medium">Accent</p>
            </div>
            <div className="space-y-2">
              <div className="h-12 rounded-md bg-[hsl(var(--admin-hover))] border-2 border-[hsl(var(--admin-border-strong))] flex items-center justify-center">
                <span className="text-[hsl(var(--admin-text))] text-xs font-mono">--admin-border</span>
              </div>
              <p className="text-sm font-medium">Border</p>
            </div>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* AdminButton Component */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminButton</AdminCardTitle>
          <AdminCardDescription>Primary button component with all variants</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-medium">Variants</p>
            <div className="flex flex-wrap gap-3">
              <AdminButton variant="admin">Primary</AdminButton>
              <AdminButton variant="adminOutline">Outline</AdminButton>
              <AdminButton variant="adminGhost">Ghost</AdminButton>
              <AdminButton variant="adminDestructive">Destructive</AdminButton>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Sizes</p>
            <div className="flex flex-wrap items-end gap-3">
              <AdminButton variant="admin" size="lg">Large</AdminButton>
              <AdminButton variant="admin" size="default">Default</AdminButton>
              <AdminButton variant="admin" size="sm">Small</AdminButton>
              <AdminButton variant="admin" size="icon"><Plus className="h-4 w-4" /></AdminButton>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">States</p>
            <div className="flex flex-wrap gap-3">
              <AdminButton variant="admin" isLoading>Loading...</AdminButton>
              <AdminButton variant="admin" disabled>Disabled</AdminButton>
              <AdminButton variant="admin" size="sm">
                <Plus className="h-4 w-4 mr-1" /> With Icon
              </AdminButton>
            </div>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* AdminInput & AdminSearchInput */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminInput & AdminSearchInput</AdminCardTitle>
          <AdminCardDescription>Form input components</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4 max-w-md">
          <div className="space-y-2">
            <label className="text-sm font-medium">AdminInput</label>
            <AdminInput placeholder="Enter value..." />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">AdminInput (compact)</label>
            <AdminInput placeholder="Compact height" compact />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">AdminSearchInput</label>
            <AdminSearchInput placeholder="Search..." />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">AdminSearchInput (compact)</label>
            <AdminSearchInput placeholder="Search..." compact />
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* AdminLabel */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminLabel</AdminCardTitle>
          <AdminCardDescription>Form labels with required/error states</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4 max-w-md">
          <div className="space-y-3">
            <p className="text-sm font-medium">States</p>
            <div className="space-y-4">
              <AdminLabel>Default Label</AdminLabel>
              <AdminLabel required>Required Label</AdminLabel>
              <AdminLabel error>Error Label</AdminLabel>
              <AdminLabel required error>Required + Error</AdminLabel>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Do / Don't</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-3 rounded-lg bg-[hsl(var(--admin-success-muted))] text-sm">
                <p className="font-medium text-[hsl(var(--admin-success))] mb-2">✓ Do</p>
                <p>Use AdminLabel for all form fields</p>
              </div>
              <div className="p-3 rounded-lg bg-[hsl(var(--admin-error-muted))] text-sm">
                <p className="font-medium text-[hsl(var(--admin-error))] mb-2">✗ Don't</p>
                <p>Import Label from @/components/ui</p>
              </div>
            </div>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* AdminTextarea */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminTextarea</AdminCardTitle>
          <AdminCardDescription>Multi-line text input with Admin styling</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4 max-w-md">
          <div className="space-y-3">
            <p className="text-sm font-medium">States</p>
            <div className="space-y-4">
              <AdminFormField label="Default">
                <AdminTextarea 
                  placeholder="Enter description..."
                  value={textareaValue}
                  onChange={(e) => setTextareaValue(e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="With Hint" hint="Maximum 500 characters">
                <AdminTextarea placeholder="Enter text..." />
              </AdminFormField>
              <AdminFormField label="With Error" error="This field is required" required>
                <AdminTextarea placeholder="Enter text..." error />
              </AdminFormField>
              <AdminFormField label="Disabled">
                <AdminTextarea placeholder="Disabled..." disabled />
              </AdminFormField>
            </div>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* AdminCheckbox & AdminSwitch */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminCheckbox & AdminSwitch</AdminCardTitle>
          <AdminCardDescription>Toggle controls with Admin styling</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-6 max-w-md">
          <div className="space-y-3">
            <p className="text-sm font-medium">AdminCheckbox</p>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <AdminCheckbox 
                  id="checkbox-default"
                  checked={checkboxChecked}
                  onCheckedChange={(checked) => setCheckboxChecked(checked as boolean)}
                />
                <AdminLabel htmlFor="checkbox-default">Default checkbox</AdminLabel>
              </div>
              <div className="flex items-center gap-3">
                <AdminCheckbox id="checkbox-checked" defaultChecked />
                <AdminLabel htmlFor="checkbox-checked">Checked by default</AdminLabel>
              </div>
              <div className="flex items-center gap-3">
                <AdminCheckbox id="checkbox-error" error />
                <AdminLabel htmlFor="checkbox-error" error>With error state</AdminLabel>
              </div>
              <div className="flex items-center gap-3">
                <AdminCheckbox id="checkbox-disabled" disabled />
                <AdminLabel htmlFor="checkbox-disabled" className="opacity-50">Disabled</AdminLabel>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">AdminSwitch</p>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <AdminLabel htmlFor="switch-default">Enable notifications</AdminLabel>
                <AdminSwitch 
                  id="switch-default"
                  checked={switchChecked}
                  onCheckedChange={setSwitchChecked}
                />
              </div>
              <div className="flex items-center justify-between">
                <AdminLabel htmlFor="switch-checked">Active by default</AdminLabel>
                <AdminSwitch id="switch-checked" defaultChecked />
              </div>
              <div className="flex items-center justify-between opacity-50">
                <AdminLabel htmlFor="switch-disabled">Disabled</AdminLabel>
                <AdminSwitch id="switch-disabled" disabled />
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Mobile Behavior</p>
            <div className="p-3 rounded-lg bg-[hsl(var(--admin-info-muted))] text-sm">
              <p>Touch targets are at least 44px for both checkbox (20x20 with padding) and switch (24x44).</p>
            </div>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* AdminRadioGroup */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminRadioGroup</AdminCardTitle>
          <AdminCardDescription>Single-select option group with Admin styling</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4 max-w-md">
          <AdminRadioGroup value={radioValue} onValueChange={setRadioValue}>
            <div className="flex items-center gap-3">
              <AdminRadioGroupItem value="option1" id="radio-1" />
              <AdminLabel htmlFor="radio-1">Option 1</AdminLabel>
            </div>
            <div className="flex items-center gap-3">
              <AdminRadioGroupItem value="option2" id="radio-2" />
              <AdminLabel htmlFor="radio-2">Option 2</AdminLabel>
            </div>
            <div className="flex items-center gap-3">
              <AdminRadioGroupItem value="option3" id="radio-3" />
              <AdminLabel htmlFor="radio-3">Option 3</AdminLabel>
            </div>
            <div className="flex items-center gap-3">
              <AdminRadioGroupItem value="option4" id="radio-4" disabled />
              <AdminLabel htmlFor="radio-4" className="opacity-50">Disabled option</AdminLabel>
            </div>
          </AdminRadioGroup>
        </AdminCardContent>
      </AdminCard>

      {/* AdminSelect */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminSelect</AdminCardTitle>
          <AdminCardDescription>Dropdown selection with mobile Sheet behavior</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-6 max-w-md">
          <div className="space-y-3">
            <p className="text-sm font-medium">States</p>
            <div className="space-y-4">
              <AdminFormField label="Default Select">
                <AdminSelect 
                  value={selectValue} 
                  onValueChange={setSelectValue}
                  placeholder="Select an option..."
                  mobileTitle="Select Status"
                >
                  <AdminSelectItem value="active">Active</AdminSelectItem>
                  <AdminSelectItem value="pending">Pending</AdminSelectItem>
                  <AdminSelectItem value="completed">Completed</AdminSelectItem>
                  <AdminSelectItem value="cancelled">Cancelled</AdminSelectItem>
                </AdminSelect>
              </AdminFormField>
              <AdminFormField label="With Error" error="Please select an option" required>
                <AdminSelect placeholder="Select..." error>
                  <AdminSelectItem value="1">Option 1</AdminSelectItem>
                  <AdminSelectItem value="2">Option 2</AdminSelectItem>
                </AdminSelect>
              </AdminFormField>
              <AdminFormField label="Disabled">
                <AdminSelect placeholder="Select..." disabled>
                  <AdminSelectItem value="1">Option 1</AdminSelectItem>
                </AdminSelect>
              </AdminFormField>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Mobile Behavior (Critical)</p>
            <div className="p-3 rounded-lg bg-[hsl(var(--admin-warning-muted))] text-sm space-y-2">
              <p className="font-medium text-[hsl(var(--admin-warning))]">⚠️ Mobile Sheet Pattern</p>
              <p>On mobile devices, AdminSelect opens as a full-height Sheet/Drawer instead of a small popover. This provides:</p>
              <ul className="list-disc list-inside space-y-1 text-[hsl(var(--admin-text-secondary))]">
                <li>Larger touch targets (48px min height)</li>
                <li>Better visibility and accessibility</li>
                <li>Consistent with mobile OS patterns</li>
              </ul>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Do / Don't</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-3 rounded-lg bg-[hsl(var(--admin-success-muted))] text-sm">
                <p className="font-medium text-[hsl(var(--admin-success))] mb-2">✓ Do</p>
                <p>Use AdminSelect for all dropdowns in admin</p>
              </div>
              <div className="p-3 rounded-lg bg-[hsl(var(--admin-error-muted))] text-sm">
                <p className="font-medium text-[hsl(var(--admin-error))] mb-2">✗ Don't</p>
                <p>Import Select from @/components/ui</p>
              </div>
            </div>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* AdminDialog */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminDialog</AdminCardTitle>
          <AdminCardDescription>Modal dialogs with Admin styling and size variants</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-medium">Dialog Sizes</p>
            <div className="flex flex-wrap gap-3">
              <AdminButton variant="adminOutline" size="sm" onClick={() => setShowInfoDialog(true)}>
                Open Info Dialog
              </AdminButton>
              <AdminButton variant="adminOutline" size="sm" onClick={() => setShowExpandedConfirm(true)}>
                Open Confirm Dialog
              </AdminButton>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Confirm Dialog Intents</p>
            <div className="p-4 bg-[hsl(var(--admin-hover))] rounded-lg text-sm space-y-2">
              <p><strong>default:</strong> Standard confirmation (neutral styling)</p>
              <p><strong>danger:</strong> Destructive actions (red icon, destructive button)</p>
              <p><strong>warning:</strong> Cautionary actions (amber icon)</p>
              <p><strong>success:</strong> Positive confirmations (green icon)</p>
              <p><strong>info:</strong> Informational confirmations (blue icon)</p>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Structure</p>
            <pre className="bg-[hsl(var(--admin-hover))] p-4 rounded-lg text-xs overflow-x-auto">
{`<AdminDialog open={open} onOpenChange={setOpen}>
  <AdminDialogContent size="md">
    <AdminDialogHeader>
      <AdminDialogTitle icon={<Icon />}>Title</AdminDialogTitle>
      <AdminDialogDescription>Description</AdminDialogDescription>
    </AdminDialogHeader>
    <AdminDialogBody>
      {/* Main content */}
    </AdminDialogBody>
    <AdminDialogFooter>
      <AdminButton variant="adminOutline">Cancel</AdminButton>
      <AdminButton variant="admin">Confirm</AdminButton>
    </AdminDialogFooter>
  </AdminDialogContent>
</AdminDialog>`}
            </pre>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* AdminTooltip */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminTooltip & AdminInlineHelp</AdminCardTitle>
          <AdminCardDescription>Tooltips (desktop) and inline help (mobile)</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-medium">AdminTooltip (Desktop Only)</p>
            <div className="flex flex-wrap gap-4">
              <AdminTooltipProvider>
                <AdminTooltip content="This is a helpful tooltip">
                  <AdminButton variant="adminOutline" size="sm">Hover me</AdminButton>
                </AdminTooltip>
                <AdminTooltip content="Positioned to the right" side="right">
                  <AdminButton variant="adminOutline" size="sm">Right tooltip</AdminButton>
                </AdminTooltip>
                <AdminTooltip content="Bottom tooltip with more text that might wrap to multiple lines" side="bottom">
                  <AdminButton variant="adminOutline" size="sm">Bottom tooltip</AdminButton>
                </AdminTooltip>
              </AdminTooltipProvider>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Mobile Behavior (Critical)</p>
            <div className="p-3 rounded-lg bg-[hsl(var(--admin-warning-muted))] text-sm space-y-2">
              <p className="font-medium text-[hsl(var(--admin-warning))]">⚠️ Tooltips Disabled on Mobile</p>
              <p>By default, tooltips are completely hidden on mobile devices since hover states don't exist on touch devices. Use <code className="bg-white/50 px-1 rounded">forceOnMobile</code> only when absolutely necessary.</p>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">AdminInlineHelp (Mobile Alternative)</p>
            <div className="max-w-md space-y-4">
              <AdminFormField label="Email Address">
                <AdminInput placeholder="Enter email..." />
                <AdminInlineHelp>We'll never share your email with anyone else.</AdminInlineHelp>
              </AdminFormField>
            </div>
            <div className="p-3 rounded-lg bg-[hsl(var(--admin-info-muted))] text-sm">
              <p>Use AdminInlineHelp instead of tooltips when help text should always be visible, especially on mobile.</p>
            </div>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* AdminCollapsible */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminCollapsible & AdminAccordionItem</AdminCardTitle>
          <AdminCardDescription>Expandable/collapsible sections with Admin styling</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-medium">Individual Collapsible</p>
            <AdminCollapsible>
              <AdminCollapsibleTrigger>
                Click to expand
              </AdminCollapsibleTrigger>
              <AdminCollapsibleContent>
                <p className="text-sm text-[hsl(var(--admin-text-secondary))]">
                  This is the collapsible content. It animates smoothly when opening and closing.
                  You can put any content here including forms, lists, or other components.
                </p>
              </AdminCollapsibleContent>
            </AdminCollapsible>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Accordion Pattern (Pre-composed)</p>
            <div className="space-y-2">
              <AdminAccordionItem title="Section 1: Getting Started" defaultOpen>
                <p className="text-sm text-[hsl(var(--admin-text-secondary))]">
                  This section starts open by default. Use the defaultOpen prop to control initial state.
                </p>
              </AdminAccordionItem>
              <AdminAccordionItem title="Section 2: Configuration">
                <p className="text-sm text-[hsl(var(--admin-text-secondary))]">
                  Configuration options and settings go here.
                </p>
              </AdminAccordionItem>
              <AdminAccordionItem title="Section 3: Advanced">
                <p className="text-sm text-[hsl(var(--admin-text-secondary))]">
                  Advanced features and options for power users.
                </p>
              </AdminAccordionItem>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Mobile Behavior</p>
            <div className="p-3 rounded-lg bg-[hsl(var(--admin-info-muted))] text-sm">
              <p>Trigger has 44px minimum height for touch targets. Chevron rotates on open/close.</p>
            </div>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* AdminScrollArea */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminScrollArea</AdminCardTitle>
          <AdminCardDescription>Scrollable container with Admin-styled scrollbars</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm font-medium">Vertical Scroll</p>
            <AdminScrollArea className="h-48 rounded-md border border-[hsl(var(--admin-border))] p-4">
              <div className="space-y-4">
                {Array.from({ length: 15 }).map((_, i) => (
                  <div key={i} className="p-3 rounded-md bg-[hsl(var(--admin-hover))]">
                    <p className="text-sm">Scrollable item {i + 1}</p>
                    <p className="text-xs text-[hsl(var(--admin-text-muted))]">Some description text</p>
                  </div>
                ))}
              </div>
            </AdminScrollArea>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Horizontal Scroll</p>
            <AdminScrollArea orientation="horizontal" className="rounded-md border border-[hsl(var(--admin-border))] p-4">
              <div className="flex gap-4" style={{ width: "max-content" }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="w-32 p-4 rounded-md bg-[hsl(var(--admin-hover))] flex-shrink-0">
                    <p className="text-sm font-medium">Card {i + 1}</p>
                  </div>
                ))}
              </div>
            </AdminScrollArea>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Scrollbar Styling</p>
            <div className="p-3 rounded-lg bg-[hsl(var(--admin-info-muted))] text-sm">
              <p>Scrollbars use Admin tokens: subtle track, visible thumb on hover. Matches the Notion/Attio aesthetic.</p>
            </div>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* AdminTabs */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminTabs</AdminCardTitle>
          <AdminCardDescription>Tab navigation with underline style</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent>
          <AdminTabs defaultValue="all">
            <AdminTabsList>
              <AdminTabsTrigger value="all">All Items</AdminTabsTrigger>
              <AdminTabsTrigger value="active">Active</AdminTabsTrigger>
              <AdminTabsTrigger value="pending">Pending</AdminTabsTrigger>
              <AdminTabsTrigger value="archived">Archived</AdminTabsTrigger>
            </AdminTabsList>
            <AdminTabsContent value="all" className="pt-4">
              <p className="text-sm text-[hsl(var(--admin-text-secondary))]">Showing all items</p>
            </AdminTabsContent>
            <AdminTabsContent value="active" className="pt-4">
              <p className="text-sm text-[hsl(var(--admin-text-secondary))]">Showing active items</p>
            </AdminTabsContent>
            <AdminTabsContent value="pending" className="pt-4">
              <p className="text-sm text-[hsl(var(--admin-text-secondary))]">Showing pending items</p>
            </AdminTabsContent>
            <AdminTabsContent value="archived" className="pt-4">
              <p className="text-sm text-[hsl(var(--admin-text-secondary))]">Showing archived items</p>
            </AdminTabsContent>
          </AdminTabs>
        </AdminCardContent>
      </AdminCard>

      {/* AdminBadge */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminBadge</AdminCardTitle>
          <AdminCardDescription>Status badges with semantic intents</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm font-medium">Intents</p>
            <div className="flex flex-wrap gap-3">
              <AdminBadge intent="neutral">Neutral</AdminBadge>
              <AdminBadge intent="success">Success</AdminBadge>
              <AdminBadge intent="warning">Warning</AdminBadge>
              <AdminBadge intent="danger">Danger</AdminBadge>
              <AdminBadge intent="info">Info</AdminBadge>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">With Dot</p>
            <div className="flex flex-wrap gap-3">
              <AdminBadge intent="success" showDot>Active</AdminBadge>
              <AdminBadge intent="warning" showDot>Pending</AdminBadge>
              <AdminBadge intent="danger" showDot>Cancelled</AdminBadge>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Sizes</p>
            <div className="flex flex-wrap items-center gap-3">
              <AdminBadge size="sm">Small</AdminBadge>
              <AdminBadge size="md">Medium</AdminBadge>
            </div>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* StatusPill (existing) */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">StatusPill & StatusDot</AdminCardTitle>
          <AdminCardDescription>Pre-defined status indicators</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm font-medium">StatusPill</p>
            <div className="flex flex-wrap gap-3">
              <StatusPill status="lead" />
              <StatusPill status="contacted" />
              <StatusPill status="confirmed" />
              <StatusPill status="pending" />
              <StatusPill status="declined" />
              <StatusPill status="paid" />
              <StatusPill status="cancelled" />
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">StatusDot (inline)</p>
            <div className="flex flex-wrap items-center gap-6">
              <span className="flex items-center gap-2 text-sm">
                <StatusDot status="confirmed" /> Confirmed
              </span>
              <span className="flex items-center gap-2 text-sm">
                <StatusDot status="pending" /> Pending
              </span>
              <span className="flex items-center gap-2 text-sm">
                <StatusDot status="declined" /> Declined
              </span>
            </div>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* AdminToolbar */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminToolbar</AdminCardTitle>
          <AdminCardDescription>Standard toolbar pattern: left = filters/search, right = actions</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent>
          <AdminToolbar className="p-4 bg-[hsl(var(--admin-bg))] rounded-lg border border-[hsl(var(--admin-border))]">
            <AdminToolbarLeft>
              <AdminSearchInput placeholder="Search..." className="w-64" />
              <AdminButton variant="adminOutline" size="sm">
                <Filter className="h-4 w-4 mr-1" /> Filter
              </AdminButton>
            </AdminToolbarLeft>
            <AdminToolbarRight>
              <AdminButton variant="adminOutline" size="sm">
                <Download className="h-4 w-4 mr-1" /> Export
              </AdminButton>
              <AdminButton variant="admin" size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add New
              </AdminButton>
            </AdminToolbarRight>
          </AdminToolbar>
        </AdminCardContent>
      </AdminCard>

      {/* AdminStatCard */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminStatCard</AdminCardTitle>
          <AdminCardDescription>KPI / metric cards</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AdminStatCard 
              title="Total Revenue" 
              value="$12,450" 
              icon={<DollarSign className="h-4 w-4" />}
              trend={{ value: "+12%", positive: true }}
            />
            <AdminStatCard 
              title="Registrations" 
              value="248" 
              icon={<Users className="h-4 w-4" />}
              description="This month"
            />
            <AdminStatCard 
              title="Tickets Sold" 
              value="1,234" 
              icon={<Ticket className="h-4 w-4" />}
              trend={{ value: "-5%", positive: false }}
            />
            <AdminStatCard 
              title="Conversion Rate" 
              value="3.2%" 
              icon={<TrendingUp className="h-4 w-4" />}
            />
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* AdminTable */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminTable</AdminCardTitle>
          <AdminCardDescription>Data table with consistent styling</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent>
          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow>
                <AdminTableHead>Name</AdminTableHead>
                <AdminTableHead>Email</AdminTableHead>
                <AdminTableHead>Status</AdminTableHead>
                <AdminTableHead className="text-right">Actions</AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              <AdminTableRow>
                <AdminTableCell className="font-medium">John Doe</AdminTableCell>
                <AdminTableCell className="text-[hsl(var(--admin-text-secondary))]">john@example.com</AdminTableCell>
                <AdminTableCell><StatusPill status="confirmed" size="sm" /></AdminTableCell>
                <AdminTableCell className="text-right">
                  <AdminButton variant="adminGhost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </AdminButton>
                </AdminTableCell>
              </AdminTableRow>
              <AdminTableRow>
                <AdminTableCell className="font-medium">Jane Smith</AdminTableCell>
                <AdminTableCell className="text-[hsl(var(--admin-text-secondary))]">jane@example.com</AdminTableCell>
                <AdminTableCell><StatusPill status="pending" size="sm" /></AdminTableCell>
                <AdminTableCell className="text-right">
                  <AdminButton variant="adminGhost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </AdminButton>
                </AdminTableCell>
              </AdminTableRow>
            </AdminTableBody>
          </AdminTable>
          
          <div className="mt-6">
            <p className="text-sm font-medium mb-3">Empty State</p>
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow>
                  <AdminTableHead>Name</AdminTableHead>
                  <AdminTableHead>Status</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                <AdminTableEmpty 
                  title="No results found"
                  description="Try adjusting your search or filters."
                  action={<AdminButton variant="admin" size="sm"><Plus className="h-4 w-4 mr-1" /> Create New</AdminButton>}
                />
              </AdminTableBody>
            </AdminTable>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* AdminEmptyState */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminEmptyState</AdminCardTitle>
          <AdminCardDescription>Full-page empty state</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent>
          <div className="border border-[hsl(var(--admin-border))] rounded-lg">
            <AdminEmptyState
              icon={<Users className="h-7 w-7 text-[hsl(var(--admin-text-muted))]" />}
              title="No customers yet"
              description="Get started by adding your first customer. They'll appear here once added."
              action={<AdminButton variant="admin" size="sm"><Plus className="h-4 w-4 mr-1" /> Add Customer</AdminButton>}
            />
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* AdminPagination */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminPagination</AdminCardTitle>
          <AdminCardDescription>Table pagination controls</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent>
          <AdminPagination 
            currentPage={currentPage}
            totalPages={10}
            onPageChange={setCurrentPage}
          />
        </AdminCardContent>
      </AdminCard>

      {/* Typography */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">Typography</AdminCardTitle>
          <AdminCardDescription>Text styles - Inter font enforced by admin-theme</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Page Title</h1>
            <code className="text-xs text-[hsl(var(--admin-text-muted))]">text-xl sm:text-2xl font-semibold tracking-tight</code>
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Card Title</h2>
            <code className="text-xs text-[hsl(var(--admin-text-muted))]">text-base font-semibold</code>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-[hsl(var(--admin-text-secondary))]">Secondary text / description</p>
            <code className="text-xs text-[hsl(var(--admin-text-muted))]">text-sm text-[hsl(var(--admin-text-secondary))]</code>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">Muted / helper text</p>
            <code className="text-xs text-[hsl(var(--admin-text-muted))]">text-xs text-[hsl(var(--admin-text-muted))]</code>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* Usage Guidelines */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">Usage Guidelines</AdminCardTitle>
          <AdminCardDescription>Best practices for consistent UI</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2">
              <Check className="h-4 w-4 text-[hsl(var(--admin-success))] mt-0.5 flex-shrink-0" />
              <span>Import components from <code className="text-xs bg-[hsl(var(--admin-hover))] px-1 rounded">@/components/admin</code></span>
            </li>
            <li className="flex gap-2">
              <Check className="h-4 w-4 text-[hsl(var(--admin-success))] mt-0.5 flex-shrink-0" />
              <span>Use <code className="text-xs bg-[hsl(var(--admin-hover))] px-1 rounded">AdminButton</code> with <code className="text-xs bg-[hsl(var(--admin-hover))] px-1 rounded">variant="admin"</code> for primary actions</span>
            </li>
            <li className="flex gap-2">
              <Check className="h-4 w-4 text-[hsl(var(--admin-success))] mt-0.5 flex-shrink-0" />
              <span>Use <code className="text-xs bg-[hsl(var(--admin-hover))] px-1 rounded">AdminToolbar</code> for page toolbars</span>
            </li>
            <li className="flex gap-2">
              <Check className="h-4 w-4 text-[hsl(var(--admin-success))] mt-0.5 flex-shrink-0" />
              <span>Use <code className="text-xs bg-[hsl(var(--admin-hover))] px-1 rounded">StatusPill</code> or <code className="text-xs bg-[hsl(var(--admin-hover))] px-1 rounded">AdminBadge</code> for status indicators</span>
            </li>
            <li className="flex gap-2">
              <Check className="h-4 w-4 text-[hsl(var(--admin-success))] mt-0.5 flex-shrink-0" />
              <span>Use CSS variables: <code className="text-xs bg-[hsl(var(--admin-hover))] px-1 rounded">hsl(var(--admin-*))</code></span>
            </li>
            <li className="flex gap-2">
              <X className="h-4 w-4 text-[hsl(var(--admin-error))] mt-0.5 flex-shrink-0" />
              <span>Never use <code className="text-xs bg-[hsl(var(--admin-hover))] px-1 rounded">orange-*</code> classes</span>
            </li>
            <li className="flex gap-2">
              <X className="h-4 w-4 text-[hsl(var(--admin-error))] mt-0.5 flex-shrink-0" />
              <span>Never use hardcoded hex colors in admin components</span>
            </li>
            <li className="flex gap-2">
              <X className="h-4 w-4 text-[hsl(var(--admin-error))] mt-0.5 flex-shrink-0" />
              <span>Never use <code className="text-xs bg-[hsl(var(--admin-hover))] px-1 rounded">font-serif</code> or <code className="text-xs bg-[hsl(var(--admin-hover))] px-1 rounded">font-display</code> in admin</span>
            </li>
          </ul>
        </AdminCardContent>
      </AdminCard>

      {/* AdminConfirmDialog - Action Hierarchy */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminConfirmDialog</AdminCardTitle>
          <AdminCardDescription>Confirmation dialogs for destructive/high-impact actions</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm font-medium">Action Hierarchy</p>
            <div className="bg-[hsl(var(--admin-hover))] p-4 rounded-lg space-y-2 text-sm">
              <p><strong>Safe actions</strong> (view/export/email): No confirmation needed</p>
              <p><strong>Reversible actions</strong> (transfer): Optional confirmation with explanation</p>
              <p><strong>Destructive actions</strong> (refund/archive/delete): REQUIRED confirmation with consequences</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <AdminButton variant="adminDestructive" size="sm" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete (Destructive)
            </AdminButton>
            <AdminButton variant="adminDestructive" size="sm" onClick={() => setShowArchiveConfirm(true)}>
              <Archive className="h-4 w-4 mr-1" /> Archive (Warning)
            </AdminButton>
            <AdminButton variant="adminDestructive" size="sm" onClick={() => setShowRefundConfirm(true)}>
              <RefreshCcw className="h-4 w-4 mr-1" /> Refund (Destructive)
            </AdminButton>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* AdminOverlay / AdminMenu - Single Source of Truth for Popups */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">AdminOverlay / AdminMenu</AdminCardTitle>
          <AdminCardDescription>Single source of truth for all admin popups, dropdowns, and floating menus</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-6">
          {/* Design Specs */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Design Specifications</p>
            <div className="bg-[hsl(var(--admin-hover))] p-4 rounded-lg text-sm space-y-2">
              <p><strong>Background:</strong> white (admin-surface)</p>
              <p><strong>Border:</strong> 1px neutral gray (admin-border-strong)</p>
              <p><strong>Border radius:</strong> medium (rounded-lg) — matches admin cards</p>
              <p><strong>Shadow:</strong> subtle, structural only — no glow, no heavy elevation</p>
              <p><strong>Typography:</strong> follows Admin Style Guide exactly</p>
              <p className="text-[hsl(var(--admin-error))]"><strong>Never:</strong> brand colors, orange, gradients</p>
            </div>
          </div>

          {/* Features */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Features</p>
            <ul className="text-sm space-y-1 text-[hsl(var(--admin-text-secondary))]">
              <li>• Lists of selectable rows with optional icons</li>
              <li>• Optional secondary metadata (description, badge, status)</li>
              <li>• Full keyboard navigation (Arrow keys, Enter, Escape)</li>
              <li>• Click outside to dismiss</li>
              <li>• Disabled and destructive item states</li>
            </ul>
          </div>

          {/* Interactive Examples */}
          <div className="space-y-4">
            <p className="text-sm font-medium">Interactive Examples</p>
            
            {/* AdminDropdown Example */}
            <div className="flex flex-wrap gap-4 items-start">
              <div className="space-y-2">
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">AdminDropdown (controlled)</p>
                <AdminDropdown
                  open={showDropdown}
                  onOpenChange={setShowDropdown}
                  trigger={
                    <AdminButton variant="adminOutline" size="sm">
                      <MoreHorizontal className="h-4 w-4 mr-1" /> Actions
                    </AdminButton>
                  }
                >
                  <AdminMenu
                    items={demoMenuItems}
                    onSelect={(item) => console.log('Selected:', item.id)}
                  />
                </AdminDropdown>
              </div>

              {/* Static AdminMenu Example */}
              <div className="space-y-2">
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">AdminMenu (static preview)</p>
                <div className="relative inline-block">
                  <AdminMenu
                    open={true}
                    items={[
                      { id: "view", label: "View details", icon: <ExternalLink className="h-4 w-4" /> },
                      { id: "edit", label: "Edit", icon: <Edit className="h-4 w-4" />, selected: true },
                      { id: "delete", label: "Delete", icon: <Trash2 className="h-4 w-4" />, destructive: true },
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* With Labels and Separators */}
            <div className="space-y-2">
              <p className="text-xs text-[hsl(var(--admin-text-muted))]">With labels and separators</p>
              <div className="inline-block">
                <AdminOverlay open={true} className="static">
                  <AdminMenuLabel>Actions</AdminMenuLabel>
                  <div role="menu">
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-[hsl(var(--admin-hover))] flex items-center gap-3">
                      <Edit className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                      <span>Edit</span>
                    </button>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-[hsl(var(--admin-hover))] flex items-center gap-3">
                      <Copy className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                      <span>Duplicate</span>
                    </button>
                  </div>
                  <AdminMenuSeparator />
                  <AdminMenuLabel>Danger Zone</AdminMenuLabel>
                  <div role="menu">
                    <button className="w-full text-left px-3 py-2 text-sm text-[hsl(var(--admin-error))] hover:bg-[hsl(var(--admin-error-muted))] flex items-center gap-3">
                      <Trash2 className="h-4 w-4" />
                      <span>Delete</span>
                    </button>
                  </div>
                </AdminOverlay>
              </div>
            </div>
          </div>

          {/* Usage */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Usage</p>
            <pre className="bg-[hsl(var(--admin-hover))] p-4 rounded-lg text-xs overflow-x-auto">
{`import { AdminDropdown, AdminMenu } from "@/components/admin";
import type { AdminMenuItem } from "@/components/admin";

const items: AdminMenuItem[] = [
  { id: "edit", label: "Edit", icon: <Edit /> },
  { id: "delete", label: "Delete", destructive: true },
];

<AdminDropdown
  trigger={<Button>Actions</Button>}
>
  <AdminMenu items={items} onSelect={(item) => console.log(item.id)} />
</AdminDropdown>`}
            </pre>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* Status Indicators for Popups/Overlays */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base">Status Indicators (Popups/Overlays)</AdminCardTitle>
          <AdminCardDescription>
            Standardized status display for use inside admin popups, overlays, and menus
          </AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-6">
          {/* Rules */}
          <div className="p-4 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-hover))]">
            <p className="text-sm font-medium mb-2">Popup Status Rules</p>
            <ul className="space-y-1 text-sm text-[hsl(var(--admin-text-secondary))]">
              <li>• <strong>No pill-style</strong> labels inside popups/overlays</li>
              <li>• Status = <strong>text + subtle dot</strong> indicator</li>
              <li>• <strong>No orange</strong> or accent colors</li>
              <li>• <strong>Informational</strong>, not promotional (Published, Draft, Archived should feel neutral)</li>
              <li>• Must match table/card status patterns</li>
            </ul>
          </div>

          {/* Comparison */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-medium text-[hsl(var(--admin-error))]">❌ Don't use in popups (Pill style)</p>
              <div className="flex flex-wrap gap-2">
                <StatusPill status="published" />
                <StatusPill status="draft" />
                <StatusPill status="active" />
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium text-[hsl(var(--admin-success))]">✓ Use in popups (AdminStatusIndicator)</p>
              <div className="flex flex-wrap gap-4">
                <AdminStatusIndicator status="published" />
                <AdminStatusIndicator status="draft" />
                <AdminStatusIndicator status="active" />
              </div>
            </div>
          </div>

          {/* All Status Examples */}
          <div className="space-y-3">
            <p className="text-sm font-medium">AdminStatusIndicator Examples</p>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <AdminStatusIndicator status="published" />
              <AdminStatusIndicator status="draft" />
              <AdminStatusIndicator status="archived" />
              <AdminStatusIndicator status="lead" />
              <AdminStatusIndicator status="contacted" />
              <AdminStatusIndicator status="negotiating" />
              <AdminStatusIndicator status="confirmed" />
              <AdminStatusIndicator status="declined" />
              <AdminStatusIndicator status="pending" />
              <AdminStatusIndicator status="active" />
              <AdminStatusIndicator status="inactive" />
              <AdminStatusIndicator status="paid" />
              <AdminStatusIndicator status="unpaid" />
              <AdminStatusIndicator status="completed" />
            </div>
          </div>

          {/* Without Dot */}
          <div className="space-y-2">
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">Without dot (showDot=false)</p>
            <div className="flex gap-4">
              <AdminStatusIndicator status="published" showDot={false} />
              <AdminStatusIndicator status="draft" showDot={false} />
            </div>
          </div>

          {/* Usage */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Usage</p>
            <pre className="bg-[hsl(var(--admin-hover))] p-4 rounded-lg text-xs overflow-x-auto">
{`import { AdminStatusIndicator } from "@/components/admin";

// Inside AdminMenu badge prop
const items: AdminMenuItem[] = [
  { 
    id: "event-1", 
    label: "Summer Festival", 
    badge: <AdminStatusIndicator status="published" /> 
  },
];

// Direct usage
<AdminStatusIndicator status="draft" />
<AdminStatusIndicator status="published" showDot={false} />`}
            </pre>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* Confirmation Dialogs */}
      <AdminConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Registration"
        description="This will permanently delete the registration."
        consequences={[
          "Permanently remove registration data",
          "Cancel any associated tickets",
          "This action cannot be undone",
        ]}
        scope="This affects the selected registration only"
        actionType="destructive"
        actionLabel="Delete"
        icon="delete"
        onConfirm={() => setShowDeleteConfirm(false)}
      />
      <AdminConfirmDialog
        open={showArchiveConfirm}
        onOpenChange={setShowArchiveConfirm}
        title="Archive Event"
        description="This will archive the event and hide it from public view."
        consequences={[
          "Event will no longer be visible publicly",
          "Existing data will be preserved",
          "You can restore the event later",
        ]}
        scope="This affects the selected event only"
        actionType="warning"
        actionLabel="Archive"
        icon="archive"
        onConfirm={() => setShowArchiveConfirm(false)}
      />
      <AdminConfirmDialog
        open={showRefundConfirm}
        onOpenChange={setShowRefundConfirm}
        title="Process Refund"
        description="This will process a refund through Stripe."
        consequences={[
          "Refund $150.00 to the customer's payment method",
          "Mark the ticket as refunded",
          "This action cannot be undone",
        ]}
        scope="This affects the selected ticket only"
        actionType="destructive"
        actionLabel="Process Refund"
        icon="refund"
        onConfirm={() => setShowRefundConfirm(false)}
      />

      {/* Expanded Confirm Dialog Example */}
      <AdminConfirmDialogExpanded
        open={showExpandedConfirm}
        onOpenChange={setShowExpandedConfirm}
        title="Confirm Action"
        description="Are you sure you want to proceed with this action?"
        confirmLabel="Proceed"
        cancelLabel="Cancel"
        intent="warning"
        onConfirm={() => {}}
      >
        <div className="space-y-3">
          <p className="text-sm text-[hsl(var(--admin-text-secondary))]">
            This is additional content inside the dialog body. You can include forms, warnings, or any other content.
          </p>
        </div>
      </AdminConfirmDialogExpanded>

      {/* Info Dialog Example */}
      <AdminDialog open={showInfoDialog} onOpenChange={setShowInfoDialog}>
        <AdminDialogContent size="md">
          <AdminDialogHeader>
            <AdminDialogTitle icon={<FileText className="h-5 w-5 text-[hsl(var(--admin-info))]" />}>
              Dialog Example
            </AdminDialogTitle>
            <AdminDialogDescription>
              This demonstrates the AdminDialog component with all its parts.
            </AdminDialogDescription>
          </AdminDialogHeader>
          <AdminDialogBody>
            <div className="space-y-4">
              <p className="text-sm text-[hsl(var(--admin-text-secondary))]">
                AdminDialog provides a consistent modal experience across the admin interface.
                It uses AdminOverlay styling for the backdrop and content.
              </p>
              <AdminFormField label="Example Input">
                <AdminInput placeholder="You can put any content here..." />
              </AdminFormField>
            </div>
          </AdminDialogBody>
          <AdminDialogFooter>
            <AdminButton variant="adminOutline" onClick={() => setShowInfoDialog(false)}>
              Cancel
            </AdminButton>
            <AdminButton variant="admin" onClick={() => setShowInfoDialog(false)}>
              Save Changes
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>
    </div>
  );
}
