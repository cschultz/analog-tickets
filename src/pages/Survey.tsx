import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Star } from "lucide-react";

interface SurveyConfig {
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

const RatingStars = ({ value, onChange, label }: { value: number; onChange: (val: number) => void; label: string }) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          onClick={() => onChange(rating)}
          className="transition-transform hover:scale-110"
        >
          <Star
            className={`w-8 h-8 ${rating <= value ? "fill-[#C7A97A] text-[#C7A97A]" : "text-gray-300"}`}
          />
        </button>
      ))}
    </div>
  </div>
);

export default function Survey() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const regId = searchParams.get("reg");
  const emailParam = searchParams.get("email");
  const nameParam = searchParams.get("name");

  const [config, setConfig] = useState<SurveyConfig | null>(null);
  const [formData, setFormData] = useState({
    email: emailParam || "",
    name: nameParam || "",
    overall_rating: 0,
    food_rating: 0,
    atmosphere_rating: 0,
    music_rating: 0,
    favorite_part: "",
    improvements: "",
    testimonial: "",
    would_attend_again: true,
    would_recommend: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.overall_rating === 0) {
      toast({
        title: "Please rate your experience",
        description: "Overall rating is required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.from("survey_responses").insert({
      registration_id: regId || null,
      email: formData.email,
      name: formData.name,
      overall_rating: formData.overall_rating,
      food_rating: formData.food_rating || null,
      atmosphere_rating: formData.atmosphere_rating || null,
      music_rating: formData.music_rating || null,
      favorite_part: formData.favorite_part || null,
      improvements: formData.improvements || null,
      testimonial: formData.testimonial || null,
      would_attend_again: formData.would_attend_again,
      would_recommend: formData.would_recommend,
    });

    if (error) {
      toast({
        title: "Error submitting survey",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Thank you!",
        description: "Your feedback has been submitted successfully",
      });
      setTimeout(() => navigate("/"), 2000);
    }

    setIsSubmitting(false);
  };

  if (!config) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(to bottom, #F9F7F4, #F3EEE6)" }}>
      <div className="container max-w-2xl mx-auto py-12 px-4">
        <Card style={{ background: "rgba(255, 255, 255, 0.9)", borderColor: "#D1C2AE" }}>
          <CardHeader className="text-center">
            <CardTitle className="text-3xl" style={{ color: "#322821" }}>
              {config.title}
            </CardTitle>
            <p className="text-sm mt-2" style={{ color: "#7B6E61" }}>
              {config.description}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Your name"
                    autoComplete="name"
                    name="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    required
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="your@email.com"
                    autoComplete="email"
                    name="email"
                  />
                </div>
              </div>

              <div className="space-y-4 p-4 rounded-lg" style={{ background: "#F9F7F4" }}>
                <h3 className="font-semibold" style={{ color: "#322821" }}>Rate Your Experience</h3>
                
                <RatingStars
                  label={`${config.overall_rating_label} *`}
                  value={formData.overall_rating}
                  onChange={(val) => setFormData({ ...formData, overall_rating: val })}
                />

                {config.show_food_rating && (
                  <RatingStars
                    label={config.food_rating_label}
                    value={formData.food_rating}
                    onChange={(val) => setFormData({ ...formData, food_rating: val })}
                  />
                )}

                {config.show_atmosphere_rating && (
                  <RatingStars
                    label={config.atmosphere_rating_label}
                    value={formData.atmosphere_rating}
                    onChange={(val) => setFormData({ ...formData, atmosphere_rating: val })}
                  />
                )}

                {config.show_music_rating && (
                  <RatingStars
                    label={config.music_rating_label}
                    value={formData.music_rating}
                    onChange={(val) => setFormData({ ...formData, music_rating: val })}
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label>{config.favorite_part_label}</Label>
                <Textarea
                  value={formData.favorite_part}
                  onChange={(e) => setFormData({ ...formData, favorite_part: e.target.value })}
                  placeholder={config.favorite_part_placeholder}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>{config.improvements_label}</Label>
                <Textarea
                  value={formData.improvements}
                  onChange={(e) => setFormData({ ...formData, improvements: e.target.value })}
                  placeholder={config.improvements_placeholder}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>{config.testimonial_label}</Label>
                <Textarea
                  value={formData.testimonial}
                  onChange={(e) => setFormData({ ...formData, testimonial: e.target.value })}
                  placeholder={config.testimonial_placeholder}
                  rows={3}
                />
              </div>

              {(config.show_attend_again || config.show_recommend) && (
                <div className="space-y-3 p-4 rounded-lg" style={{ background: "#F9F7F4" }}>
                  {config.show_attend_again && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.would_attend_again}
                        onChange={(e) => setFormData({ ...formData, would_attend_again: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span style={{ color: "#322821" }}>{config.attend_again_text}</span>
                    </label>
                  )}

                  {config.show_recommend && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.would_recommend}
                        onChange={(e) => setFormData({ ...formData, would_recommend: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span style={{ color: "#322821" }}>{config.recommend_text}</span>
                    </label>
                  )}
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full"
                style={{ background: "#C7A97A", color: "#F3EEE6" }}
              >
                {isSubmitting ? "Submitting..." : "Submit Feedback"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
