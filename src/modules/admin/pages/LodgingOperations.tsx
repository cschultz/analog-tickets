import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { 
  AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle 
} from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin";
import { LodgingSettingsCard } from "@/components/admin/LodgingSettingsCard";
import { LodgingPendingAssignments } from "@/components/admin/LodgingPendingAssignments";
import { NotificationControls } from "@/components/admin/lodging";
import { LodgingManifestExport } from "@/components/admin/lodging/LodgingManifestExport";
import { useIsMobile } from "@/hooks/use-mobile";
import { AdminSelect, AdminSelectItem } from "@/components/admin";
import {
  ClipboardList,
  Settings,
  BedDouble,
  Bell,
  FileDown,
} from "lucide-react";

const TABS = [
  { value: "assignments", label: "Assignments", icon: ClipboardList, description: "Pending unit assignments" },
  { value: "manifest", label: "Venue Manifest", icon: FileDown, description: "Export PDF/CSV for the venue" },
  { value: "notifications", label: "Guest Notifications", icon: Bell, description: "Send unit assignment emails" },
  { value: "settings", label: "Settings", icon: Settings, description: "Lodging preferences" },
];

export default function LodgingOperationsPage() {
  const [activeTab, setActiveTab] = useState("assignments");
  const isMobile = useIsMobile();

  // Fetch booking data for notifications tab
  const { data: bookingAssignments } = useAuthQuery({
    queryKey: ["lodging-booking-assignments-ops"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lodging_bookings")
        .select(`
          id,
          assigned_unit_id,
          email,
          zone_key,
          registration_id,
          payment_status,
          assignment_status,
          created_at,
          guest_notified,
          notified_at,
          assignee_type,
          assignee_name,
          registrations!lodging_bookings_registration_id_fkey(name),
          accommodation_units!lodging_bookings_assigned_unit_id_fkey(
            unit_name,
            product_type
          )
        `)
        .in("payment_status", ["completed", "paid", "comp"]);
      if (error) {
        console.error("Error fetching booking assignments:", error);
        throw error;
      }
      return data;
    },
    staleTime: 30 * 1000,
  });

  return (
    <div className="space-y-4 md:space-y-6">
      <AdminPageHeader
        icon={BedDouble}
        title="Lodging Operations"
        subtitle="Manage assignments, waitlist invitations, and lodging settings"
      />

      <AdminTabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {isMobile ? (
          <AdminSelect value={activeTab} onValueChange={setActiveTab}>
            {TABS.map((tab) => (
              <AdminSelectItem key={tab.value} value={tab.value}>
                <div className="flex items-center gap-2">
                  <tab.icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  <span className="text-xs text-[hsl(var(--admin-text-muted))] ml-1">— {tab.description}</span>
                </div>
              </AdminSelectItem>
            ))}
          </AdminSelect>
        ) : (
          <AdminTabsList className="grid w-full grid-cols-4">
            {TABS.map((tab) => (
              <AdminTabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
                <tab.icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </AdminTabsTrigger>
            ))}
          </AdminTabsList>
        )}

        <AdminTabsContent value="assignments" className="mt-4 md:mt-6 space-y-4">
          <LodgingPendingAssignments />
        </AdminTabsContent>

        <AdminTabsContent value="manifest" className="mt-4 md:mt-6 space-y-4">
          <LodgingManifestExport />
        </AdminTabsContent>

        <AdminTabsContent value="notifications" className="mt-4 md:mt-6 space-y-4">
          <AdminCard>
            <AdminCardHeader icon={Bell}>
              <AdminCardTitle>Assignment Email Notifications</AdminCardTitle>
              <AdminCardDescription>
                Send unit assignment emails to guests. These should only be sent ~2 weeks before the event 
                once all assignments are finalized.
              </AdminCardDescription>
            </AdminCardHeader>
            <AdminCardContent className="pt-0">
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm mb-4">
                <strong>Note:</strong> Guests don't see their unit assignment until you send these notifications. 
                This allows you to move people around like Tetris until you're ready to lock in assignments.
              </div>
            </AdminCardContent>
          </AdminCard>
          
          {bookingAssignments && bookingAssignments.length > 0 ? (
            <NotificationControls bookings={bookingAssignments as any} />
          ) : (
            <AdminCard>
              <AdminCardContent className="py-8 text-center text-[hsl(var(--admin-text-muted))]">
                No bookings with unit assignments yet
              </AdminCardContent>
            </AdminCard>
          )}
        </AdminTabsContent>

        <AdminTabsContent value="settings" className="mt-4 md:mt-6 space-y-4">
          <LodgingSettingsCard />
        </AdminTabsContent>
      </AdminTabs>
    </div>
  );
}
