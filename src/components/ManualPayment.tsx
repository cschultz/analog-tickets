import { useState } from "react";
import { AdminButton, AdminTextarea } from "@/components/admin";
import {
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
} from "@/components/admin/AdminDialog";
import { AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DollarSign, Loader2 } from "lucide-react";

interface ManualPaymentProps {
  registrationId: string;
  onComplete: () => void;
}

export const ManualPayment = ({ registrationId, onComplete }: ManualPaymentProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notes, setNotes] = useState("");

  const handleMarkAsPaid = async () => {
    if (!notes.trim()) {
      toast.error("Please add a note explaining the payment method");
      return;
    }

    setIsProcessing(true);
    
    try {
      const { error } = await supabase
        .from('registrations')
        .update({
          payment_status: 'paid',
          dietary_notes: notes // Using dietary_notes field to store payment notes
        })
        .eq('id', registrationId);

      if (error) throw error;
      
      toast.success("Registration marked as paid");
      setIsOpen(false);
      setNotes("");
      onComplete();
    } catch (error) {
      console.error('Error marking as paid:', error);
      toast.error('Failed to update payment status');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <AdminButton
        onClick={() => setIsOpen(true)}
        variant="adminOutline"
        size="sm"
        className="gap-2"
      >
        <DollarSign className="w-4 h-4" />
        Mark as Paid
      </AdminButton>

      <AdminDialog open={isOpen} onOpenChange={setIsOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>
              Mark Payment as Received
            </AdminDialogTitle>
          </AdminDialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-[hsl(var(--admin-text-muted))]">
              Use this to manually mark payments received via cash, check, or other methods.
            </p>
            
            <div className="space-y-2">
              <AdminLabel htmlFor="notes">
                Payment Notes *
              </AdminLabel>
              <AdminTextarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Example: Paid $250 cash on 1/15/2025&#10;Check #1234 received&#10;Venmo payment confirmed"
                rows={4}
              />
              <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                Include payment method, amount, date, and any reference numbers
              </p>
            </div>
            
            <div className="flex gap-2 justify-end">
              <AdminButton
                variant="adminOutline"
                onClick={() => setIsOpen(false)}
                disabled={isProcessing}
              >
                Cancel
              </AdminButton>
              <AdminButton
                variant="admin"
                onClick={handleMarkAsPaid}
                disabled={isProcessing}
              >
                {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Mark as Paid
              </AdminButton>
            </div>
          </div>
        </AdminDialogContent>
      </AdminDialog>
    </>
  );
};
