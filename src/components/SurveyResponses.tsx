import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminBadge } from "@/components/admin/AdminUI";
import { Star, ThumbsUp, TrendingUp } from "lucide-react";
import { format } from "date-fns";

interface SurveyResponse {
  id: string;
  name: string;
  email: string;
  overall_rating: number;
  food_rating: number | null;
  atmosphere_rating: number | null;
  music_rating: number | null;
  favorite_part: string | null;
  improvements: string | null;
  testimonial: string | null;
  would_attend_again: boolean;
  would_recommend: boolean;
  created_at: string;
}

const StarDisplay = ({ rating }: { rating: number | null }) => {
  if (!rating) return <span className="text-gray-400">N/A</span>;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-4 h-4 ${star <= rating ? "fill-[#C7A97A] text-[#C7A97A]" : "text-gray-300"}`}
        />
      ))}
    </div>
  );
};

export const SurveyResponses = () => {
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchResponses();
  }, []);

  const fetchResponses = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("survey_responses")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setResponses(data);
    }
    setIsLoading(false);
  };

  const avgRating = (field: keyof SurveyResponse) => {
    const ratings = responses
      .map((r) => r[field])
      .filter((r): r is number => typeof r === "number" && r > 0);
    if (ratings.length === 0) return 0;
    return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
  };

  const percentageYes = (field: "would_attend_again" | "would_recommend") => {
    if (responses.length === 0) return 0;
    const yes = responses.filter((r) => r[field]).length;
    return Math.round((yes / responses.length) * 100);
  };

  if (isLoading) {
    return <div>Loading survey responses...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <AdminCard>
          <AdminCardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-5 h-5 text-[hsl(var(--admin-accent))]" />
              <span className="text-sm font-medium text-[hsl(var(--admin-text-muted))]">Overall Rating</span>
            </div>
            <div className="text-3xl font-bold text-[hsl(var(--admin-text))]">
              {avgRating("overall_rating")}
            </div>
            <div className="flex mt-1">
              <StarDisplay rating={Math.round(Number(avgRating("overall_rating")))} />
            </div>
          </AdminCardContent>
        </AdminCard>

        <AdminCard>
          <AdminCardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-[hsl(var(--admin-accent))]" />
              <span className="text-sm font-medium text-[hsl(var(--admin-text-muted))]">Total Responses</span>
            </div>
            <div className="text-3xl font-bold text-[hsl(var(--admin-text))]">
              {responses.length}
            </div>
          </AdminCardContent>
        </AdminCard>

        <AdminCard>
          <AdminCardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <ThumbsUp className="w-5 h-5 text-[hsl(var(--admin-accent))]" />
              <span className="text-sm font-medium text-[hsl(var(--admin-text-muted))]">Would Attend Again</span>
            </div>
            <div className="text-3xl font-bold text-[hsl(var(--admin-text))]">
              {percentageYes("would_attend_again")}%
            </div>
          </AdminCardContent>
        </AdminCard>

        <AdminCard>
          <AdminCardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <ThumbsUp className="w-5 h-5 text-[hsl(var(--admin-accent))]" />
              <span className="text-sm font-medium text-[hsl(var(--admin-text-muted))]">Would Recommend</span>
            </div>
            <div className="text-3xl font-bold text-[hsl(var(--admin-text))]">
              {percentageYes("would_recommend")}%
            </div>
          </AdminCardContent>
        </AdminCard>
      </div>

      {/* Individual Responses */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle>Individual Responses</AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4">
          {responses.length === 0 ? (
            <p className="text-[hsl(var(--admin-text-muted))]">No survey responses yet.</p>
          ) : (
            responses.map((response) => (
              <div
                key={response.id}
                className="p-4 rounded-lg space-y-3 bg-[hsl(var(--admin-surface-hover))] border-l-4 border-[hsl(var(--admin-accent))]"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-[hsl(var(--admin-text))]">{response.name}</p>
                    <p className="text-sm text-[hsl(var(--admin-text-muted))]">{response.email}</p>
                  </div>
                  <AdminBadge intent="neutral">
                    {format(new Date(response.created_at), "MMM d, yyyy")}
                  </AdminBadge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="font-medium text-[hsl(var(--admin-text-muted))]">Overall:</span>
                    <StarDisplay rating={response.overall_rating} />
                  </div>
                  <div>
                    <span className="font-medium text-[hsl(var(--admin-text-muted))]">Food:</span>
                    <StarDisplay rating={response.food_rating} />
                  </div>
                  <div>
                    <span className="font-medium text-[hsl(var(--admin-text-muted))]">Atmosphere:</span>
                    <StarDisplay rating={response.atmosphere_rating} />
                  </div>
                  <div>
                    <span className="font-medium text-[hsl(var(--admin-text-muted))]">Music:</span>
                    <StarDisplay rating={response.music_rating} />
                  </div>
                </div>

                {response.favorite_part && (
                  <div>
                    <p className="text-sm font-medium mb-1 text-[hsl(var(--admin-text-muted))]">Favorite Part:</p>
                    <p className="text-sm text-[hsl(var(--admin-text))]">{response.favorite_part}</p>
                  </div>
                )}

                {response.improvements && (
                  <div>
                    <p className="text-sm font-medium mb-1 text-[hsl(var(--admin-text-muted))]">Improvements:</p>
                    <p className="text-sm text-[hsl(var(--admin-text))]">{response.improvements}</p>
                  </div>
                )}

                {response.testimonial && (
                  <div className="p-3 rounded bg-[hsl(var(--admin-surface))]">
                    <p className="text-sm font-medium mb-1 text-[hsl(var(--admin-text-muted))]">✨ Testimonial:</p>
                    <p className="text-sm italic text-[hsl(var(--admin-text))]">"{response.testimonial}"</p>
                  </div>
                )}

                <div className="flex gap-4 text-sm">
                  <span className={response.would_attend_again ? "text-[hsl(var(--admin-success))]" : "text-[hsl(var(--admin-text-muted))]"}>
                    {response.would_attend_again ? "✓" : "✗"} Would attend again
                  </span>
                  <span className={response.would_recommend ? "text-[hsl(var(--admin-success))]" : "text-[hsl(var(--admin-text-muted))]"}>
                    {response.would_recommend ? "✓" : "✗"} Would recommend
                  </span>
                </div>
              </div>
            ))
          )}
        </AdminCardContent>
      </AdminCard>
    </div>
  );
};
