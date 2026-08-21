import { supabase } from "@/integrations/supabase/client";

export interface EventAddonStats {
  revenue: number;
  count: number;
}

export async function fetchEventAddonStats(eventId: string): Promise<EventAddonStats> {
  const { data: inventoryRows, error: inventoryError } = await supabase
    .from("addon_inventory")
    .select("id")
    .eq("event_id", eventId);

  if (inventoryError) {
    throw inventoryError;
  }

  const inventoryIds = (inventoryRows || []).map((row) => row.id);

  if (!inventoryIds.length) {
    return { revenue: 0, count: 0 };
  }

  const { data: purchases, error: purchasesError } = await supabase
    .from("addon_purchases")
    .select("total_amount, quantity")
    .in("inventory_id", inventoryIds)
    .eq("payment_status", "paid");

  if (purchasesError) {
    throw purchasesError;
  }

  return {
    revenue: (purchases || []).reduce((sum, purchase) => sum + (purchase.total_amount || 0), 0),
    count: (purchases || []).reduce((sum, purchase) => sum + (purchase.quantity || 1), 0),
  };
}