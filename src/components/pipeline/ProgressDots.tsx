import { Users, FileText, Files, Mail, Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

interface ProgressDotsProps {
  hasContact: boolean;
  hasContract: boolean;
  hasDocument: boolean;
  hasEmail?: boolean;
  showLabels?: boolean;
  compact?: boolean;
}

export function ProgressDots({ 
  hasContact, 
  hasContract, 
  hasDocument, 
  hasEmail,
  showLabels = false,
  compact = true
}: ProgressDotsProps) {
  const items = [
    { key: "contact", label: "Contact", done: hasContact, icon: Users },
    { key: "contract", label: "Contract", done: hasContract, icon: FileText },
    { key: "document", label: "Document", done: hasDocument, icon: Files },
  ];

  // Only show email for entities that have it
  if (typeof hasEmail === "boolean") {
    items.push({ key: "email", label: "Email", done: hasEmail, icon: Mail });
  }

  if (compact) {
    return (
      <TooltipProvider delayDuration={100}>
        <div className="flex items-center gap-1">
          {items.map(item => (
            <Tooltip key={item.key}>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "w-2 h-2 rounded-full transition-colors",
                    item.done 
                      ? "bg-[hsl(var(--admin-success))]" 
                      : "bg-[hsl(var(--admin-muted)/0.4)]"
                  )}
                />
              </TooltipTrigger>
              <TooltipContent 
                side="top" 
                className="bg-[hsl(var(--admin-overlay-bg))] border-[hsl(var(--admin-overlay-border))] text-[hsl(var(--admin-foreground))] text-xs"
              >
                {item.done ? `${item.label} ✓` : `No ${item.label.toLowerCase()}`}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {items.map(item => (
        <div
          key={item.key}
          className={cn(
            "flex items-center gap-1 text-[10px]",
            item.done 
              ? "text-[hsl(var(--admin-success))]" 
              : "text-[hsl(var(--admin-muted-foreground))]"
          )}
        >
          {item.done ? (
            <Check className="w-3 h-3" />
          ) : (
            <Circle className="w-3 h-3" />
          )}
          {showLabels && <span>{item.label}</span>}
        </div>
      ))}
    </div>
  );
}
