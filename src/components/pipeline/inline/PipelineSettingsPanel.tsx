import { useState, useEffect, useCallback, useRef } from "react";
import { PipelineConfig, PipelineStage } from "@/hooks/usePipelineConfig";
import { useUpdatePipelineConfig } from "@/hooks/usePipelineAdmin";
import { usePipelineStages } from "@/hooks/usePipelineConfig";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
} from "@/components/admin/AdminSheet";
import { AdminInput, AdminLabel, AdminButton } from "@/components/admin";
import { AdminCheckbox } from "@/components/admin/AdminFormPrimitives";
import { Settings2, Table, Columns, Users, FileText, Mail, Folder, Check, Loader2, Layers, Sliders } from "lucide-react";
import { StageListEditor } from "./StageListEditor";
import { FieldListEditor } from "./FieldListEditor";
import { cn } from "@/lib/utils";

interface PipelineSettingsPanelProps {
  config: PipelineConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ConfigState = {
  name: string;
  description: string;
  hasContacts: boolean;
  hasContracts: boolean;
  hasDocuments: boolean;
  hasEmail: boolean;
  hasOwnership: boolean;
  hasKanban: boolean;
  defaultView: "table" | "kanban";
};

export function PipelineSettingsPanel({ config, open, onOpenChange }: PipelineSettingsPanelProps) {
  const { data: stages = [] } = usePipelineStages(config.id);
  
  const [state, setState] = useState<ConfigState>({
    name: config.name,
    description: config.description || "",
    hasContacts: config.has_contacts,
    hasContracts: config.has_contracts,
    hasDocuments: config.has_documents,
    hasEmail: config.has_email,
    hasOwnership: config.has_ownership,
    hasKanban: config.has_kanban,
    defaultView: config.default_view,
  });
  
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<ConfigState>(state);

  const updateConfig = useUpdatePipelineConfig();

  // Reset form when config changes from external source
  useEffect(() => {
    const newState = {
      name: config.name,
      description: config.description || "",
      hasContacts: config.has_contacts,
      hasContracts: config.has_contracts,
      hasDocuments: config.has_documents,
      hasEmail: config.has_email,
      hasOwnership: config.has_ownership,
      hasKanban: config.has_kanban,
      defaultView: config.default_view,
    };
    setState(newState);
    lastSavedRef.current = newState;
  }, [config]);

  const saveChanges = useCallback((currentState: ConfigState) => {
    setSaveStatus("saving");
    updateConfig.mutate(
      {
        id: config.id,
        name: currentState.name,
        name_singular: config.name_singular,
        name_plural: config.name_plural,
        description: currentState.description || null,
        has_contacts: currentState.hasContacts,
        has_contracts: currentState.hasContracts,
        has_documents: currentState.hasDocuments,
        has_email: currentState.hasEmail,
        has_ownership: currentState.hasOwnership,
        has_kanban: currentState.hasKanban,
        default_view: currentState.defaultView,
      },
      {
        onSuccess: () => {
          lastSavedRef.current = currentState;
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        },
        onError: () => {
          setSaveStatus("idle");
        },
      }
    );
  }, [config.id, config.name_singular, config.name_plural, updateConfig]);

  // Debounced auto-save
  const updateField = useCallback(<K extends keyof ConfigState>(field: K, value: ConfigState[K]) => {
    setState((prev) => {
      const newState = { ...prev, [field]: value };
      
      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      
      // Check if there are actual changes
      const hasChanges = JSON.stringify(newState) !== JSON.stringify(lastSavedRef.current);
      
      if (hasChanges) {
        // Debounce save by 800ms
        debounceRef.current = setTimeout(() => {
          saveChanges(newState);
        }, 800);
      }
      
      return newState;
    });
  }, [saveChanges]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <AdminSheet open={open} onOpenChange={onOpenChange}>
      <AdminSheetContent side="right" className="w-[400px] overflow-y-auto">
        <AdminSheetHeader className="pb-4 border-b border-[hsl(var(--admin-border))]">
          <div className="flex items-center justify-between">
            <AdminSheetTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              {state.name} Settings
            </AdminSheetTitle>
            {/* Auto-save status indicator */}
            <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--admin-muted-foreground))]">
              {saveStatus === "saving" && (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Saving...</span>
                </>
              )}
              {saveStatus === "saved" && (
                <>
                  <Check className="w-3 h-3 text-[hsl(var(--admin-success))]" />
                  <span className="text-[hsl(var(--admin-success))]">Saved</span>
                </>
              )}
            </div>
          </div>
        </AdminSheetHeader>

        <div className="mt-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--admin-muted-foreground))]">
              Basic Information
            </h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <AdminLabel htmlFor="pipeline-name">Name</AdminLabel>
                <AdminInput
                  id="pipeline-name"
                  value={state.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="Pipeline name"
                />
              </div>
              <div className="space-y-1.5">
                <AdminLabel htmlFor="pipeline-description">Description</AdminLabel>
                <AdminInput
                  id="pipeline-description"
                  value={state.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder="Optional description"
                />
              </div>
            </div>
          </div>

          <div className="h-px bg-[hsl(var(--admin-border))]" />

          {/* View Options */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--admin-muted-foreground))]">
              View Options
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => updateField("hasKanban", !state.hasKanban)}>
                <AdminCheckbox
                  checked={state.hasKanban}
                  onCheckedChange={(checked) => updateField("hasKanban", !!checked)}
                />
                <div className="flex items-center gap-2">
                  <Columns className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
                  <span className="text-sm text-[hsl(var(--admin-foreground))]">
                    Enable Kanban view
                  </span>
                </div>
              </div>

              {state.hasKanban && (
                <div className="ml-7 space-y-2">
                  <AdminLabel>Default View</AdminLabel>
                  <div className="inline-flex rounded-md border border-[hsl(var(--admin-border))] p-0.5 bg-[hsl(var(--admin-surface))]">
                    <AdminButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => updateField("defaultView", "table")}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 h-auto rounded text-xs font-medium transition-colors",
                        state.defaultView === "table"
                          ? "bg-[hsl(var(--admin-foreground))] text-[hsl(var(--admin-surface))] hover:bg-[hsl(var(--admin-foreground))]"
                          : "text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))]"
                      )}
                    >
                      <Table className="w-3.5 h-3.5" />
                      Table
                    </AdminButton>
                    <AdminButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => updateField("defaultView", "kanban")}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 h-auto rounded text-xs font-medium transition-colors",
                        state.defaultView === "kanban"
                          ? "bg-[hsl(var(--admin-foreground))] text-[hsl(var(--admin-surface))] hover:bg-[hsl(var(--admin-foreground))]"
                          : "text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))]"
                      )}
                    >
                      <Columns className="w-3.5 h-3.5" />
                      Kanban
                    </AdminButton>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="h-px bg-[hsl(var(--admin-border))]" />

          {/* Pipeline Stages */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--admin-muted-foreground))] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Pipeline Stages
            </h3>
            <StageListEditor pipelineId={config.id} stages={stages} />
          </div>

          <div className="h-px bg-[hsl(var(--admin-border))]" />

          {/* Custom Fields */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--admin-muted-foreground))] flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              Custom Fields
            </h3>
            <FieldListEditor pipelineId={config.id} />
          </div>

          <div className="h-px bg-[hsl(var(--admin-border))]" />

          {/* Modules */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--admin-muted-foreground))]">
              Enabled Modules
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => updateField("hasContacts", !state.hasContacts)}>
                <AdminCheckbox
                  checked={state.hasContacts}
                  onCheckedChange={(checked) => updateField("hasContacts", !!checked)}
                />
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
                  <span className="text-sm text-[hsl(var(--admin-foreground))]">
                    Contacts
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 cursor-pointer" onClick={() => updateField("hasContracts", !state.hasContracts)}>
                <AdminCheckbox
                  checked={state.hasContracts}
                  onCheckedChange={(checked) => updateField("hasContracts", !!checked)}
                />
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
                  <span className="text-sm text-[hsl(var(--admin-foreground))]">
                    Contracts
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 cursor-pointer" onClick={() => updateField("hasDocuments", !state.hasDocuments)}>
                <AdminCheckbox
                  checked={state.hasDocuments}
                  onCheckedChange={(checked) => updateField("hasDocuments", !!checked)}
                />
                <div className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
                  <span className="text-sm text-[hsl(var(--admin-foreground))]">
                    Documents
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 cursor-pointer" onClick={() => updateField("hasEmail", !state.hasEmail)}>
                <AdminCheckbox
                  checked={state.hasEmail}
                  onCheckedChange={(checked) => updateField("hasEmail", !!checked)}
                />
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
                  <span className="text-sm text-[hsl(var(--admin-foreground))]">
                    Email
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 cursor-pointer" onClick={() => updateField("hasOwnership", !state.hasOwnership)}>
                <AdminCheckbox
                  checked={state.hasOwnership}
                  onCheckedChange={(checked) => updateField("hasOwnership", !!checked)}
                />
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
                  <span className="text-sm text-[hsl(var(--admin-foreground))]">
                    Ownership & Collaborators
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AdminSheetContent>
    </AdminSheet>
  );
}
