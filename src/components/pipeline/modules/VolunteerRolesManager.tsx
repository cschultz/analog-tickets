import { useState, useMemo } from "react";
import {
  useVolunteerRoles,
  useCreateVolunteerRole,
  useUpdateVolunteerRole,
  useDeleteVolunteerRole,
} from "@/hooks/useVolunteerScheduling";
import {
  AdminButton,
  AdminInput,
  AdminLabel,
  AdminBadge,
  AdminConfirmDialog,
} from "@/components/admin";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
} from "@/components/admin/AdminSheet";
import {
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminDialogFooter,
} from "@/components/admin/AdminDialog";
import { AdminTextarea, AdminCheckbox } from "@/components/admin/AdminFormPrimitives";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Shield,
  Users,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface VolunteerRolesManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId?: string | null;
}

export function VolunteerRolesManager({ open, onOpenChange, eventId }: VolunteerRolesManagerProps) {
  const { data: roles = [], isLoading } = useVolunteerRoles(eventId);
  const createRole = useCreateVolunteerRole();
  const updateRole = useUpdateVolunteerRole();
  const deleteRole = useDeleteVolunteerRole();

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [newRole, setNewRole] = useState({ name: "", category: "", description: "", color: "#3b82f6", is_lead_role: false });

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, typeof roles>();
    for (const role of roles) {
      const cat = role.category || "Uncategorized";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(role);
    }
    return map;
  }, [roles]);

  const categories = useMemo(() => Array.from(grouped.keys()), [grouped]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const handleCreate = () => {
    if (!newRole.name.trim()) return;
    createRole.mutate(
      { ...newRole, event_id: eventId || undefined },
      {
        onSuccess: () => {
          setIsAddOpen(false);
          setNewRole({ name: "", category: "", description: "", color: "#3b82f6", is_lead_role: false });
        },
      }
    );
  };

  const handleUpdate = () => {
    if (!editingRole) return;
    updateRole.mutate(editingRole, { onSuccess: () => setEditingRole(null) });
  };

  const totalRoles = roles.length;
  const leadRoles = roles.filter((r) => r.is_lead_role).length;

  return (
    <>
      <AdminSheet open={open} onOpenChange={onOpenChange}>
        <AdminSheetContent side="right" className="w-[480px] overflow-y-auto">
          <AdminSheetHeader className="pb-4 border-b border-[hsl(var(--admin-border))]">
            <AdminSheetTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Volunteer Roles
            </AdminSheetTitle>
            <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">
              {totalRoles} roles across {categories.length} categories · {leadRoles} lead roles
            </p>
          </AdminSheetHeader>

          <div className="mt-4 space-y-1">
            {/* Add button */}
            <AdminButton
              variant="adminOutline"
              size="sm"
              className="w-full mb-3"
              onClick={() => setIsAddOpen(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Role
            </AdminButton>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--admin-text-muted))]" />
              </div>
            ) : (
              categories.map((cat) => {
                const catRoles = grouped.get(cat) || [];
                const isExpanded = expandedCategories.has(cat);
                const catColor = catRoles[0]?.color || "#6b7280";

                return (
                  <div key={cat} className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden">
                    {/* Category header */}
                    <AdminButton
                      variant="adminGhost"
                      onClick={() => toggleCategory(cat)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 justify-start rounded-none h-auto"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-[hsl(var(--admin-text-muted))] flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--admin-text-muted))] flex-shrink-0" />
                      )}
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: catColor }}
                      />
                      <span className="text-sm font-medium text-[hsl(var(--admin-text))] flex-1 truncate text-left">
                        {cat}
                      </span>
                      <AdminBadge intent="neutral" size="sm" className="text-[10px] px-1.5 py-0">
                        {catRoles.length}
                      </AdminBadge>
                    </AdminButton>

                    {/* Roles list */}
                    {isExpanded && (
                      <div className="border-t border-[hsl(var(--admin-border))]">
                        {catRoles.map((role) => (
                          <div
                            key={role.id}
                            className="flex items-center gap-2 px-3 py-2 pl-9 hover:bg-[hsl(var(--admin-hover))] group border-b border-[hsl(var(--admin-border))] last:border-b-0"
                          >
                            <span className="text-sm text-[hsl(var(--admin-text))] flex-1 truncate">
                              {role.name}
                            </span>
                            {role.is_lead_role && (
                              <Shield className="w-3.5 h-3.5 text-[hsl(var(--admin-warning))] flex-shrink-0" />
                            )}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <AdminButton
                                variant="adminGhost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => setEditingRole({ ...role })}
                              >
                                <Pencil className="w-3 h-3" />
                              </AdminButton>
                              <AdminButton
                                variant="adminGhost"
                                size="icon"
                                className="h-6 w-6 text-[hsl(var(--admin-error))]"
                                onClick={() => setDeleteTarget(role.id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </AdminButton>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </AdminSheetContent>
      </AdminSheet>

      {/* Add Role Dialog */}
      <AdminDialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <AdminDialogContent className="max-w-md">
          <AdminDialogHeader>
            <AdminDialogTitle>Add Volunteer Role</AdminDialogTitle>
          </AdminDialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <AdminLabel>Role Name</AdminLabel>
              <AdminInput
                value={newRole.name}
                onChange={(e) => setNewRole((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Bar Runner"
              />
            </div>
            <div className="space-y-1.5">
              <AdminLabel>Category</AdminLabel>
              <AdminInput
                value={newRole.category}
                onChange={(e) => setNewRole((p) => ({ ...p, category: e.target.value }))}
                placeholder="e.g. Beverage / Bar Support"
                list="role-categories"
              />
              <datalist id="role-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <AdminLabel>Description</AdminLabel>
              <AdminTextarea
                value={newRole.description}
                onChange={(e) => setNewRole((p) => ({ ...p, description: e.target.value }))}
                placeholder="What does this role do?"
                rows={2}
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="space-y-1.5 flex-1">
                <AdminLabel>Color</AdminLabel>
                <div className="flex items-center gap-2">
                  {/* Color picker input - exception: no AdminColorInput primitive exists */}
                  <input
                    type="color"
                    value={newRole.color}
                    onChange={(e) => setNewRole((p) => ({ ...p, color: e.target.value }))}
                    className="w-8 h-8 rounded border border-[hsl(var(--admin-border))] cursor-pointer"
                  />
                  <span className="text-xs text-[hsl(var(--admin-text-muted))]">{newRole.color}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <AdminCheckbox
                  checked={newRole.is_lead_role}
                  onCheckedChange={(c) => setNewRole((p) => ({ ...p, is_lead_role: !!c }))}
                />
                <span className="text-sm text-[hsl(var(--admin-text))]">Lead role</span>
              </div>
            </div>
          </div>
          <AdminDialogFooter>
            <AdminButton variant="adminOutline" onClick={() => setIsAddOpen(false)}>Cancel</AdminButton>
            <AdminButton variant="admin" onClick={handleCreate} disabled={createRole.isPending || !newRole.name.trim()}>
              {createRole.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Create Role
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      {/* Edit Role Dialog */}
      <AdminDialog open={!!editingRole} onOpenChange={(o) => !o && setEditingRole(null)}>
        <AdminDialogContent className="max-w-md">
          <AdminDialogHeader>
            <AdminDialogTitle>Edit Role</AdminDialogTitle>
          </AdminDialogHeader>
          {editingRole && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <AdminLabel>Role Name</AdminLabel>
                <AdminInput
                  value={editingRole.name}
                  onChange={(e) => setEditingRole((p: any) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <AdminLabel>Category</AdminLabel>
                <AdminInput
                  value={editingRole.category || ""}
                  onChange={(e) => setEditingRole((p: any) => ({ ...p, category: e.target.value }))}
                  list="edit-role-categories"
                />
                <datalist id="edit-role-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <AdminLabel>Description</AdminLabel>
                <AdminTextarea
                  value={editingRole.description || ""}
                  onChange={(e) => setEditingRole((p: any) => ({ ...p, description: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="space-y-1.5 flex-1">
                  <AdminLabel>Color</AdminLabel>
                  <div className="flex items-center gap-2">
                    {/* Color picker input - exception: no AdminColorInput primitive exists */}
                    <input
                      type="color"
                      value={editingRole.color || "#3b82f6"}
                      onChange={(e) => setEditingRole((p: any) => ({ ...p, color: e.target.value }))}
                      className="w-8 h-8 rounded border border-[hsl(var(--admin-border))] cursor-pointer"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <AdminCheckbox
                    checked={editingRole.is_lead_role}
                    onCheckedChange={(c) => setEditingRole((p: any) => ({ ...p, is_lead_role: !!c }))}
                  />
                  <span className="text-sm text-[hsl(var(--admin-text))]">Lead role</span>
                </div>
              </div>
            </div>
          )}
          <AdminDialogFooter>
            <AdminButton variant="adminOutline" onClick={() => setEditingRole(null)}>Cancel</AdminButton>
            <AdminButton variant="admin" onClick={handleUpdate} disabled={updateRole.isPending}>
              Save Changes
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      {/* Delete Confirmation */}
      <AdminConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete Role"
        description="This will permanently delete this role and remove it from any shifts. Are you sure?"
        actionLabel="Delete"
        actionType="danger"
        icon="delete"
        onConfirm={() => {
          if (deleteTarget) {
            deleteRole.mutate(deleteTarget);
            setDeleteTarget(null);
          }
        }}
      />
    </>
  );
}
