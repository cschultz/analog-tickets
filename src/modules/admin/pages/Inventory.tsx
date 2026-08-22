import { useAdminEvent } from "@/hooks/useAdminEvent";
import { TicketInventoryManager } from "@/components/TicketInventoryManager";
import { AccommodationInventoryManager } from "@/components/AccommodationInventoryManager";
import { AddOnInventoryManager } from "@/components/AddOnInventoryManager";
import CustomOfferManager from "@/components/CustomOfferManager";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Package } from "lucide-react";

export default function InventoryPage() {
  const { selectedEventId, selectedEvent, isLoading: eventLoading } = useAdminEvent();

  if (eventLoading || !selectedEventId) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          icon={Package}
          title="Inventory"
          subtitle="Manage tickets, accommodations, and add-ons for each event"
        />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[hsl(var(--admin-primary))]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Package}
        title="Inventory"
        subtitle="Manage tickets, accommodations, and add-ons for each event"
      />

      <div className="space-y-6">
        <TicketInventoryManager 
          eventId={selectedEventId} 
          eventTitle={selectedEvent?.title}
        />
        <AccommodationInventoryManager
          eventId={selectedEventId}
          eventTitle={selectedEvent?.title}
        />
        <AddOnInventoryManager
          eventId={selectedEventId}
          eventTitle={selectedEvent?.title}
        />
        <CustomOfferManager eventId={selectedEventId} />
      </div>
    </div>
  );
}
