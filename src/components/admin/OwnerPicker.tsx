import { useState } from "react";
import { cn } from "@/lib/utils";
import { PersonAvatar, PersonAvatarGroup, PersonBadge } from "./PersonAvatar";
import { AdminButton } from "./AdminUI";
import { AdminSelect, AdminSelectItem } from "./AdminSelect";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAdminUsers, AdminProfile } from "@/hooks/useEntityOwnership";
import { UserPlus, X, Users, ChevronDown } from "lucide-react";

interface OwnerPickerProps {
  ownerId: string | null;
  onOwnerChange: (ownerId: string | null) => void;
  collaboratorIds: string[];
  onAddCollaborator: (id: string) => void;
  onRemoveCollaborator: (id: string) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

export function OwnerPicker({
  ownerId,
  onOwnerChange,
  collaboratorIds,
  onAddCollaborator,
  onRemoveCollaborator,
  disabled = false,
  compact = false,
  className,
}: OwnerPickerProps) {
  const { data: admins = [], isLoading } = useAdminUsers();
  const [collaboratorOpen, setCollaboratorOpen] = useState(false);

  const owner = admins.find((a) => a.id === ownerId);
  const collaborators = admins.filter((a) => collaboratorIds.includes(a.id));
  const availableCollaborators = admins.filter(
    (a) => a.id !== ownerId && !collaboratorIds.includes(a.id)
  );

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="h-6 w-6 rounded-full bg-[hsl(var(--admin-hover))] animate-pulse" />
        <span className="text-xs text-[hsl(var(--admin-text-muted))]">Loading...</span>
      </div>
    );
  }

  if (compact) {
    // Compact mode: just show avatar(s) with tooltip
    const allPeople = [
      ...(owner ? [{ name: owner.full_name || owner.email, email: owner.email }] : []),
      ...collaborators.map((c) => ({ name: c.full_name || c.email, email: c.email })),
    ];

    if (allPeople.length === 0) {
      return (
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "h-6 w-6 rounded-full border border-dashed border-[hsl(var(--admin-border))] flex items-center justify-center text-[hsl(var(--admin-text-muted))] hover:border-[hsl(var(--admin-text-tertiary))] hover:text-[hsl(var(--admin-text-tertiary))] transition-colors",
                className
              )}
              disabled={disabled}
            >
              <UserPlus className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-3">
            <OwnerPickerContent
              admins={admins}
              ownerId={ownerId}
              onOwnerChange={onOwnerChange}
              collaboratorIds={collaboratorIds}
              onAddCollaborator={onAddCollaborator}
              onRemoveCollaborator={onRemoveCollaborator}
              disabled={disabled}
            />
          </PopoverContent>
        </Popover>
      );
    }

    return (
      <Popover>
        <PopoverTrigger asChild>
          <button className={cn("focus:outline-none", className)} disabled={disabled}>
            <PersonAvatarGroup people={allPeople} max={3} size="xs" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-3">
          <OwnerPickerContent
            admins={admins}
            ownerId={ownerId}
            onOwnerChange={onOwnerChange}
            collaboratorIds={collaboratorIds}
            onAddCollaborator={onAddCollaborator}
            onRemoveCollaborator={onRemoveCollaborator}
            disabled={disabled}
          />
        </PopoverContent>
      </Popover>
    );
  }

  // Full mode: show inline UI
  return (
    <div className={cn("space-y-3", className)}>
      <OwnerPickerContent
        admins={admins}
        ownerId={ownerId}
        onOwnerChange={onOwnerChange}
        collaboratorIds={collaboratorIds}
        onAddCollaborator={onAddCollaborator}
        onRemoveCollaborator={onRemoveCollaborator}
        disabled={disabled}
      />
    </div>
  );
}

interface OwnerPickerContentProps {
  admins: AdminProfile[];
  ownerId: string | null;
  onOwnerChange: (id: string | null) => void;
  collaboratorIds: string[];
  onAddCollaborator: (id: string) => void;
  onRemoveCollaborator: (id: string) => void;
  disabled: boolean;
}

function OwnerPickerContent({
  admins,
  ownerId,
  onOwnerChange,
  collaboratorIds,
  onAddCollaborator,
  onRemoveCollaborator,
  disabled,
}: OwnerPickerContentProps) {
  const owner = admins.find((a) => a.id === ownerId);
  const collaborators = admins.filter((a) => collaboratorIds.includes(a.id));
  const availableCollaborators = admins.filter(
    (a) => a.id !== ownerId && !collaboratorIds.includes(a.id)
  );

  return (
    <div className="space-y-3">
      {/* Owner Section */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-medium text-[hsl(var(--admin-text-muted))] uppercase tracking-wide">
          Owner
        </span>
        <AdminSelect
          value={ownerId || "unassigned"}
          onValueChange={(val) => onOwnerChange(val === "unassigned" ? null : val)}
          disabled={disabled}
        >
          <AdminSelectItem value="unassigned">
            <span className="text-[hsl(var(--admin-text-muted))]">Unassigned</span>
          </AdminSelectItem>
          {admins.map((admin) => (
            <AdminSelectItem key={admin.id} value={admin.id}>
              <div className="flex items-center gap-2">
                <PersonAvatar name={admin.full_name || admin.email} size="xs" />
                <span>{admin.full_name || admin.email}</span>
              </div>
            </AdminSelectItem>
          ))}
        </AdminSelect>
      </div>

      {/* Collaborators Section */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-medium text-[hsl(var(--admin-text-muted))] uppercase tracking-wide flex items-center gap-1.5">
          <Users className="h-3 w-3" />
          Collaborators
        </span>
        
        {collaborators.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {collaborators.map((collab) => (
              <PersonBadge
                key={collab.id}
                name={collab.full_name || collab.email}
                onRemove={disabled ? undefined : () => onRemoveCollaborator(collab.id)}
              />
            ))}
          </div>
        )}
        
        {availableCollaborators.length > 0 && (
          <AdminSelect
            value=""
            onValueChange={(val) => {
              if (val) onAddCollaborator(val);
            }}
            disabled={disabled}
          >
            <AdminSelectItem value="" disabled>
              <span className="text-[hsl(var(--admin-text-muted))]">Add collaborator...</span>
            </AdminSelectItem>
            {availableCollaborators.map((admin) => (
              <AdminSelectItem key={admin.id} value={admin.id}>
                <div className="flex items-center gap-2">
                  <PersonAvatar name={admin.full_name || admin.email} size="xs" />
                  <span>{admin.full_name || admin.email}</span>
                </div>
              </AdminSelectItem>
            ))}
          </AdminSelect>
        )}
        
        {collaborators.length === 0 && availableCollaborators.length === 0 && (
          <p className="text-xs text-[hsl(var(--admin-text-muted))]">No other admins available</p>
        )}
      </div>
    </div>
  );
}

// Compact inline display for tables/cards - just shows avatars
interface OwnerDisplayProps {
  ownerId: string | null;
  collaboratorIds: string[];
  showTooltip?: boolean;
  className?: string;
}

export function OwnerDisplay({ ownerId, collaboratorIds, showTooltip = true, className }: OwnerDisplayProps) {
  const { data: admins = [] } = useAdminUsers();
  
  const owner = admins.find((a) => a.id === ownerId);
  const collaborators = admins.filter((a) => collaboratorIds.includes(a.id));
  
  const allPeople = [
    ...(owner ? [{ name: owner.full_name || owner.email, email: owner.email }] : []),
    ...collaborators.map((c) => ({ name: c.full_name || c.email, email: c.email })),
  ];

  if (allPeople.length === 0) {
    return (
      <div className={cn("h-5 w-5 rounded-full border border-dashed border-[hsl(var(--admin-border))] flex items-center justify-center text-[hsl(var(--admin-text-muted))]", className)}>
        <UserPlus className="h-2.5 w-2.5" />
      </div>
    );
  }

  return (
    <PersonAvatarGroup 
      people={allPeople} 
      max={2} 
      size="xs" 
      className={className}
    />
  );
}
