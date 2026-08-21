import { AdminButton } from "@/components/admin";
import { Send, SkipForward, ChevronLeft, ChevronRight, Check, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileBottomActionBarProps {
  // For individual emailer
  onSend?: () => void;
  onSkip?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  currentIndex?: number;
  totalCount?: number;
  sending?: boolean;
  isSent?: boolean;
  disabled?: boolean;
  artistName?: string;
  
  // For bulk emailer
  recipientCount?: number;
  onBulkSend?: () => void;
  
  variant?: "individual" | "bulk";
}

export function MobileBottomActionBar({
  onSend,
  onSkip,
  onPrevious,
  onNext,
  currentIndex = 0,
  totalCount = 0,
  sending = false,
  isSent = false,
  disabled = false,
  artistName,
  recipientCount = 0,
  onBulkSend,
  variant = "individual",
}: MobileBottomActionBarProps) {
  if (variant === "bulk") {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-[hsl(var(--admin-surface))] border-t border-[hsl(var(--admin-border))] p-3 z-50 md:hidden safe-area-pb">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-[hsl(var(--admin-text-muted))]">
            <Users className="h-4 w-4" />
            <span>{recipientCount} recipient(s)</span>
          </div>
          <AdminButton 
            variant="admin"
            onClick={onBulkSend} 
            disabled={sending || disabled}
            className="flex-1 max-w-[200px]"
          >
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Sending..." : "Send Now"}
          </AdminButton>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[hsl(var(--admin-surface))] border-t border-[hsl(var(--admin-border))] z-50 md:hidden safe-area-pb">
      {/* Progress bar */}
      <div className="h-1 bg-[hsl(var(--admin-hover))]">
        <div 
          className="h-full bg-[hsl(var(--admin-accent))] transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / totalCount) * 100}%` }}
        />
      </div>
      
      <div className="p-3 space-y-2">
        {/* Progress text */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-[hsl(var(--admin-text-muted))]">
            {currentIndex + 1} of {totalCount}
          </span>
          <span className="font-medium truncate max-w-[200px] text-[hsl(var(--admin-text))]">
            {artistName}
          </span>
        </div>
        
        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Navigation */}
          <div className="flex items-center gap-1">
            <AdminButton
              variant="adminOutline"
              size="icon"
              onClick={onPrevious}
              disabled={currentIndex === 0}
              className="h-10 w-10"
            >
              <ChevronLeft className="h-5 w-5" />
            </AdminButton>
            <AdminButton
              variant="adminOutline"
              size="icon"
              onClick={onNext}
              disabled={currentIndex === totalCount - 1}
              className="h-10 w-10"
            >
              <ChevronRight className="h-5 w-5" />
            </AdminButton>
          </div>

          {/* Skip button */}
          <AdminButton
            variant="adminGhost"
            size="sm"
            onClick={onSkip}
            disabled={sending || isSent}
            className="h-10"
          >
            <SkipForward className="h-4 w-4 mr-1" />
            Skip
          </AdminButton>

          {/* Send button - takes remaining space */}
          <AdminButton
            variant="admin"
            onClick={onSend}
            disabled={sending || disabled || isSent}
            className={cn(
              "flex-1 h-10",
              isSent && "bg-[hsl(var(--admin-success))] hover:bg-[hsl(var(--admin-success))]"
            )}
          >
            {sending ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                Sending...
              </>
            ) : isSent ? (
              <>
                <Check className="h-4 w-4 mr-1" />
                Sent
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1" />
                Send
              </>
            )}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
