import { useState } from "react";
import { X, Search, Users, Check } from "lucide-react";
import { AdminBadge, AdminButton, AdminInput, AdminScrollArea } from "@/components/admin";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmailAvatar } from "./EmailAvatar";
import { cn } from "@/lib/utils";

interface Recipient {
  id: string;
  name: string;
  email: string;
  role?: string;
  group?: string;
}

interface RecipientPillsProps {
  recipients: Recipient[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  placeholder?: string;
  maxDisplay?: number;
  className?: string;
}

export const RecipientPills = ({
  recipients,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  placeholder = "Add recipients...",
  maxDisplay = 5,
  className,
}: RecipientPillsProps) => {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  
  const selectedRecipients = recipients.filter(r => selectedIds.includes(r.id));
  const displayedRecipients = selectedRecipients.slice(0, maxDisplay);
  const hiddenCount = selectedRecipients.length - maxDisplay;
  
  const filteredRecipients = recipients.filter(r => 
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.email.toLowerCase().includes(search.toLowerCase())
  );
  
  // Group recipients by their group property
  const groupedRecipients = filteredRecipients.reduce((acc, r) => {
    const group = r.group || "Other";
    if (!acc[group]) acc[group] = [];
    acc[group].push(r);
    return acc;
  }, {} as Record<string, Recipient[]>);
  
  return (
    <div className={cn("space-y-2", className)}>
      {/* Selected Pills */}
      <div className="flex flex-wrap gap-2 min-h-[36px] p-2 bg-[hsl(var(--admin-hover))] rounded-lg border border-[hsl(var(--admin-border))]">
        {displayedRecipients.map(recipient => (
          <AdminBadge
            key={recipient.id}
            intent="neutral"
            className="gap-1.5 py-1 pl-1 pr-2 bg-[hsl(var(--admin-surface))] hover:bg-[hsl(var(--admin-hover))] transition-colors"
          >
            <EmailAvatar name={recipient.name} size="sm" className="h-5 w-5 text-[10px]" />
            <span className="max-w-[120px] truncate">{recipient.name}</span>
            <button
              onClick={() => onToggle(recipient.id)}
              className="ml-0.5 hover:bg-[hsl(var(--admin-danger)/0.1)] rounded-full p-0.5 transition-colors"
            >
              <X className="h-3 w-3 text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-danger))]" />
            </button>
          </AdminBadge>
        ))}
        
        {hiddenCount > 0 && (
          <AdminBadge intent="neutral" className="py-1">
            +{hiddenCount} more
          </AdminBadge>
        )}
        
        {selectedRecipients.length === 0 && (
          <span className="text-sm text-[hsl(var(--admin-text-muted))] py-1">
            {placeholder}
          </span>
        )}
      </div>
      
      {/* Add Recipients Button & Dropdown */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <AdminButton variant="outline" size="sm" className="gap-2">
            <Users className="h-4 w-4" />
            {selectedIds.length > 0 
              ? `${selectedIds.length} selected` 
              : "Select recipients"}
          </AdminButton>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0 bg-[hsl(var(--admin-surface))] border-[hsl(var(--admin-border))]" align="start">
          <div className="p-3 border-b border-[hsl(var(--admin-border))]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
              <AdminInput
                placeholder="Search recipients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          
          <div className="p-2 border-b border-[hsl(var(--admin-border))] flex gap-2">
            <AdminButton 
              variant="ghost" 
              size="sm" 
              onClick={onSelectAll}
              className="flex-1"
            >
              Select All
            </AdminButton>
            <AdminButton 
              variant="ghost" 
              size="sm" 
              onClick={onClearAll}
              className="flex-1"
              disabled={selectedIds.length === 0}
            >
              Clear All
            </AdminButton>
          </div>
          
          <AdminScrollArea className="h-64">
            <div className="p-2">
              {Object.entries(groupedRecipients).map(([group, groupRecipients]) => (
                <div key={group} className="mb-4 last:mb-0">
                  <p className="text-xs font-medium text-[hsl(var(--admin-text-muted))] px-2 mb-1">
                    {group}
                  </p>
                  {groupRecipients.map(recipient => {
                    const isSelected = selectedIds.includes(recipient.id);
                    return (
                      <button
                        key={recipient.id}
                        onClick={() => onToggle(recipient.id)}
                        className={cn(
                          "w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left",
                          isSelected ? "bg-[hsl(var(--admin-accent)/0.1)]" : "hover:bg-[hsl(var(--admin-hover))]"
                        )}
                      >
                        <EmailAvatar name={recipient.name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate text-[hsl(var(--admin-text))]">
                            {recipient.name}
                          </p>
                          <p className="text-xs text-[hsl(var(--admin-text-muted))] truncate">
                            {recipient.email}
                          </p>
                        </div>
                        {isSelected && (
                          <Check className="h-4 w-4 text-[hsl(var(--admin-accent))] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
              
              {filteredRecipients.length === 0 && (
                <p className="text-sm text-[hsl(var(--admin-text-muted))] text-center py-4">
                  No recipients found
                </p>
              )}
            </div>
          </AdminScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
};