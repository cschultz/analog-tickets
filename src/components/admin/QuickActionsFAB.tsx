import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, 
  X, 
  UserPlus, 
  Music, 
  Package, 
  Handshake, 
  Mail,
  Gift,
  Ticket,
  FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface QuickAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  action: () => void;
  color?: string;
}

interface QuickActionsFABProps {
  onCreateRegistration?: () => void;
  onCreateArtist?: () => void;
  onCreateVendor?: () => void;
  onCreatePartner?: () => void;
  onCreateOffer?: () => void;
  onSendEmail?: () => void;
  className?: string;
}

export function QuickActionsFAB({
  onCreateRegistration,
  onCreateArtist,
  onCreateVendor,
  onCreatePartner,
  onCreateOffer,
  onSendEmail,
  className,
}: QuickActionsFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const executeAction = useCallback((action: () => void) => {
    setIsOpen(false);
    action();
  }, []);

  const quickActions: QuickAction[] = [
    {
      id: "registration",
      label: "New Registration",
      icon: UserPlus,
      shortcut: "R",
      action: () => { if (onCreateRegistration) onCreateRegistration(); else navigate("/admin/registrations"); },
      color: "hsl(var(--admin-accent))",
    },
    {
      id: "artist",
      label: "Add Artist",
      icon: Music,
      shortcut: "A",
      action: () => { if (onCreateArtist) onCreateArtist(); else navigate("/admin/artists"); },
      color: "hsl(262, 83%, 58%)",
    },
    {
      id: "vendor",
      label: "Add Vendor",
      icon: Package,
      shortcut: "V",
      action: () => { if (onCreateVendor) onCreateVendor(); else navigate("/admin/vendors"); },
      color: "hsl(173, 58%, 39%)",
    },
    {
      id: "partner",
      label: "Add Partner",
      icon: Handshake,
      shortcut: "P",
      action: () => { if (onCreatePartner) onCreatePartner(); else navigate("/admin/partners"); },
      color: "hsl(43, 96%, 46%)",
    },
    {
      id: "offer",
      label: "Create Offer",
      icon: Gift,
      shortcut: "O",
      action: () => { if (onCreateOffer) onCreateOffer(); else navigate("/admin/offers"); },
      color: "hsl(340, 75%, 55%)",
    },
    {
      id: "email",
      label: "Send Email",
      icon: Mail,
      shortcut: "E",
      action: () => { if (onSendEmail) onSendEmail(); else navigate("/admin/emails"); },
      color: "hsl(200, 80%, 50%)",
    },
  ];


  return (
    <div className={cn("fixed bottom-6 right-6 z-50 overflow-visible", className)}>
      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Action buttons - vertical stack */}
      <div className="relative overflow-visible">
        <AnimatePresence>
          {isOpen &&
            quickActions.map((action, index) => {
              const yOffset = -((index + 1) * 56);
              return (
                <motion.div
                  key={action.id}
                  className="absolute bottom-0 right-0 flex items-center pr-1"
                  style={{ width: 'max-content' }}
                  initial={{ opacity: 0, scale: 0.3, y: 0 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    y: yOffset,
                  }}
                  exit={{ opacity: 0, scale: 0.3, y: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 20,
                    delay: index * 0.04,
                  }}
                >
                  {/* Label */}
                  <span className="mr-3 px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap shadow-lg border"
                    style={{ backgroundColor: '#ffffff', color: '#1a1a1a', borderColor: '#e5e5e5' }}>
                    {action.label}
                    {action.shortcut && (
                      <kbd className="ml-2 px-1.5 py-0.5 text-[10px] rounded"
                        style={{ backgroundColor: '#f0f0f0', color: '#333' }}>
                        {action.shortcut}
                      </kbd>
                    )}
                  </span>

                  {/* Action button */}
                  <button
                    onClick={() => executeAction(action.action)}
                    className="h-11 w-11 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110 text-white shrink-0"
                    style={{ backgroundColor: action.color }}
                  >
                    <action.icon className="h-5 w-5" />
                  </button>
                </motion.div>
              );
            })}
        </AnimatePresence>

        {/* Main FAB button */}
        <motion.button
          className={cn(
            "h-14 w-14 rounded-full flex items-center justify-center shadow-xl transition-colors",
            isOpen
              ? "bg-[hsl(var(--admin-text))] text-white"
              : "bg-[hsl(var(--admin-accent))] text-white hover:bg-[hsl(var(--admin-accent))]/90"
          )}
          onClick={toggleOpen}
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {isOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </motion.button>
      </div>

      {/* Keyboard hint */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            className="absolute -top-8 right-0 text-[10px] text-[hsl(var(--admin-text-muted))] whitespace-nowrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            Press <kbd className="px-1 py-0.5 bg-[hsl(var(--admin-hover))] rounded">N</kbd> for quick actions
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
