import { useState, useEffect } from "react";
import { AdminButton, AdminInput, AdminLabel, AdminTextarea } from "@/components/admin";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface ArtistOffer {
  id: string;
  artist_id: string | null;
  artist_name: string;
  performance_date: string | null;
  set_time: string | null;
  set_length_minutes: number | null;
  stage: string | null;
  offer_amount: number | null;
  status: string;
  guest_list_count: number | null;
  venue_name: string | null;
  expiration_date: string | null;
  deposit_percentage: number | null;
  additional_perks: string | null;
  merchandise_terms: string | null;
  radius_clause: string | null;
}

interface ArtistOfferEditFormProps {
  offer: ArtistOffer;
  onClose: () => void;
  onSaved: () => void;
}

const ArtistOfferEditForm = ({ offer, onClose, onSaved }: ArtistOfferEditFormProps) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    artist_name: offer.artist_name || "",
    performance_date: offer.performance_date || "",
    set_time: offer.set_time || "",
    set_length_minutes: offer.set_length_minutes?.toString() || "",
    stage: offer.stage || "",
    offer_amount: offer.offer_amount?.toString() || "",
    status: offer.status || "draft",
    guest_list_count: offer.guest_list_count?.toString() || "",
    venue_name: offer.venue_name || "",
    expiration_date: offer.expiration_date || "",
    deposit_percentage: offer.deposit_percentage?.toString() || "",
    additional_perks: offer.additional_perks || "",
    merchandise_terms: offer.merchandise_terms || "",
    radius_clause: offer.radius_clause || "",
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const updateData: any = {
        artist_name: data.artist_name,
        performance_date: data.performance_date || null,
        set_time: data.set_time || null,
        set_length_minutes: data.set_length_minutes ? parseInt(data.set_length_minutes) : null,
        stage: data.stage || null,
        offer_amount: data.offer_amount ? parseFloat(data.offer_amount) : null,
        status: data.status,
        guest_list_count: data.guest_list_count ? parseInt(data.guest_list_count) : null,
        venue_name: data.venue_name || null,
        expiration_date: data.expiration_date || null,
        deposit_percentage: data.deposit_percentage ? parseFloat(data.deposit_percentage) : null,
        additional_perks: data.additional_perks || null,
        merchandise_terms: data.merchandise_terms || null,
        radius_clause: data.radius_clause || null,
      };

      if (data.status === 'accepted' && offer.status !== 'accepted') {
        updateData.accepted_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('artist_offers')
        .update(updateData)
        .eq('id', offer.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-artist-offers'] });
      queryClient.invalidateQueries({ queryKey: ['offer-stats'] });
      toast.success("Artist offer updated successfully");
      onSaved();
      onClose();
    },
    onError: (error: any) => {
      toast.error("Failed to update: " + error.message);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.artist_name.trim()) {
      toast.error("Artist name is required");
      return;
    }
    updateMutation.mutate(formData);
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-[hsl(var(--admin-text-muted))] uppercase tracking-wide">Basic Info</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <AdminLabel htmlFor="artist_name">Artist Name *</AdminLabel>
            <AdminInput
              id="artist_name"
              value={formData.artist_name}
              onChange={(e) => handleChange("artist_name", e.target.value)}
              placeholder="Artist name"
            />
          </div>
          <div className="space-y-2">
            <AdminLabel htmlFor="status">Status</AdminLabel>
            <AdminSelect value={formData.status} onValueChange={(v) => handleChange("status", v)}>
              <AdminSelectItem value="draft">Draft</AdminSelectItem>
              <AdminSelectItem value="sent">Sent</AdminSelectItem>
              <AdminSelectItem value="accepted">Confirmed</AdminSelectItem>
              <AdminSelectItem value="declined">Declined</AdminSelectItem>
              <AdminSelectItem value="countered">Countered</AdminSelectItem>
              <AdminSelectItem value="expired">Expired</AdminSelectItem>
            </AdminSelect>
          </div>
          <div className="space-y-2">
            <AdminLabel htmlFor="venue_name">Venue</AdminLabel>
            <AdminInput
              id="venue_name"
              value={formData.venue_name}
              onChange={(e) => handleChange("venue_name", e.target.value)}
              placeholder="Venue name"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-[hsl(var(--admin-border))]" />

      {/* Performance Details */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-[hsl(var(--admin-text-muted))] uppercase tracking-wide">Performance Details</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <AdminLabel htmlFor="performance_date">Performance Date</AdminLabel>
            <AdminInput
              id="performance_date"
              type="date"
              value={formData.performance_date}
              onChange={(e) => handleChange("performance_date", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <AdminLabel htmlFor="set_time">Set Time</AdminLabel>
            <AdminInput
              id="set_time"
              value={formData.set_time}
              onChange={(e) => handleChange("set_time", e.target.value)}
              placeholder="e.g., 9:00 PM"
            />
          </div>
          <div className="space-y-2">
            <AdminLabel htmlFor="stage">Stage</AdminLabel>
            <AdminInput
              id="stage"
              value={formData.stage}
              onChange={(e) => handleChange("stage", e.target.value)}
              placeholder="e.g., Main Stage"
            />
          </div>
          <div className="space-y-2">
            <AdminLabel htmlFor="set_length_minutes">Set Length (minutes)</AdminLabel>
            <AdminInput
              id="set_length_minutes"
              type="number"
              value={formData.set_length_minutes}
              onChange={(e) => handleChange("set_length_minutes", e.target.value)}
              placeholder="60"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-[hsl(var(--admin-border))]" />

      {/* Financial Details */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-[hsl(var(--admin-text-muted))] uppercase tracking-wide">Financial Details</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <AdminLabel htmlFor="offer_amount">Offer Amount ($)</AdminLabel>
            <AdminInput
              id="offer_amount"
              type="number"
              value={formData.offer_amount}
              onChange={(e) => handleChange("offer_amount", e.target.value)}
              placeholder="5000"
            />
          </div>
          <div className="space-y-2">
            <AdminLabel htmlFor="deposit_percentage">Deposit (%)</AdminLabel>
            <AdminInput
              id="deposit_percentage"
              type="number"
              value={formData.deposit_percentage}
              onChange={(e) => handleChange("deposit_percentage", e.target.value)}
              placeholder="50"
            />
          </div>
          <div className="space-y-2">
            <AdminLabel htmlFor="guest_list_count">Guest List Count</AdminLabel>
            <AdminInput
              id="guest_list_count"
              type="number"
              value={formData.guest_list_count}
              onChange={(e) => handleChange("guest_list_count", e.target.value)}
              placeholder="4"
            />
          </div>
          <div className="space-y-2">
            <AdminLabel htmlFor="expiration_date">Offer Expires</AdminLabel>
            <AdminInput
              id="expiration_date"
              type="date"
              value={formData.expiration_date}
              onChange={(e) => handleChange("expiration_date", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-[hsl(var(--admin-border))]" />

      {/* Terms */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-[hsl(var(--admin-text-muted))] uppercase tracking-wide">Terms & Notes</h4>
        <div className="space-y-4">
          <div className="space-y-2">
            <AdminLabel htmlFor="additional_perks">Additional Perks</AdminLabel>
            <AdminTextarea
              id="additional_perks"
              value={formData.additional_perks}
              onChange={(e) => handleChange("additional_perks", e.target.value)}
              placeholder="Accommodation, meals, transportation, etc."
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <AdminLabel htmlFor="merchandise_terms">Merchandise Terms</AdminLabel>
            <AdminTextarea
              id="merchandise_terms"
              value={formData.merchandise_terms}
              onChange={(e) => handleChange("merchandise_terms", e.target.value)}
              placeholder="Artist retains 100% of merchandise sales..."
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <AdminLabel htmlFor="radius_clause">Radius Clause</AdminLabel>
            <AdminTextarea
              id="radius_clause"
              value={formData.radius_clause}
              onChange={(e) => handleChange("radius_clause", e.target.value)}
              placeholder="No performances within 100 miles for 30 days before/after..."
              rows={2}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <AdminButton type="button" variant="adminOutline" onClick={onClose}>
          Cancel
        </AdminButton>
        <AdminButton type="submit" variant="admin" disabled={updateMutation.isPending}>
          {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save Changes
        </AdminButton>
      </div>
    </form>
  );
};

export default ArtistOfferEditForm;
