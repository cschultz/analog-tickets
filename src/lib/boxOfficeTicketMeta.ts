// Visual classification + accent color per ticket type.
// Keeps the door scanner consistent across flash, chip, and order panel.

export type TicketTier = "patron" | "vip" | "ga" | "krewe" | "youth" | "child" | "comp" | "other";

export interface TicketMeta {
  tier: TicketTier;
  shortLabel: string;     // e.g. "VIP", "GA", "Patron", "Crew"
  flashClass: string;     // tailwind background for the full-screen flash
  chipClass: string;      // chip background+text
  requiresId: boolean;    // staff prompt to verify ID (21+ wristband, etc.)
}

export function getTicketMeta(typeKey: string | null | undefined, unitPrice?: number | null): TicketMeta {
  const k = (typeKey || "").toLowerCase();

  if (k.startsWith("patrons_")) {
    return {
      tier: "patron",
      shortLabel: "Patron",
      flashClass: "bg-violet-600",
      chipClass: "bg-violet-100 text-violet-900 border-violet-300",
      requiresId: true,
    };
  }
  if (k.includes("vip")) {
    return {
      tier: "vip",
      shortLabel: "VIP",
      flashClass: "bg-amber-500",
      chipClass: "bg-amber-100 text-amber-900 border-amber-300",
      requiresId: true,
    };
  }
  if (k.includes("krewe")) {
    return {
      tier: "krewe",
      shortLabel: "Crew",
      flashClass: "bg-cyan-600",
      chipClass: "bg-cyan-100 text-cyan-900 border-cyan-300",
      requiresId: false,
    };
  }
  if (k.startsWith("youth")) {
    return {
      tier: "youth",
      shortLabel: "Youth",
      flashClass: "bg-emerald-600",
      chipClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
      requiresId: false,
    };
  }
  if (k.includes("child")) {
    return {
      tier: "child",
      shortLabel: "Child",
      flashClass: "bg-emerald-600",
      chipClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
      requiresId: false,
    };
  }
  if (k.includes("comp") || (typeof unitPrice === "number" && unitPrice === 0)) {
    return {
      tier: "comp",
      shortLabel: "Comp",
      flashClass: "bg-pink-600",
      chipClass: "bg-pink-100 text-pink-900 border-pink-300",
      requiresId: false,
    };
  }
  if (k.startsWith("tier_") || k.startsWith("ga") || k.includes("_ga_")) {
    return {
      tier: "ga",
      shortLabel: "GA",
      flashClass: "bg-emerald-500",
      chipClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
      requiresId: false,
    };
  }
  return {
    tier: "other",
    shortLabel: "Ticket",
    flashClass: "bg-emerald-500",
    chipClass: "bg-neutral-200 text-neutral-800 border-neutral-300",
    requiresId: false,
  };
}
