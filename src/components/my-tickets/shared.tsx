import React from "react";
import { COLORS, typography } from "@/styles/may-theme";
import { getPublicStorageUrl } from "@/platform/config/env";

// ===== SHARED TYPES =====
export interface VerifiedAccess {
  email: string;
  registrationId: string;
  sessionToken: string;
}

export interface TicketUpgradeSelection {
  ticket: any;
  destination: string;
}

export interface FamilyTicketSummary {
  registrationId: string;
  eventId: string | null;
  eventDetails: any | null;
  childCount: number;
  youthCount: number;
  youthTicketType: string | null;
  parentTicketType: string | null;
}

export interface CartItem {
  type: "lodging" | "addon";
  id: string;
  name: string;
  price: number;
  quantity: number;
  maxQuantity: number;
  addonType?: string;
  hasDietaryRestrictions?: boolean;
  dietaryRestrictions?: string;
}

// ===== LODGING PRODUCT IMAGES =====
// Kept in sync with send-tickets-delivery email.
const LODGING_ASSET_BASE = getPublicStorageUrl("marketing-assets/lodging");

export const LODGING_IMAGES: Record<string, string> = {
  grove_tents: `${LODGING_ASSET_BASE}/grove-tents-1q.webp`,
  grove_tents_2q: `${LODGING_ASSET_BASE}/grove-tents-2q.webp`,
  front_row_tents: `${LODGING_ASSET_BASE}/front-row-tents.webp`,
  front_row_cabins: `${LODGING_ASSET_BASE}/front-row-cabins.webp`,
};

// ===== SHARED STYLED BUTTON =====
export function MayButton({
  children,
  onClick,
  type = "button",
  disabled = false,
  variant = "primary",
  size = "md",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  variant?: "primary" | "outline" | "ghost" | "clay" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  className?: string;
}) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg transition-all hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-5 py-2.5 text-sm",
    lg: "px-6 py-3 text-sm",
    icon: "h-8 w-8",
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: COLORS.charcoal, color: COLORS.white, ...typography.button },
    outline: { backgroundColor: "transparent", color: COLORS.charcoal, border: `1px solid ${COLORS.charcoal}25`, ...typography.button },
    ghost: { backgroundColor: "transparent", color: COLORS.boulder, ...typography.button },
    clay: { backgroundColor: COLORS.clay, color: COLORS.white, ...typography.button },
    danger: { backgroundColor: "transparent", color: "#dc2626", border: "1px solid #fca5a520", ...typography.button },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${className}`}
      style={variants[variant]}
    >
      {children}
    </button>
  );
}
