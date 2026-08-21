import { AdminButton, AdminBadge } from "@/components/admin/AdminUI";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { CheckCircle, XCircle, Mail, Download } from "lucide-react";

interface ArtistBulkActionsProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkStatusChange: (status: string) => void;
  onBulkEmail: () => void;
  onExport: () => void;
}

const ArtistBulkActions = ({
  selectedCount,
  onClearSelection,
  onBulkStatusChange,
  onBulkEmail,
  onExport,
}: ArtistBulkActionsProps) => {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky bottom-4 z-20 mx-auto max-w-3xl">
      <div className="bg-[hsl(var(--admin-primary))] text-[hsl(var(--admin-primary-foreground))] rounded-lg shadow-lg p-4 flex items-center justify-between gap-4 animate-in slide-in-from-bottom-4">
        <div className="flex items-center gap-3">
          <AdminBadge intent="info" className="text-lg px-3 py-1">
            {selectedCount}
          </AdminBadge>
          <span className="font-medium">
            artist{selectedCount !== 1 ? 's' : ''} selected
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk Status Change */}
          <AdminSelect onValueChange={onBulkStatusChange} placeholder="Set Status" className="w-[140px] bg-[hsl(var(--admin-primary-foreground))] text-[hsl(var(--admin-primary))] border-0">
            <AdminSelectItem value="draft">
              <span className="flex items-center gap-2">Draft</span>
            </AdminSelectItem>
            <AdminSelectItem value="sent">
              <span className="flex items-center gap-2">Sent</span>
            </AdminSelectItem>
            <AdminSelectItem value="accepted">
              <span className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-[hsl(var(--admin-success))]" />
                Confirmed
              </span>
            </AdminSelectItem>
            <AdminSelectItem value="declined">
              <span className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-[hsl(var(--admin-danger))]" />
                Declined
              </span>
            </AdminSelectItem>
          </AdminSelect>

          {/* Bulk Email */}
          <AdminButton 
            variant="adminOutline" 
            size="sm"
            onClick={onBulkEmail}
            className="gap-2 border-[hsl(var(--admin-primary-foreground))] text-[hsl(var(--admin-primary-foreground))] hover:bg-[hsl(var(--admin-primary-foreground))]/20"
          >
            <Mail className="h-4 w-4" />
            Email All
          </AdminButton>

          {/* Export */}
          <AdminButton 
            variant="adminOutline" 
            size="sm"
            onClick={onExport}
            className="gap-2 border-[hsl(var(--admin-primary-foreground))] text-[hsl(var(--admin-primary-foreground))] hover:bg-[hsl(var(--admin-primary-foreground))]/20"
          >
            <Download className="h-4 w-4" />
            Export
          </AdminButton>

          {/* Clear */}
          <AdminButton 
            variant="adminGhost" 
            size="sm"
            onClick={onClearSelection}
            className="text-[hsl(var(--admin-primary-foreground))] hover:bg-[hsl(var(--admin-primary-foreground))]/20"
          >
            Clear
          </AdminButton>
        </div>
      </div>
    </div>
  );
};

export default ArtistBulkActions;
