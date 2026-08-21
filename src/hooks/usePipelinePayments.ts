import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PipelinePayment {
  id: string;
  pipeline_config_id: string;
  entity_id: string;
  event_id: string | null;
  deposit_amount: number | null;
  deposit_sent_at: string | null;
  deposit_notes: string | null;
  final_amount: number | null;
  final_sent_at: string | null;
  final_notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

interface UsePipelinePaymentsParams {
  pipelineConfigId: string | undefined;
  entityId: string | undefined;
  eventId: string | null | undefined;
}

export function usePipelinePayments({
  pipelineConfigId,
  entityId,
  eventId,
}: UsePipelinePaymentsParams) {
  const queryClient = useQueryClient();
  const queryKey = ["pipeline-payment", pipelineConfigId, entityId, eventId];

  // Fetch payment record
  const { data: payment, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!pipelineConfigId || !entityId) return null;

      let query = supabase
        .from("pipeline_payments")
        .select("*")
        .eq("pipeline_config_id", pipelineConfigId)
        .eq("entity_id", entityId);
      
      // Handle null event_id - use is null filter
      if (eventId) {
        query = query.eq("event_id", eventId);
      } else {
        query = query.is("event_id", null);
      }

      const { data, error } = await query.maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching pipeline payment:", error);
        throw error;
      }

      return data as PipelinePayment | null;
    },
    enabled: !!pipelineConfigId && !!entityId,
  });

  // Create or update payment record
  const upsertMutation = useMutation({
    mutationFn: async (updates: Partial<PipelinePayment>) => {
      if (!pipelineConfigId || !entityId) throw new Error("Missing required IDs");

      const payload = {
        pipeline_config_id: pipelineConfigId,
        entity_id: entityId,
        event_id: eventId || null,
        ...updates,
      };

      const { data, error } = await supabase
        .from("pipeline_payments")
        .upsert(payload, {
          onConflict: "pipeline_config_id,entity_id,event_id",
        })
        .select()
        .single();

      if (error) throw error;
      return data as PipelinePayment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Payment info saved");
    },
    onError: (error) => {
      console.error("Error saving payment:", error);
      toast.error("Failed to save payment info");
    },
  });

  // Mark deposit as sent
  const markDepositSent = (amount: number, notes?: string) => {
    upsertMutation.mutate({
      deposit_amount: amount,
      deposit_sent_at: new Date().toISOString(),
      deposit_notes: notes || null,
    });
  };

  // Mark final payment as sent
  const markFinalSent = (amount: number, notes?: string) => {
    upsertMutation.mutate({
      final_amount: amount,
      final_sent_at: new Date().toISOString(),
      final_notes: notes || null,
    });
  };

  // Clear deposit
  const clearDeposit = () => {
    upsertMutation.mutate({
      deposit_amount: null,
      deposit_sent_at: null,
      deposit_notes: null,
    });
  };

  // Clear final payment
  const clearFinal = () => {
    upsertMutation.mutate({
      final_amount: null,
      final_sent_at: null,
      final_notes: null,
    });
  };

  // Calculate totals
  const totalPaid = (payment?.deposit_amount || 0) + (payment?.final_amount || 0);

  return {
    payment,
    isLoading,
    isSaving: upsertMutation.isPending,
    markDepositSent,
    markFinalSent,
    clearDeposit,
    clearFinal,
    update: upsertMutation.mutate,
    totalPaid,
  };
}
