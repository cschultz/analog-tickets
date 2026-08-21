import { usePipeline } from "../PipelineContext";
import { AdminButton } from "@/components/admin";
import { FileText, Upload, UserPlus, Send, DollarSign } from "lucide-react";

type DrawerSection = "overview" | "marketing" | "finance";

interface DrawerQuickActionsProps {
  onNavigate: (section: DrawerSection) => void;
}

export function DrawerQuickActions({ onNavigate }: DrawerQuickActionsProps) {
  const { config, selectedRecord } = usePipeline();

  if (!config || !selectedRecord) return null;

  const hasEmail = config.has_email && !!selectedRecord.email;

  const actions = [
    {
      key: "email",
      label: "Send Email",
      icon: Send,
      enabled: hasEmail,
      primary: true,
      onClick: () => onNavigate("marketing"),
    },
    {
      key: "contact",
      label: "Contact",
      icon: UserPlus,
      enabled: config.has_contacts,
      primary: false,
      onClick: () => onNavigate("marketing"),
    },
    {
      key: "contract",
      label: "Contract",
      icon: FileText,
      enabled: config.has_contracts,
      primary: false,
      onClick: () => onNavigate("finance"),
    },
    {
      key: "payment",
      label: "Payment",
      icon: DollarSign,
      enabled: config.has_payments,
      primary: false,
      onClick: () => onNavigate("finance"),
    },
  ].filter(a => a.enabled);

  if (actions.length === 0) return null;

  const primaryAction = actions.find(a => a.primary);
  const secondaryActions = actions.filter(a => !a.primary);

  return (
    <div className="flex items-center gap-2">
      {primaryAction && (
        <AdminButton
          variant="admin"
          size="sm"
          onClick={primaryAction.onClick}
          className="h-8 px-4 text-sm"
        >
          <primaryAction.icon className="w-3.5 h-3.5 mr-1.5" />
          {primaryAction.label}
        </AdminButton>
      )}

      {secondaryActions.length > 0 && (
        <>
          {primaryAction && (
            <span className="h-4 w-px bg-[hsl(var(--admin-border)/0.5)]" />
          )}
          <div className="flex items-center gap-1">
            {secondaryActions.map(action => (
              <AdminButton
                key={action.key}
                variant="adminOutline"
                size="sm"
                onClick={action.onClick}
                className="h-7 px-2.5 text-xs"
              >
                <action.icon className="w-3.5 h-3.5 mr-1" />
                {action.label}
              </AdminButton>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
