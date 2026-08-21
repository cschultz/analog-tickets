import { useState } from "react";
import { AdminButton } from "@/components/admin";
import {
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminDialogDescription,
} from "@/components/admin/AdminDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, UserCheck, Download, Loader2 } from "lucide-react";

interface Registration {
  id: string;
  name: string;
  email: string;
  checked_in: boolean | null;
}

interface BulkOperationsProps {
  selectedIds: string[];
  registrations: Registration[];
  onComplete: () => void;
}

export const BulkOperations = ({ selectedIds, registrations, onComplete }: BulkOperationsProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirm, setShowConfirm] = useState<"email" | "checkin" | "export" | null>(null);

  const selectedRegs = registrations.filter(r => selectedIds.includes(r.id));

  const handleBulkEmail = async () => {
    setIsProcessing(true);
    try {
      const results = await Promise.allSettled(
        selectedRegs.map(reg =>
          supabase.functions.invoke('send-ticket-email', {
            body: { registrationId: reg.id }
          })
        )
      );
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      toast.success(`Sent ${successful} of ${selectedRegs.length} emails`);
      onComplete();
    } catch (error) {
      toast.error('Failed to send bulk emails');
    } finally {
      setIsProcessing(false);
      setShowConfirm(null);
    }
  };

  const handleBulkCheckIn = async () => {
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('registrations')
        .update({ 
          checked_in: true, 
          checked_in_at: new Date().toISOString() 
        })
        .in('id', selectedIds);

      if (error) throw error;
      
      toast.success(`Checked in ${selectedIds.length} attendees`);
      onComplete();
    } catch (error) {
      toast.error('Failed to check in attendees');
    } finally {
      setIsProcessing(false);
      setShowConfirm(null);
    }
  };

  const handleBulkExport = () => {
    const headers = ['Name', 'Email', 'Check-In Status'];
    const csvData = selectedRegs.map(reg => [
      reg.name,
      reg.email,
      reg.checked_in ? 'Checked In' : 'Not Checked In'
    ]);

    const csv = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selected-registrations-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    toast.success(`Exported ${selectedIds.length} registrations`);
    setShowConfirm(null);
  };

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <AdminButton
          onClick={() => setShowConfirm("email")}
          disabled={selectedIds.length === 0 || isProcessing}
          variant="adminOutline"
          className="gap-2"
        >
          <Mail className="w-4 h-4" />
          Resend Emails ({selectedIds.length})
        </AdminButton>
        
        <AdminButton
          onClick={() => setShowConfirm("checkin")}
          disabled={selectedIds.length === 0 || isProcessing}
          variant="adminOutline"
          className="gap-2"
        >
          <UserCheck className="w-4 h-4" />
          Bulk Check-In ({selectedIds.length})
        </AdminButton>
        
        <AdminButton
          onClick={() => setShowConfirm("export")}
          disabled={selectedIds.length === 0}
          variant="adminOutline"
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Export Selected ({selectedIds.length})
        </AdminButton>
      </div>

      <AdminDialog open={showConfirm !== null} onOpenChange={() => setShowConfirm(null)}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Confirm Bulk Operation</AdminDialogTitle>
            <AdminDialogDescription>
              {showConfirm === "email" && `Send confirmation emails to ${selectedIds.length} selected attendees?`}
              {showConfirm === "checkin" && `Check in ${selectedIds.length} selected attendees?`}
              {showConfirm === "export" && `Export ${selectedIds.length} selected registrations to CSV?`}
            </AdminDialogDescription>
          </AdminDialogHeader>
          <div className="flex gap-2 justify-end">
            <AdminButton variant="adminOutline" onClick={() => setShowConfirm(null)}>
              Cancel
            </AdminButton>
            <AdminButton
              variant="admin"
              onClick={() => {
                if (showConfirm === "email") handleBulkEmail();
                if (showConfirm === "checkin") handleBulkCheckIn();
                if (showConfirm === "export") handleBulkExport();
              }}
              disabled={isProcessing}
            >
              {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm
            </AdminButton>
          </div>
        </AdminDialogContent>
      </AdminDialog>
    </>
  );
};
