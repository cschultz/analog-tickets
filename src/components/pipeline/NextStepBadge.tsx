import { usePipeline } from "./PipelineContext";
import { cn } from "@/lib/utils";
import { Mail, FileText, UserPlus } from "lucide-react";

interface NextStepBadgeProps {
  stageSlug: string;
  hasContact: boolean;
  hasContract: boolean;
  hasEmail: boolean;
  compact?: boolean;
}

const stepConfig = {
  contact: { label: "Add contact", icon: UserPlus },
  email: { label: "Email", icon: Mail },
  contract: { label: "Contract", icon: FileText },
};

export function NextStepBadge({ 
  stageSlug, 
  hasContact, 
  hasContract, 
  hasEmail,
  compact = false 
}: NextStepBadgeProps) {
  const { stages } = usePipeline();
  
  const stageIndex = stages.findIndex(s => s.slug === stageSlug);
  const isEarlyStage = stageIndex >= 0 && stageIndex < 2; // Lead, Contacted
  const isMidStage = stageIndex >= 2 && stageIndex < stages.length - 2; // Negotiating, etc.
  
  // Determine next step based on stage and progress
  let stepKey: keyof typeof stepConfig | null = null;
  
  if (isEarlyStage) {
    if (!hasContact) {
      stepKey = "contact";
    } else if (!hasEmail) {
      stepKey = "email";
    }
  } else if (isMidStage) {
    if (!hasContract) {
      stepKey = "contract";
    }
  }

  if (!stepKey) return null;

  const step = stepConfig[stepKey];
  const Icon = step.icon;

  if (compact) {
    return (
      <span className={cn(
        "inline-flex items-center gap-1 text-[9px] font-medium",
        "text-[hsl(var(--admin-warning))]"
      )}>
        <Icon className="w-2.5 h-2.5" />
        {step.label}
      </span>
    );
  }

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium",
      "bg-[hsl(var(--admin-warning)/0.1)] text-[hsl(var(--admin-warning))] border border-[hsl(var(--admin-warning)/0.2)]"
    )}>
      <Icon className="w-3 h-3" />
      {step.label}
    </span>
  );
}
