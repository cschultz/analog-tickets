import { createContext, useContext, ReactNode, useState, useCallback } from "react";
import { PipelineConfig, PipelineStage, PipelineField, usePipelineSetup } from "@/hooks/usePipelineConfig";
import { usePipelineData, PipelineRecord } from "@/hooks/usePipelineData";
import { useAdminEvent } from "@/hooks/useAdminEvent";

interface PipelineContextValue {
  // Configuration
  config: PipelineConfig | undefined;
  stages: PipelineStage[];
  fields: PipelineField[];
  tableFields: PipelineField[];
  formFields: PipelineField[];
  cardFields: PipelineField[];
  
  // Data
  records: PipelineRecord[];
  isLoading: boolean;
  
  // Selection
  selectedRecord: PipelineRecord | null;
  setSelectedRecord: (record: PipelineRecord | null) => void;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  
  // View state
  viewMode: "table" | "kanban";
  setViewMode: (mode: "table" | "kanban") => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: string | null;
  setStatusFilter: (status: string | null) => void;
  
  // Dialogs
  isAddDialogOpen: boolean;
  setIsAddDialogOpen: (open: boolean) => void;
  isEditDialogOpen: boolean;
  setIsEditDialogOpen: (open: boolean) => void;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  
  // Actions
  createRecord: (data: Partial<PipelineRecord>) => void;
  updateRecord: (data: Partial<PipelineRecord> & { id: string }) => void;
  updateStatus: (id: string, status: string) => void;
  deleteRecord: (id: string) => void;
  bulkDelete: (ids: string[]) => void;
  
  // Loading states
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  
  // Helpers
  getStage: (slug: string) => PipelineStage | undefined;
  getField: (slug: string) => PipelineField | undefined;
}

const PipelineContext = createContext<PipelineContextValue | null>(null);

interface PipelineProviderProps {
  slug: string;
  children: ReactNode;
}

export function PipelineProvider({ slug, children }: PipelineProviderProps) {
  const { selectedEvent } = useAdminEvent();
  
  // Configuration
  const {
    config,
    stages,
    fields,
    tableFields,
    formFields,
    cardFields,
    getStage,
    getField,
    isLoading: configLoading,
  } = usePipelineSetup(slug);
  
  // View state
  const [viewMode, setViewMode] = useState<"table" | "kanban">(config?.default_view || "table");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  
  // Selection state
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Dialog state
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  // Data
  const {
    records,
    isLoading: dataLoading,
    create,
    update,
    updateStatus,
    delete: deleteRecord,
    bulkDelete,
    isCreating,
    isUpdating,
    isDeleting,
  } = usePipelineData({
    config,
    eventId: selectedEvent?.id,
    searchTerm,
    statusFilter,
  });
  
  // Selection helpers
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  }, []);
  
  const selectAll = useCallback(() => {
    setSelectedIds(records.map(r => r.id));
  }, [records]);
  
  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);
  
  // Handle status update with callback
  const handleUpdateStatus = useCallback((id: string, status: string) => {
    updateStatus({ id, status });
  }, [updateStatus]);
  
  // Derive selectedRecord from records array to stay in sync after mutations
  const selectedRecord = selectedRecordId 
    ? records.find(r => r.id === selectedRecordId) || null 
    : null;
  
  const setSelectedRecord = (record: PipelineRecord | null) => {
    setSelectedRecordId(record?.id || null);
  };

  const value: PipelineContextValue = {
    config,
    stages,
    fields,
    tableFields,
    formFields,
    cardFields,
    
    records,
    isLoading: configLoading || dataLoading,
    
    selectedRecord,
    setSelectedRecord,
    selectedIds,
    setSelectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    
    viewMode,
    setViewMode,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    
    isAddDialogOpen,
    setIsAddDialogOpen,
    isEditDialogOpen,
    setIsEditDialogOpen,
    isDrawerOpen,
    setIsDrawerOpen,
    
    createRecord: create,
    updateRecord: update,
    updateStatus: handleUpdateStatus,
    deleteRecord,
    bulkDelete,
    
    isCreating,
    isUpdating,
    isDeleting,
    
    getStage,
    getField,
  };
  
  return (
    <PipelineContext.Provider value={value}>
      {children}
    </PipelineContext.Provider>
  );
}

export function usePipeline() {
  const context = useContext(PipelineContext);
  if (!context) {
    throw new Error("usePipeline must be used within a PipelineProvider");
  }
  return context;
}
