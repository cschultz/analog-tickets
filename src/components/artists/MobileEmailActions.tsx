/**
 * MobileEmailActions
 * 
 * Bottom action bar for mobile email composer.
 * Single primary CTA with secondary actions in overflow menu.
 * Follows Admin Mobile UX: calm, one action at a time.
 * 
 * ADMIN STYLE GUIDE COMPLIANCE:
 * - Uses AdminButton for all interactive elements
 * - All colors from admin tokens
 * - Sheet for mobile overlay (per Mobile Guidelines)
 * - No custom button implementations
 */

import { useState } from "react";
import { Send, MoreHorizontal, SkipForward, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  AdminButton,
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
} from "@/components/admin";

interface MobileEmailActionsProps {
  onSend: () => void;
  onSkip: () => void;
  onPrevious: () => void;
  onNext: () => void;
  currentIndex: number;
  totalCount: number;
  sending: boolean;
  isSent: boolean;
  disabled: boolean;
}

export function MobileEmailActions({
  onSend,
  onSkip,
  onPrevious,
  onNext,
  currentIndex,
  totalCount,
  sending,
  isSent,
  disabled,
}: MobileEmailActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < totalCount - 1;

  return (
    <>
      {/* Fixed Bottom Bar */}
      <div className={cn(
        "fixed bottom-0 left-0 right-0",
        "bg-[hsl(var(--admin-surface))]",
        "border-t border-[hsl(var(--admin-border))]",
        "px-4 py-3",
        "safe-area-pb",
        "md:hidden z-50"
      )}>
        <div className="flex items-center gap-3">
          {/* Navigation & Progress (Subtle) */}
          <div className="flex items-center gap-1">
            <AdminButton
              variant="adminGhost"
              size="icon"
              onClick={onPrevious}
              disabled={!canGoPrevious}
              className="h-10 w-10"
            >
              <ChevronLeft className="h-5 w-5" />
            </AdminButton>
            <span className="text-xs text-[hsl(var(--admin-text-muted))] tabular-nums min-w-[3rem] text-center">
              {currentIndex + 1} / {totalCount}
            </span>
            <AdminButton
              variant="adminGhost"
              size="icon"
              onClick={onNext}
              disabled={!canGoNext}
              className="h-10 w-10"
            >
              <ChevronRight className="h-5 w-5" />
            </AdminButton>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Overflow Menu */}
          <AdminButton
            variant="adminGhost"
            size="icon"
            onClick={() => setMenuOpen(true)}
            disabled={isSent}
            className="h-10 w-10"
          >
            <MoreHorizontal className="h-5 w-5" />
          </AdminButton>

          {/* Primary CTA - Using AdminButton admin variant (neutral, not orange) */}
          <AdminButton
            variant={isSent ? "admin" : "admin"}
            onClick={onSend}
            disabled={sending || disabled || isSent}
            className={cn(
              "h-11 px-6",
              isSent && "bg-[hsl(var(--admin-success))] hover:bg-[hsl(var(--admin-success))]"
            )}
          >
            {sending ? (
              <>
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                <span>Sending</span>
              </>
            ) : isSent ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                <span>Sent</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                <span>Send</span>
              </>
            )}
          </AdminButton>
        </div>
      </div>

      {/* Overflow Menu Sheet (Mobile Overlay pattern) */}
      <AdminSheet open={menuOpen} onOpenChange={setMenuOpen}>
        <AdminSheetContent 
          side="bottom" 
          className="h-auto p-0 rounded-t-xl"
        >
          <AdminSheetHeader className="p-4 border-b border-[hsl(var(--admin-border))]">
            <AdminSheetTitle className="text-base font-medium">
              More Actions
            </AdminSheetTitle>
          </AdminSheetHeader>
          
          <div className="py-2">
            <AdminButton
              variant="adminGhost"
              onClick={() => {
                onSkip();
                setMenuOpen(false);
              }}
              className="w-full justify-start h-auto px-4 py-3 rounded-none"
            >
              <SkipForward className="h-5 w-5 text-[hsl(var(--admin-text-muted))] mr-3" />
              <div className="text-left">
                <div className="font-medium text-[hsl(var(--admin-text))]">Skip this artist</div>
                <div className="text-xs text-[hsl(var(--admin-text-muted))]">
                  Move to next without sending
                </div>
              </div>
            </AdminButton>
          </div>
          
          {/* Safe area padding */}
          <div className="h-safe-area-b" />
        </AdminSheetContent>
      </AdminSheet>
    </>
  );
}
