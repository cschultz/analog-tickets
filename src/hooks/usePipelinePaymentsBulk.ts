import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";

interface PaymentSummary {
  deposit_amount: number | null;
  deposit_sent_at: string | null;
  final_amount: number | null;
  final_sent_at: string | null;
}

/**
 * Fetch payment data for multiple pipeline records at once
 * Used for table views to show deposit/payment status
 */
export function usePipelinePaymentsBulk({
  pipelineConfigId,
  entityIds,
  eventId,
}: {
  pipelineConfigId: string | undefined;
  entityIds: string[];
  eventId: string | null | undefined;
}) {
  return useAuthQuery({
    queryKey: ["pipeline-payments-bulk", pipelineConfigId, entityIds.join(","), eventId],
    queryFn: async () => {
      if (!pipelineConfigId || entityIds.length === 0) return {};

      let query = supabase
        .from("pipeline_payments")
        .select("entity_id, deposit_amount, deposit_sent_at, final_amount, final_sent_at")
        .eq("pipeline_config_id", pipelineConfigId)
        .in("entity_id", entityIds);

      if (eventId) {
        query = query.eq("event_id", eventId);
      } else {
        query = query.is("event_id", null);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching bulk payments:", error);
        return {};
      }

      // Map by entity_id for quick lookup
      const result: Record<string, PaymentSummary> = {};
      for (const payment of data || []) {
        result[payment.entity_id] = {
          deposit_amount: payment.deposit_amount,
          deposit_sent_at: payment.deposit_sent_at,
          final_amount: payment.final_amount,
          final_sent_at: payment.final_sent_at,
        };
      }

      return result;
    },
    enabled: !!pipelineConfigId && entityIds.length > 0,
  });
}
