import { useState } from "react";
import { usePipeline } from "../PipelineContext";
import { usePipelinePayments } from "@/hooks/usePipelinePayments";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminButton, AdminInput, AdminLabel } from "@/components/admin";
import { 
  DollarSign, 
  Check, 
  X, 
  Calendar,
  Loader2,
  ArrowDown,
  ArrowUp,
  Pencil
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface PaymentRowProps {
  label: string;
  amount: number | null;
  sentAt: string | null;
  notes: string | null;
  dealValue: number;
  onMark: (amount: number, notes?: string) => void;
  onClear: () => void;
  isSaving: boolean;
  variant: "deposit" | "final";
}

function PaymentRow({ 
  label, 
  amount, 
  sentAt, 
  notes,
  dealValue,
  onMark, 
  onClear,
  isSaving,
  variant
}: PaymentRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputAmount, setInputAmount] = useState(amount?.toString() || "");
  const [inputNotes, setInputNotes] = useState(notes || "");

  const isPaid = amount !== null && sentAt !== null;

  const handleSave = () => {
    const parsedAmount = parseFloat(inputAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return;
    }
    onMark(parsedAmount, inputNotes || undefined);
    setIsEditing(false);
  };

  const handleStartEdit = () => {
    // Pre-fill with suggested amount if empty
    if (!inputAmount) {
      const suggested = variant === "deposit" ? Math.round(dealValue * 0.5) : dealValue - (amount || 0);
      setInputAmount(suggested > 0 ? suggested.toString() : "");
    }
    setIsEditing(true);
  };

  const handleClear = () => {
    onClear();
    setInputAmount("");
    setInputNotes("");
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="p-3 bg-[hsl(var(--admin-surface))] rounded-lg border border-[hsl(var(--admin-border))] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[hsl(var(--admin-foreground))]">{label}</span>
          <AdminButton
            variant="adminGhost"
            size="sm"
            onClick={() => setIsEditing(false)}
            className="h-6 w-6 p-0"
          >
            <X className="w-4 h-4" />
          </AdminButton>
        </div>
        
        <div className="space-y-3">
          <div>
            <AdminLabel className="text-xs mb-1.5">Amount</AdminLabel>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--admin-muted-foreground))] text-sm z-10">$</span>
              <AdminInput
                type="number"
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
                placeholder="0.00"
                className="pl-8"
                autoFocus
              />
            </div>
          </div>
          
          <div>
            <AdminLabel className="text-xs">Notes (optional)</AdminLabel>
            <AdminInput
              value={inputNotes}
              onChange={(e) => setInputNotes(e.target.value)}
              placeholder="Check #, wire ref, etc."
            />
          </div>
        </div>

        <div className="flex gap-2">
          <AdminButton
            variant="admin"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !inputAmount}
            className="flex-1"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4 mr-1" />
                Mark as Sent
              </>
            )}
          </AdminButton>
        </div>
      </div>
    );
  }

  if (isPaid) {
    return (
      <div className="p-3 bg-[hsl(var(--admin-success)/0.1)] rounded-lg border border-[hsl(var(--admin-success)/0.3)]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[hsl(var(--admin-success))] flex items-center justify-center">
              <Check className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <span className="text-sm font-medium text-[hsl(var(--admin-foreground))]">{label}</span>
              <div className="flex items-center gap-2 text-xs text-[hsl(var(--admin-muted-foreground))]">
                <Calendar className="w-3 h-3" />
                {format(new Date(sentAt!), "MMM d, yyyy")}
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-lg font-semibold text-[hsl(var(--admin-success))]">
              ${amount?.toLocaleString()}
            </span>
            <div className="flex items-center gap-1 mt-1">
              <AdminButton
                variant="adminGhost"
                size="sm"
                onClick={handleStartEdit}
                className="h-6 px-2 text-xs"
              >
                <Pencil className="w-3 h-3 mr-1" />
                Edit
              </AdminButton>
              <AdminButton
                variant="adminGhost"
                size="sm"
                onClick={handleClear}
                className="h-6 px-2 text-xs text-[hsl(var(--admin-destructive))]"
              >
                <X className="w-3 h-3" />
              </AdminButton>
            </div>
          </div>
        </div>
        {notes && (
          <p className="mt-2 text-xs text-[hsl(var(--admin-muted-foreground))] pl-8">{notes}</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-3 bg-[hsl(var(--admin-surface))] rounded-lg border border-dashed border-[hsl(var(--admin-border))]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[hsl(var(--admin-muted))] flex items-center justify-center">
            {variant === "deposit" ? (
              <ArrowUp className="w-3.5 h-3.5 text-[hsl(var(--admin-muted-foreground))]" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-[hsl(var(--admin-muted-foreground))]" />
            )}
          </div>
          <span className="text-sm text-[hsl(var(--admin-muted-foreground))]">{label}</span>
        </div>
        <AdminButton
          variant="adminOutline"
          size="sm"
          onClick={handleStartEdit}
          className="h-7"
        >
          <DollarSign className="w-3.5 h-3.5 mr-1" />
          Record Payment
        </AdminButton>
      </div>
    </div>
  );
}

export function PipelineFinanceCard() {
  const { config, selectedRecord, fields, updateRecord, isUpdating } = usePipeline();
  const { selectedEventId } = useAdminEvent();
  
  const [isEditingDealValue, setIsEditingDealValue] = useState(false);
  const [dealValueInput, setDealValueInput] = useState("");

  const {
    payment,
    isLoading,
    isSaving,
    markDepositSent,
    markFinalSent,
    clearDeposit,
    clearFinal,
    totalPaid,
  } = usePipelinePayments({
    pipelineConfigId: config?.id,
    entityId: selectedRecord?.id,
    eventId: selectedEventId,
  });

  if (!config?.has_payments || !selectedRecord) return null;

  // Get deal value from the record
  const dealValueField = fields.find(f => f.slug === "deal_value");
  const dealValue = dealValueField ? Number(selectedRecord[dealValueField.slug] || 0) : 0;

  const remaining = dealValue - totalPaid;
  const progressPercent = dealValue > 0 ? Math.min((totalPaid / dealValue) * 100, 100) : 0;

  const handleStartEditDealValue = () => {
    setDealValueInput(dealValue > 0 ? dealValue.toString() : "");
    setIsEditingDealValue(true);
  };

  const handleSaveDealValue = () => {
    if (!selectedRecord?.id) return;
    
    const newValue = parseFloat(dealValueInput) || 0;
    updateRecord({ id: selectedRecord.id, deal_value: newValue });
    setIsEditingDealValue(false);
  };

  return (
    <AdminCard className="mt-4">
      <AdminCardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <AdminCardTitle className="flex items-center gap-2 shrink-0">
            <DollarSign className="w-4 h-4 text-[hsl(var(--admin-success))]" />
            Finance
          </AdminCardTitle>
          {isEditingDealValue ? (
            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[hsl(var(--admin-muted-foreground))] text-xs z-10">$</span>
                <AdminInput
                  type="number"
                  value={dealValueInput}
                  onChange={(e) => setDealValueInput(e.target.value)}
                  placeholder="0"
                  className="h-7 w-24 pl-5 text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveDealValue();
                    if (e.key === 'Escape') setIsEditingDealValue(false);
                  }}
                />
              </div>
              <AdminButton
                variant="adminGhost"
                size="sm"
                onClick={handleSaveDealValue}
                disabled={isUpdating}
                className="h-6 w-6 p-0"
              >
                {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              </AdminButton>
              <AdminButton
                variant="adminGhost"
                size="sm"
                onClick={() => setIsEditingDealValue(false)}
                className="h-6 w-6 p-0"
              >
                <X className="w-3 h-3" />
              </AdminButton>
            </div>
          ) : (
            <AdminButton
              variant="ghost"
              onClick={handleStartEditDealValue}
              className="h-auto p-0 text-xs text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))] hover:bg-transparent transition-colors group"
            >
              <span>Deal Value: ${dealValue.toLocaleString()}</span>
              <Pencil className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
            </AdminButton>
          )}
        </div>
      </AdminCardHeader>
      <AdminCardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--admin-muted-foreground))]" />
          </div>
        ) : (
          <>
            {/* Simplified progress display */}
            {dealValue > 0 && (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className={cn(
                    "text-lg font-semibold",
                    remaining <= 0 
                      ? "text-[hsl(var(--admin-success))]" 
                      : "text-[hsl(var(--admin-foreground))]"
                  )}>
                    ${totalPaid.toLocaleString()}
                    <span className="text-sm font-normal text-[hsl(var(--admin-muted-foreground))]"> / ${dealValue.toLocaleString()}</span>
                  </span>
                  {remaining > 0 && (
                    <span className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                      ${remaining.toLocaleString()} left
                    </span>
                  )}
                </div>
                <div className="h-1.5 bg-[hsl(var(--admin-muted)/0.3)] rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      remaining <= 0 
                        ? "bg-[hsl(var(--admin-success))]" 
                        : "bg-[hsl(var(--admin-primary))]"
                    )}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Payment rows */}
            <div className="space-y-2">
              <PaymentRow
                label="Deposit"
                amount={payment?.deposit_amount ?? null}
                sentAt={payment?.deposit_sent_at ?? null}
                notes={payment?.deposit_notes ?? null}
                dealValue={dealValue}
                onMark={markDepositSent}
                onClear={clearDeposit}
                isSaving={isSaving}
                variant="deposit"
              />
              
              <PaymentRow
                label="Final Payment"
                amount={payment?.final_amount ?? null}
                sentAt={payment?.final_sent_at ?? null}
                notes={payment?.final_notes ?? null}
                dealValue={dealValue - (payment?.deposit_amount || 0)}
                onMark={markFinalSent}
                onClear={clearFinal}
                isSaving={isSaving}
                variant="final"
              />
            </div>
          </>
        )}
      </AdminCardContent>
    </AdminCard>
  );
}
