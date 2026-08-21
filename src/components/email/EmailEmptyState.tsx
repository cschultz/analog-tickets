import { Mail, Send, Inbox, PenLine } from "lucide-react";
import { AdminButton } from "@/components/admin";
import { cn } from "@/lib/utils";

interface EmailEmptyStateProps {
  type: "no-emails" | "no-recipients" | "no-templates" | "compose";
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

const defaultContent = {
  "no-emails": {
    icon: Inbox,
    title: "No emails yet",
    description: "Send your first email to start building your communication history.",
  },
  "no-recipients": {
    icon: Mail,
    title: "No recipients selected",
    description: "Select at least one recipient to send your email.",
  },
  "no-templates": {
    icon: PenLine,
    title: "No templates found",
    description: "Create a template to save time on future emails.",
  },
  compose: {
    icon: Send,
    title: "Ready to compose",
    description: "Start writing your email or select a template.",
  },
};

export const EmailEmptyState = ({
  type,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmailEmptyStateProps) => {
  const content = defaultContent[type];
  const Icon = content.icon;
  
  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-12 px-6 text-center",
      className
    )}>
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-[hsl(var(--admin-accent-muted))] rounded-full blur-xl animate-pulse" />
        <div className="relative bg-[hsl(var(--admin-hover))] rounded-full p-6">
          <Icon className="h-10 w-10 text-[hsl(var(--admin-text-muted))]" />
        </div>
      </div>
      
      <h3 className="text-lg font-semibold mb-2 text-[hsl(var(--admin-text))]">
        {title || content.title}
      </h3>
      
      <p className="text-[hsl(var(--admin-text-muted))] text-sm max-w-xs mb-6">
        {description || content.description}
      </p>
      
      {actionLabel && onAction && (
        <AdminButton variant="admin" onClick={onAction} className="gap-2">
          <Send className="h-4 w-4" />
          {actionLabel}
        </AdminButton>
      )}
    </div>
  );
};
