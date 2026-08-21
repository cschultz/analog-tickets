import { AdminButton, AdminActionMenu, createActionItem } from "@/components/admin";
import { Mail, Phone, Eye } from "lucide-react";
import { PipelineStatusSelect } from "./PipelineStatusSelect";
import { PipelineStatus } from "./PipelineStatusBadge";

interface EntityQuickActionsProps {
  email?: string | null;
  phone?: string | null;
  pipelineStatus: PipelineStatus | null;
  onStatusChange: (status: PipelineStatus) => void;
  onView: () => void;
  onEmail?: () => void;
  disabled?: boolean;
  compact?: boolean;
}

export function EntityQuickActions({
  email,
  phone,
  pipelineStatus,
  onStatusChange,
  onView,
  onEmail,
  disabled,
  compact = false,
}: EntityQuickActionsProps) {
  // Build action items for compact mode
  const actionItems = [
    createActionItem("view", "View Details", <Eye className="w-4 h-4" />),
    ...(email ? [createActionItem("email", "Send Email", <Mail className="w-4 h-4" />)] : []),
    ...(phone ? [createActionItem("call", "Call", <Phone className="w-4 h-4" />)] : []),
  ];

  const handleActionSelect = (item: { id: string }) => {
    switch (item.id) {
      case "view":
        onView();
        break;
      case "email":
        if (onEmail) {
          onEmail();
        } else if (email) {
          window.location.href = `mailto:${email}`;
        }
        break;
      case "call":
        if (phone) {
          window.location.href = `tel:${phone}`;
        }
        break;
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <PipelineStatusSelect
          value={pipelineStatus}
          onValueChange={onStatusChange}
          disabled={disabled}
        />
        <AdminActionMenu
          items={actionItems}
          onSelect={handleActionSelect}
          size="sm"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <PipelineStatusSelect
        value={pipelineStatus}
        onValueChange={onStatusChange}
        disabled={disabled}
      />
      {email && (
        <AdminButton
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={onEmail || (() => window.location.href = `mailto:${email}`)}
          title="Send email"
        >
          <Mail className="w-4 h-4" />
        </AdminButton>
      )}
      {phone && (
        <AdminButton
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          asChild
          title="Call"
        >
          <a href={`tel:${phone}`}>
            <Phone className="w-4 h-4" />
          </a>
        </AdminButton>
      )}
      <AdminButton
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onView}
        title="View details"
      >
        <Eye className="w-4 h-4" />
      </AdminButton>
    </div>
  );
}
