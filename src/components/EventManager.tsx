import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import {
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminCardTitle,
  AdminCardDescription,
  AdminConfirmDialog,
  AdminActionMenu,
  createActionItem,
  AdminButton,
  AdminInput,
  AdminTextarea,
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
  AdminDialog,
  AdminDialogContent,
  AdminDialogDescription,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminSelect,
  AdminSelectItem,
  AdminLabel,
  AdminBadge,
} from "@/components/admin";
import { InlineTextCell, InlineStatusCell } from "@/components/admin/InlineEditableCell";
import { Plus, Edit, Eye, Archive, Calendar, RotateCcw, EyeOff } from "lucide-react";
import { toast } from "sonner";

export function EventManager() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [unpublishDialogOpen, setUnpublishDialogOpen] = useState(false);
  const [eventToArchive, setEventToArchive] = useState<any>(null);
  const [eventToUnpublish, setEventToUnpublish] = useState<any>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    venue_name: "",
    venue_address: "",
    event_date: "",
    event_time: "",
    status: "draft" as "draft" | "published" | "archived",
    parking_info: "",
    check_in_instructions: "",
    additional_info: "",
  });
  const queryClient = useQueryClient();

  const { data: events, isLoading } = useAuthQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_details")
        .select("*")
        .order("event_date", { ascending: false });

      if (error) {
        console.error("Error fetching events:", error);
        throw error;
      }
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("event_details").insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event created successfully");
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create event");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const { error } = await supabase
        .from("event_details")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event updated successfully");
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setEditDialogOpen(false);
      setSelectedEvent(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update event");
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      venue_name: "",
      venue_address: "",
      event_date: "",
      event_time: "",
      status: "draft",
      parking_info: "",
      check_in_instructions: "",
      additional_info: "",
    });
  };

  const handleCreate = () => {
    createMutation.mutate(formData);
  };

  const handleEdit = (event: any) => {
    setSelectedEvent(event);
    setFormData({
      title: event.title || "",
      description: event.description || "",
      venue_name: event.venue_name || "",
      venue_address: event.venue_address || "",
      event_date: event.event_date || "",
      event_time: event.event_time || "",
      status: event.status || "draft",
      parking_info: event.parking_info || "",
      check_in_instructions: event.check_in_instructions || "",
      additional_info: event.additional_info || "",
    });
    setEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedEvent) return;
    updateMutation.mutate({ id: selectedEvent.id, data: formData });
  };

  const handleStatusChange = (eventId: string, newStatus: string) => {
    updateMutation.mutate({ 
      id: eventId, 
      data: { status: newStatus as "draft" | "published" | "archived" } 
    });
  };

  const getStatusBadge = (status: string) => {
    const intents: Record<string, { intent: "success" | "neutral" | "danger" | "warning"; label: string }> = {
      draft: { intent: "neutral", label: "Draft" },
      published: { intent: "success", label: "Published" },
      archived: { intent: "warning", label: "Archived" },
    };

    const config = intents[status] || intents.draft;
    return <AdminBadge intent={config.intent}>{config.label}</AdminBadge>;
  };

  return (
    <div className="space-y-6">
      <AdminCard>
        <AdminCardHeader
          icon={Calendar}
          action={
            <AdminButton size="sm" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Event
            </AdminButton>
          }
        >
          <div>
            <AdminCardTitle>Event Management</AdminCardTitle>
            <AdminCardDescription>
              Manage multiple events. Only published events are visible to the public.
            </AdminCardDescription>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading events...</div>
          ) : (
            <div className="overflow-x-auto">
              <AdminTable>
                <AdminTableHeader>
                  <AdminTableRow>
                    <AdminTableHead className="min-w-[150px]">Title</AdminTableHead>
                    <AdminTableHead className="min-w-[100px]">Date</AdminTableHead>
                    <AdminTableHead className="min-w-[120px] hidden sm:table-cell">Venue</AdminTableHead>
                    <AdminTableHead className="min-w-[80px]">Status</AdminTableHead>
                    <AdminTableHead className="min-w-[150px]">Actions</AdminTableHead>
                  </AdminTableRow>
                </AdminTableHeader>
                <AdminTableBody>
                  {events?.map((event) => (
                    <AdminTableRow key={event.id}>
                      <AdminTableCell className="font-medium">
                        <InlineTextCell
                          value={event.title}
                          onSave={async (value) => {
                            await updateMutation.mutateAsync({ id: event.id, data: { title: value } });
                          }}
                          placeholder="Event title..."
                        />
                      </AdminTableCell>
                      <AdminTableCell className="text-sm">
                        <InlineTextCell
                          value={event.event_date || ""}
                          type="date"
                          onSave={async (value) => {
                            await updateMutation.mutateAsync({ id: event.id, data: { event_date: value } });
                          }}
                          displayFormatter={(val) => val ? new Date(val).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" }) : "—"}
                          prefix={<Calendar className="h-3 w-3 mr-1 shrink-0" />}
                        />
                      </AdminTableCell>
                      <AdminTableCell className="hidden sm:table-cell text-sm text-[hsl(var(--admin-text-muted))]">
                        <InlineTextCell
                          value={event.venue_name || ""}
                          onSave={async (value) => {
                            await updateMutation.mutateAsync({ id: event.id, data: { venue_name: value } });
                          }}
                          placeholder="Add venue..."
                        />
                      </AdminTableCell>
                      <AdminTableCell>
                        <InlineStatusCell
                          value={event.status}
                          options={[
                            { value: "draft", label: "Draft", intent: "neutral" },
                            { value: "published", label: "Published", intent: "success" },
                            { value: "archived", label: "Archived", intent: "warning" },
                          ]}
                          onSave={async (value) => {
                            if (value === "archived" && event.status === "published") {
                              setEventToArchive(event);
                              setArchiveDialogOpen(true);
                              return;
                            }
                            if (value === "draft" && event.status === "published") {
                              setEventToUnpublish(event);
                              setUnpublishDialogOpen(true);
                              return;
                            }
                            handleStatusChange(event.id, value);
                          }}
                        />
                      </AdminTableCell>
                      <AdminTableCell>
                        <AdminButton
                          size="sm"
                          variant="outline"
                          className="h-7"
                          onClick={() => handleEdit(event)}
                          title="Edit all event details"
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Details
                        </AdminButton>
                      </AdminTableCell>
                    </AdminTableRow>
                  ))}
                  {events?.length === 0 && (
                    <AdminTableRow>
                      <AdminTableCell colSpan={5} className="text-center py-8">
                        No events found. Create your first event to get started.
                      </AdminTableCell>
                    </AdminTableRow>
                  )}
                </AdminTableBody>
              </AdminTable>
            </div>
          )}
        </AdminCardContent>
      </AdminCard>

      {/* Create/Edit Dialog */}
      <AdminDialog open={createDialogOpen || editDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setCreateDialogOpen(false);
          setEditDialogOpen(false);
          setSelectedEvent(null);
          resetForm();
        }
      }}>
        <AdminDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <AdminDialogHeader>
            <AdminDialogTitle>{selectedEvent ? "Edit Event" : "Create New Event"}</AdminDialogTitle>
            <AdminDialogDescription>
              {selectedEvent ? "Update event details" : "Add a new event to your system"}
            </AdminDialogDescription>
          </AdminDialogHeader>
          <div className="space-y-4">
            <div>
              <AdminLabel htmlFor="title">Event Title *</AdminLabel>
              <AdminInput
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Cosmico 2026"
              />
            </div>
            <div>
              <AdminLabel htmlFor="description">Description</AdminLabel>
              <AdminTextarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the event"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <AdminLabel htmlFor="event_date">Event Date *</AdminLabel>
                <AdminInput
                  id="event_date"
                  type="date"
                  value={formData.event_date}
                  onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                />
              </div>
              <div>
                <AdminLabel htmlFor="event_time">Event Time *</AdminLabel>
                <AdminInput
                  id="event_time"
                  type="time"
                  value={formData.event_time}
                  onChange={(e) => setFormData({ ...formData, event_time: e.target.value })}
                />
              </div>
            </div>
            <div>
              <AdminLabel htmlFor="venue_name">Venue Name *</AdminLabel>
              <AdminInput
                id="venue_name"
                value={formData.venue_name}
                onChange={(e) => setFormData({ ...formData, venue_name: e.target.value })}
                placeholder="e.g., Example Meadow"
              />
            </div>
            <div>
              <AdminLabel htmlFor="venue_address">Venue Address *</AdminLabel>
              <AdminInput
                id="venue_address"
                value={formData.venue_address}
                onChange={(e) => setFormData({ ...formData, venue_address: e.target.value })}
                placeholder="Full address"
              />
            </div>
            <div>
              <AdminLabel htmlFor="status">Status</AdminLabel>
              <AdminSelect value={formData.status} onValueChange={(value: any) => setFormData({ ...formData, status: value })}>
                <AdminSelectItem value="draft">Draft (Not visible to public)</AdminSelectItem>
                <AdminSelectItem value="published">Published (Live on website)</AdminSelectItem>
                <AdminSelectItem value="archived">Archived (Past event)</AdminSelectItem>
              </AdminSelect>
            </div>
            <div>
              <AdminLabel htmlFor="parking_info">Parking Information</AdminLabel>
              <AdminTextarea
                id="parking_info"
                value={formData.parking_info}
                onChange={(e) => setFormData({ ...formData, parking_info: e.target.value })}
                rows={2}
              />
            </div>
            <div>
              <AdminLabel htmlFor="check_in_instructions">Check-In Instructions</AdminLabel>
              <AdminTextarea
                id="check_in_instructions"
                value={formData.check_in_instructions}
                onChange={(e) => setFormData({ ...formData, check_in_instructions: e.target.value })}
                rows={2}
              />
            </div>
            <div>
              <AdminLabel htmlFor="additional_info">Additional Information</AdminLabel>
              <AdminTextarea
                id="additional_info"
                value={formData.additional_info}
                onChange={(e) => setFormData({ ...formData, additional_info: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <AdminDialogFooter>
            <AdminButton
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                setEditDialogOpen(false);
                setSelectedEvent(null);
                resetForm();
              }}
            >
              Cancel
            </AdminButton>
            <AdminButton
              onClick={selectedEvent ? handleUpdate : handleCreate}
              disabled={!formData.title || !formData.venue_name || !formData.venue_address || !formData.event_date || !formData.event_time}
            >
              {selectedEvent ? "Update Event" : "Create Event"}
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      {/* Archive Confirmation Dialog */}
      <AdminConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        title="Archive Event"
        description={`You are about to archive "${eventToArchive?.title}". This is a significant action.`}
        consequences={[
          "Event will no longer be visible on the public website",
          "No new ticket purchases will be possible",
          "Existing registrations and tickets will remain accessible",
          "Event data will be preserved for reporting",
          "You can restore the event by changing its status back to Draft",
        ]}
        scope="This action affects this event and all related data"
        actionType="destructive"
        actionLabel="Yes, Archive This Event"
        cancelLabel="Cancel"
        icon="archive"
        onConfirm={() => {
          if (eventToArchive) {
            handleStatusChange(eventToArchive.id, "archived");
            setArchiveDialogOpen(false);
            setEventToArchive(null);
          }
        }}
      />

      {/* Unpublish Confirmation Dialog */}
      <AdminConfirmDialog
        open={unpublishDialogOpen}
        onOpenChange={setUnpublishDialogOpen}
        title="Unpublish Event"
        description={`Are you sure you want to unpublish "${eventToUnpublish?.title}"?`}
        consequences={[
          "Event will be removed from the public website",
          "Existing registrations remain valid",
          "You can republish anytime",
        ]}
        scope="This moves the event back to Draft status"
        actionType="warning"
        actionLabel="Unpublish Event"
        icon="warning"
        onConfirm={() => {
          if (eventToUnpublish) {
            handleStatusChange(eventToUnpublish.id, "draft");
            setUnpublishDialogOpen(false);
            setEventToUnpublish(null);
          }
        }}
      />
    </div>
  );
}