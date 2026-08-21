import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminButton, AdminInput } from "@/components/admin/AdminUI";
import { AdminTextarea, AdminLabel, AdminSwitch } from "@/components/admin/AdminFormPrimitives";
import { useToast } from "@/hooks/use-toast";
import { Save, Settings } from "lucide-react";

interface SurveyConfig {
  id: string;
  title: string;
  description: string;
  overall_rating_label: string;
  food_rating_label: string;
  atmosphere_rating_label: string;
  music_rating_label: string;
  show_food_rating: boolean;
  show_atmosphere_rating: boolean;
  show_music_rating: boolean;
  favorite_part_label: string;
  favorite_part_placeholder: string;
  improvements_label: string;
  improvements_placeholder: string;
  testimonial_label: string;
  testimonial_placeholder: string;
  attend_again_text: string;
  recommend_text: string;
  show_attend_again: boolean;
  show_recommend: boolean;
}

export const SurveyEditor = () => {
  const [config, setConfig] = useState<SurveyConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const { data, error } = await supabase
      .from("survey_config")
      .select("*")
      .single();

    if (!error && data) {
      setConfig(data);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setIsSaving(true);
    const { error } = await supabase
      .from("survey_config")
      .update({
        title: config.title,
        description: config.description,
        overall_rating_label: config.overall_rating_label,
        food_rating_label: config.food_rating_label,
        atmosphere_rating_label: config.atmosphere_rating_label,
        music_rating_label: config.music_rating_label,
        show_food_rating: config.show_food_rating,
        show_atmosphere_rating: config.show_atmosphere_rating,
        show_music_rating: config.show_music_rating,
        favorite_part_label: config.favorite_part_label,
        favorite_part_placeholder: config.favorite_part_placeholder,
        improvements_label: config.improvements_label,
        improvements_placeholder: config.improvements_placeholder,
        testimonial_label: config.testimonial_label,
        testimonial_placeholder: config.testimonial_placeholder,
        attend_again_text: config.attend_again_text,
        recommend_text: config.recommend_text,
        show_attend_again: config.show_attend_again,
        show_recommend: config.show_recommend,
      })
      .eq("id", config.id);

    if (error) {
      toast({
        title: "Error saving configuration",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Survey configuration saved",
        description: "Your changes have been applied successfully",
      });
    }
    setIsSaving(false);
  };

  if (!config) {
    return <div>Loading...</div>;
  }

  return (
    <AdminCard>
      <AdminCardHeader>
        <AdminCardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Survey Configuration
        </AdminCardTitle>
      </AdminCardHeader>
      <AdminCardContent className="space-y-6">
        {/* Header Section */}
        <div className="space-y-4 p-4 rounded-lg bg-[hsl(var(--admin-surface-hover))]">
          <h3 className="font-semibold text-[hsl(var(--admin-text))]">Survey Header</h3>
          
          <div className="space-y-2">
            <AdminLabel>Survey Title</AdminLabel>
            <AdminInput
              value={config.title}
              onChange={(e) => setConfig({ ...config, title: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <AdminLabel>Survey Description</AdminLabel>
            <AdminTextarea
              value={config.description}
              onChange={(e) => setConfig({ ...config, description: e.target.value })}
              rows={2}
            />
          </div>
        </div>

        {/* Rating Categories */}
        <div className="space-y-4 p-4 rounded-lg bg-[hsl(var(--admin-surface-hover))]">
          <h3 className="font-semibold text-[hsl(var(--admin-text))]">Rating Categories</h3>
          
          <div className="space-y-2">
            <AdminLabel>Overall Experience Label (required)</AdminLabel>
            <AdminInput
              value={config.overall_rating_label}
              onChange={(e) => setConfig({ ...config, overall_rating_label: e.target.value })}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-2">
                <AdminLabel>Food & Drinks Label</AdminLabel>
                <AdminInput
                  value={config.food_rating_label}
                  onChange={(e) => setConfig({ ...config, food_rating_label: e.target.value })}
                  disabled={!config.show_food_rating}
                />
              </div>
              <div className="ml-4 flex items-center gap-2">
                <AdminLabel>Show</AdminLabel>
                <AdminSwitch
                  checked={config.show_food_rating}
                  onCheckedChange={(checked) => setConfig({ ...config, show_food_rating: checked })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-2">
                <AdminLabel>Atmosphere Label</AdminLabel>
                <AdminInput
                  value={config.atmosphere_rating_label}
                  onChange={(e) => setConfig({ ...config, atmosphere_rating_label: e.target.value })}
                  disabled={!config.show_atmosphere_rating}
                />
              </div>
              <div className="ml-4 flex items-center gap-2">
                <AdminLabel>Show</AdminLabel>
                <AdminSwitch
                  checked={config.show_atmosphere_rating}
                  onCheckedChange={(checked) => setConfig({ ...config, show_atmosphere_rating: checked })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-2">
                <AdminLabel>Music Label</AdminLabel>
                <AdminInput
                  value={config.music_rating_label}
                  onChange={(e) => setConfig({ ...config, music_rating_label: e.target.value })}
                  disabled={!config.show_music_rating}
                />
              </div>
              <div className="ml-4 flex items-center gap-2">
                <AdminLabel>Show</AdminLabel>
                <AdminSwitch
                  checked={config.show_music_rating}
                  onCheckedChange={(checked) => setConfig({ ...config, show_music_rating: checked })}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Open-Ended Questions */}
        <div className="space-y-4 p-4 rounded-lg bg-[hsl(var(--admin-surface-hover))]">
          <h3 className="font-semibold text-[hsl(var(--admin-text))]">Open-Ended Questions</h3>
          
          <div className="space-y-2">
            <AdminLabel>Favorite Part Label</AdminLabel>
            <AdminInput
              value={config.favorite_part_label}
              onChange={(e) => setConfig({ ...config, favorite_part_label: e.target.value })}
            />
            <AdminInput
              placeholder="Placeholder text"
              value={config.favorite_part_placeholder}
              onChange={(e) => setConfig({ ...config, favorite_part_placeholder: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <AdminLabel>Improvements Label</AdminLabel>
            <AdminInput
              value={config.improvements_label}
              onChange={(e) => setConfig({ ...config, improvements_label: e.target.value })}
            />
            <AdminInput
              placeholder="Placeholder text"
              value={config.improvements_placeholder}
              onChange={(e) => setConfig({ ...config, improvements_placeholder: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <AdminLabel>Testimonial Label</AdminLabel>
            <AdminInput
              value={config.testimonial_label}
              onChange={(e) => setConfig({ ...config, testimonial_label: e.target.value })}
            />
            <AdminInput
              placeholder="Placeholder text"
              value={config.testimonial_placeholder}
              onChange={(e) => setConfig({ ...config, testimonial_placeholder: e.target.value })}
            />
          </div>
        </div>

        {/* Yes/No Questions */}
        <div className="space-y-4 p-4 rounded-lg bg-[hsl(var(--admin-surface-hover))]">
          <h3 className="font-semibold text-[hsl(var(--admin-text))]">Checkbox Questions</h3>
          
          <div className="flex items-center justify-between">
            <div className="flex-1 space-y-2">
              <AdminLabel>Attend Again Text</AdminLabel>
              <AdminInput
                value={config.attend_again_text}
                onChange={(e) => setConfig({ ...config, attend_again_text: e.target.value })}
                disabled={!config.show_attend_again}
              />
            </div>
            <div className="ml-4 flex items-center gap-2">
              <AdminLabel>Show</AdminLabel>
              <AdminSwitch
                checked={config.show_attend_again}
                onCheckedChange={(checked) => setConfig({ ...config, show_attend_again: checked })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex-1 space-y-2">
              <AdminLabel>Recommend Text</AdminLabel>
              <AdminInput
                value={config.recommend_text}
                onChange={(e) => setConfig({ ...config, recommend_text: e.target.value })}
                disabled={!config.show_recommend}
              />
            </div>
            <div className="ml-4 flex items-center gap-2">
              <AdminLabel>Show</AdminLabel>
              <AdminSwitch
                checked={config.show_recommend}
                onCheckedChange={(checked) => setConfig({ ...config, show_recommend: checked })}
              />
            </div>
          </div>
        </div>

        <AdminButton
          onClick={handleSave}
          disabled={isSaving}
          className="w-full"
        >
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? "Saving..." : "Save Survey Configuration"}
        </AdminButton>
      </AdminCardContent>
    </AdminCard>
  );
};
