/**
 * DrawerEmptyState
 * 
 * Contextual empty states for drawer module sections.
 */

import { AdminButton } from "@/components/admin";
import { 
  Users, 
  FileText, 
  Files, 
  Mail, 
  FolderOpen,
  Plus,
  Upload,
  Send,
  UserPlus
} from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateType = "contacts" | "contracts" | "documents" | "assets" | "email";

const EMPTY_STATES: Record<EmptyStateType, {
  icon: React.ElementType;
  title: string;
  description: string;
  actionLabel: string;
  actionIcon: React.ElementType;
}> = {
  contacts: {
    icon: Users,
    title: "No contacts added",
    description: "Add a point of contact — agent, manager, or the person directly.",
    actionLabel: "Add Contact",
    actionIcon: UserPlus,
  },
  contracts: {
    icon: FileText,
    title: "No contracts yet",
    description: "Create and track contracts, offers, or agreements here.",
    actionLabel: "Create Contract",
    actionIcon: Plus,
  },
  documents: {
    icon: Files,
    title: "No documents uploaded",
    description: "Upload riders, W-9s, insurance certificates, or any relevant files.",
    actionLabel: "Upload Document",
    actionIcon: Upload,
  },
  assets: {
    icon: FolderOpen,
    title: "No assets collected",
    description: "Photos, logos, bios, and stage plots will appear here.",
    actionLabel: "Upload Asset",
    actionIcon: Upload,
  },
  email: {
    icon: Mail,
    title: "No emails sent",
    description: "Send offers, confirmations, or follow-ups directly from here.",
    actionLabel: "Compose Email",
    actionIcon: Send,
  },
};

interface DrawerEmptyStateProps {
  type: EmptyStateType;
  onAction?: () => void;
  className?: string;
}

export function DrawerEmptyState({ type, onAction, className }: DrawerEmptyStateProps) {
  const state = EMPTY_STATES[type];
  if (!state) return null;
  const Icon = state.icon;
  const ActionIcon = state.actionIcon;

  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-12 px-6 text-center",
      "border border-dashed border-[hsl(var(--admin-border))] rounded-lg",
      "bg-[hsl(var(--admin-surface)/0.5)]",
      className
    )}>
      <div className="w-12 h-12 rounded-full bg-[hsl(var(--admin-muted)/0.15)] flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-[hsl(var(--admin-muted-foreground))]" />
      </div>
      <p className="text-sm font-medium text-[hsl(var(--admin-foreground))] mb-1">
        {state.title}
      </p>
      <p className="text-xs text-[hsl(var(--admin-muted-foreground))] max-w-[240px] mb-4">
        {state.description}
      </p>
      {onAction && (
        <AdminButton
          variant="adminOutline"
          size="sm"
          onClick={onAction}
          className="h-8 text-xs"
        >
          <ActionIcon className="w-3.5 h-3.5 mr-1.5" />
          {state.actionLabel}
        </AdminButton>
      )}
    </div>
  );
}