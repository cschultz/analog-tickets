import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import {
  AdminCard,
  AdminCardContent,
  AdminCardDescription,
  AdminCardHeader,
  AdminCardTitle,
} from "@/components/admin/AdminCard";
import { AdminSwitch, AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { Home } from "lucide-react";
import { toast } from "sonner";

interface LodgingSettings {
  id: string;
  lodging_enabled: boolean;
  lodging_invite_enabled: boolean;
}

export function LodgingSettingsCard() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useAuthQuery({
    queryKey: ["lodging-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lodging_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("Error fetching lodging settings:", error);
        throw error;
      }
      return data as LodgingSettings | null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<LodgingSettings>) => {
      if (!settings?.id) {
        // Create if doesn't exist
        const { error } = await supabase
          .from("lodging_settings")
          .insert(updates);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("lodging_settings")
          .update(updates)
          .eq("id", settings.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lodging-settings"] });
      toast.success("Lodging settings updated");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update settings");
    },
  });

  if (isLoading) {
    return (
      <AdminCard>
        <AdminCardContent className="py-8 text-center text-[hsl(var(--admin-text-muted))]">
          Loading...
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <AdminCard>
      <AdminCardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Home className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
          <AdminCardTitle className="text-base font-semibold">Lodging</AdminCardTitle>
        </div>
        <AdminCardDescription className="text-xs">
          Control lodging availability in checkout and invite-only access
        </AdminCardDescription>
      </AdminCardHeader>
      <AdminCardContent className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--admin-border))]">
          <div className="space-y-0.5">
            <AdminLabel>Enable lodging in public checkout</AdminLabel>
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">
              Allow guests to add accommodations during ticket purchase
            </p>
          </div>
          <AdminSwitch
            checked={settings?.lodging_enabled ?? false}
            onCheckedChange={(checked) =>
              updateMutation.mutate({ lodging_enabled: checked })
            }
            disabled={updateMutation.isPending}
          />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--admin-border))]">
          <div className="space-y-0.5">
            <AdminLabel>Allow invite-only lodging offers</AdminLabel>
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">
              Enable creating custom offers that unlock lodging access
            </p>
          </div>
          <AdminSwitch
            checked={settings?.lodging_invite_enabled ?? false}
            onCheckedChange={(checked) =>
              updateMutation.mutate({ lodging_invite_enabled: checked })
            }
            disabled={updateMutation.isPending}
          />
        </div>
      </AdminCardContent>
    </AdminCard>
  );
}
