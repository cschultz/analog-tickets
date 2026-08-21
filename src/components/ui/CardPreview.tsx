import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import { cn } from "@/lib/utils";

interface CardPreviewProps {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  openDelay?: number;
  closeDelay?: number;
  className?: string;
  disabled?: boolean;
}

export function CardPreview({
  children,
  content,
  side = "right",
  align = "start",
  sideOffset = 8,
  openDelay = 400,
  closeDelay = 100,
  className,
  disabled = false,
}: CardPreviewProps) {
  if (disabled) {
    return <>{children}</>;
  }

  return (
    <HoverCardPrimitive.Root openDelay={openDelay} closeDelay={closeDelay}>
      <HoverCardPrimitive.Trigger asChild>{children}</HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          className={cn(
            "z-50 w-80 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-4 shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2",
            "data-[side=left]:slide-in-from-right-2",
            "data-[side=right]:slide-in-from-left-2",
            "data-[side=top]:slide-in-from-bottom-2",
            className
          )}
        >
          {content}
          <HoverCardPrimitive.Arrow className="fill-[hsl(var(--admin-surface))]" />
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
}

// Preset preview content component for pipeline cards
interface PipelineCardPreviewContentProps {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  notes?: string;
  category?: string;
  value?: number;
  contacts?: Array<{ name: string; email: string; role?: string }>;
}

export function PipelineCardPreviewContent({
  name,
  company,
  email,
  phone,
  notes,
  category,
  value,
  contacts,
}: PipelineCardPreviewContentProps) {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <h4 className="font-semibold text-[hsl(var(--admin-foreground))]">
          {company || name}
        </h4>
        {company && (
          <p className="text-sm text-[hsl(var(--admin-muted-foreground))]">{name}</p>
        )}
      </div>

      {/* Quick info */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        {category && (
          <div>
            <span className="text-[hsl(var(--admin-muted-foreground))]">Category:</span>
            <span className="ml-1 text-[hsl(var(--admin-foreground))]">{category}</span>
          </div>
        )}
        {value && value > 0 && (
          <div>
            <span className="text-[hsl(var(--admin-muted-foreground))]">Value:</span>
            <span className="ml-1 font-medium text-[hsl(var(--admin-foreground))]">
              ${value.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Contact info */}
      {(email || phone) && (
        <div className="text-sm space-y-1">
          {email && (
            <p className="text-[hsl(var(--admin-muted-foreground))] truncate">{email}</p>
          )}
          {phone && (
            <p className="text-[hsl(var(--admin-muted-foreground))]">{phone}</p>
          )}
        </div>
      )}

      {/* Contacts list */}
      {contacts && contacts.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[hsl(var(--admin-muted-foreground))] mb-1">
            Contacts ({contacts.length})
          </p>
          <div className="space-y-1">
            {contacts.slice(0, 3).map((contact, idx) => (
              <div key={idx} className="text-xs">
                <span className="text-[hsl(var(--admin-foreground))]">{contact.name}</span>
                {contact.role && (
                  <span className="text-[hsl(var(--admin-muted-foreground))]">
                    {" "}
                    · {contact.role}
                  </span>
                )}
              </div>
            ))}
            {contacts.length > 3 && (
              <p className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                +{contacts.length - 3} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Notes preview */}
      {notes && (
        <div>
          <p className="text-xs font-medium text-[hsl(var(--admin-muted-foreground))] mb-1">
            Notes
          </p>
          <p className="text-xs text-[hsl(var(--admin-foreground))] line-clamp-2">
            {notes}
          </p>
        </div>
      )}
    </div>
  );
}
