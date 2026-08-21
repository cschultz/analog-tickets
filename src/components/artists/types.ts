// Shared types for artist management components

export interface ArtistOffer {
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
  created_at: string;
}

export interface ArtistContact {
  name: string;
  email: string;
  phone: string | null;
  role: string;
}

// Stage color mapping
export const STAGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "Main Stage": { bg: "bg-purple-500/15", text: "text-purple-600", border: "border-purple-500/30" },
  "Second Stage": { bg: "bg-blue-500/15", text: "text-blue-600", border: "border-blue-500/30" },
  "Acoustic Stage": { bg: "bg-amber-500/15", text: "text-amber-600", border: "border-amber-500/30" },
  "Late Night": { bg: "bg-indigo-500/15", text: "text-indigo-600", border: "border-indigo-500/30" },
  "DJ Stage": { bg: "bg-pink-500/15", text: "text-pink-600", border: "border-pink-500/30" },
  "TBD": { bg: "bg-[hsl(var(--admin-hover))]", text: "text-[hsl(var(--admin-text-muted))]", border: "border-[hsl(var(--admin-border))]" },
  "default": { bg: "bg-[hsl(var(--admin-hover))]", text: "text-[hsl(var(--admin-text-muted))]", border: "border-[hsl(var(--admin-border))]" },
};

export const getStageColor = (stage: string | null) => {
  if (!stage || stage.toLowerCase() === 'tbd') return STAGE_COLORS.default;
  return STAGE_COLORS[stage] || STAGE_COLORS.default;
};

export const getStageColorClass = getStageColor;

// Stage colors for solid backgrounds (timeline view)
export const STAGE_SOLID_COLORS: Record<string, string> = {
  "Main Stage": "bg-purple-500",
  "Second Stage": "bg-blue-500",
  "Acoustic Stage": "bg-amber-500",
  "Late Night": "bg-indigo-500",
  "DJ Stage": "bg-pink-500",
  "TBD": "bg-[hsl(var(--admin-text-muted))]",
  "default": "bg-[hsl(var(--admin-text-muted))]",
};

export const getStageSolidColor = (stage: string | null) => {
  if (!stage) return STAGE_SOLID_COLORS.default;
  return STAGE_SOLID_COLORS[stage] || STAGE_SOLID_COLORS.default;
};

// Status badge configuration
export const STATUS_VARIANTS: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
  draft: { variant: "secondary", className: "bg-[hsl(var(--admin-hover))] text-[hsl(var(--admin-text-muted))] border-[hsl(var(--admin-border))]" },
  sent: { variant: "outline", className: "border-[hsl(var(--admin-info))] text-[hsl(var(--admin-info))]" },
  accepted: { variant: "outline", className: "border-[hsl(var(--admin-success))] text-[hsl(var(--admin-success))] bg-[hsl(var(--admin-success)/0.1)]" },
  declined: { variant: "destructive", className: "" },
  countered: { variant: "outline", className: "border-[hsl(var(--admin-warning))] text-[hsl(var(--admin-warning))] bg-[hsl(var(--admin-warning)/0.1)]" },
  expired: { variant: "secondary", className: "bg-[hsl(var(--admin-hover))] text-[hsl(var(--admin-text-muted))]" },
};

// Parse set time to minutes for sorting/comparison
export const parseSetTime = (setTime: string | null): number => {
  if (!setTime || setTime.toLowerCase() === 'tbd') return 9999;
  
  const timeStr = setTime.toLowerCase().trim();
  const match12h = timeStr.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)$/i);
  const match24h = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  
  let hours = 0;
  let minutes = 0;
  
  if (match12h) {
    hours = parseInt(match12h[1]);
    minutes = match12h[2] ? parseInt(match12h[2]) : 0;
    const period = match12h[3]?.toLowerCase();
    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
  } else if (match24h) {
    hours = parseInt(match24h[1]);
    minutes = parseInt(match24h[2]);
  } else {
    return 9999;
  }
  
  // Festival time: after midnight counts as late night (sort after 11pm)
  if (hours < 6) hours += 24;
  
  return hours * 60 + minutes;
};
