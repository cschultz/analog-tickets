import {
  AdminCard,
  AdminCardContent,
  AdminCardDescription,
  AdminCardHeader,
  AdminCardTitle,
} from "@/components/admin/AdminCard";
import { AdminCollapsible, AdminCollapsibleTrigger, AdminCollapsibleContent } from "@/components/admin/AdminCollapsible";
import { Database, Upload } from "lucide-react";
import { SyncPendingCheckouts } from "@/components/SyncPendingCheckouts";

export function DataToolsCard() {
  return (
    <AdminCard>
      <AdminCardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
          <AdminCardTitle className="text-base font-semibold">Data Tools</AdminCardTitle>
        </div>
        <AdminCardDescription className="text-xs">
          Sync utilities (rarely needed)
        </AdminCardDescription>
      </AdminCardHeader>
      <AdminCardContent>
        <AdminCollapsible>
          <AdminCollapsibleTrigger>
            <span className="flex items-center gap-2 text-[hsl(var(--admin-text-secondary))]">
              <Upload className="h-4 w-4" />
              Sync Tools
            </span>
          </AdminCollapsibleTrigger>
          <AdminCollapsibleContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <SyncPendingCheckouts />
            </div>
          </AdminCollapsibleContent>
        </AdminCollapsible>
      </AdminCardContent>
    </AdminCard>
  );
}
