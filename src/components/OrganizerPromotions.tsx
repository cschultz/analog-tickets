import { useCallback } from "react";
import { OrganizerPromotionPanel } from "./OrganizerPromotionPanel";
import { supabase } from "@/lib/public-supabase-client";
import { organizerPromotions } from "@/lib/organizer-promotions.functions";
import type { PromotionInput, PromotionResult } from "@/lib/organizer-promotions-core";
export function OrganizerPromotions({
  eventId,
  eventName,
  userId,
}: {
  eventId: string;
  eventName: string;
  userId: string;
}) {
  const request = useCallback(
    async (input: PromotionInput): Promise<PromotionResult> => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session || session.user.id !== userId) return { ok: false, code: "unavailable" };
      return organizerPromotions({
        data: input,
        headers: { authorization: `Bearer ${session.access_token}` },
      });
    },
    [userId],
  );
  return (
    <OrganizerPromotionPanel
      key={`${userId}:${eventId}`}
      eventId={eventId}
      eventName={eventName}
      request={request}
    />
  );
}
