/**
 * Admin Color Utilities - Centralized color mappings
 * 
 * This file provides standardized color mappings for the admin design system.
 * All components should use these utilities instead of hardcoding color classes.
 * 
 * RULES:
 * 1. Only use admin semantic tokens (--admin-*)
 * 2. Never use hardcoded hex/rgb/hsl values
 * 3. All new color mappings should be added here
 */

// ============ INTENT TYPES ============

export type AdminIntent = "neutral" | "info" | "warning" | "success" | "danger";

// ============ STAGE/STATUS COLOR TO INTENT ============

/**
 * Maps generic color names (from database configs) to admin intent types.
 * Use this when converting user-defined colors to semantic intents.
 */
export const colorToIntent: Record<string, AdminIntent> = {
  gray: "neutral",
  blue: "info",
  yellow: "warning",
  green: "success",
  red: "danger",
  purple: "info",    // Maps to info for consistency
  orange: "warning", // Maps to warning for consistency
};

/**
 * Get admin intent from a color string
 */
export function getIntentFromColor(color: string | undefined | null): AdminIntent {
  return colorToIntent[color || ""] || "neutral";
}

// ============ BACKGROUND COLOR CLASSES ============

/**
 * Background color classes for status dots, indicators, etc.
 */
export const intentBgClasses: Record<AdminIntent, string> = {
  neutral: "bg-[hsl(var(--admin-muted))]",
  info: "bg-[hsl(var(--admin-info))]",
  warning: "bg-[hsl(var(--admin-warning))]",
  success: "bg-[hsl(var(--admin-success))]",
  danger: "bg-[hsl(var(--admin-error))]",
};

/**
 * Muted/transparent background classes for badges
 */
export const intentBgMutedClasses: Record<AdminIntent, string> = {
  neutral: "bg-[hsl(var(--admin-muted)/0.15)]",
  info: "bg-[hsl(var(--admin-info)/0.1)]",
  warning: "bg-[hsl(var(--admin-warning)/0.1)]",
  success: "bg-[hsl(var(--admin-success)/0.1)]",
  danger: "bg-[hsl(var(--admin-error)/0.1)]",
};

/**
 * Get background class from color string
 */
export function getBgClassFromColor(color: string | undefined | null): string {
  const intent = getIntentFromColor(color);
  return intentBgClasses[intent];
}

// ============ BORDER COLOR CLASSES ============

/**
 * Border color classes for cards, columns, etc.
 */
export const intentBorderClasses: Record<AdminIntent, string> = {
  neutral: "border-[hsl(var(--admin-border))]",
  info: "border-[hsl(var(--admin-info))]",
  warning: "border-[hsl(var(--admin-warning))]",
  success: "border-[hsl(var(--admin-success))]",
  danger: "border-[hsl(var(--admin-error))]",
};

/**
 * Get border class from color string
 */
export function getBorderClassFromColor(color: string | undefined | null): string {
  const intent = getIntentFromColor(color);
  return intentBorderClasses[intent];
}

// ============ TEXT COLOR CLASSES ============

/**
 * Text color classes
 */
export const intentTextClasses: Record<AdminIntent, string> = {
  neutral: "text-[hsl(var(--admin-muted-foreground))]",
  info: "text-[hsl(var(--admin-info))]",
  warning: "text-[hsl(var(--admin-warning))]",
  success: "text-[hsl(var(--admin-success))]",
  danger: "text-[hsl(var(--admin-error))]",
};

/**
 * Get text class from color string
 */
export function getTextClassFromColor(color: string | undefined | null): string {
  const intent = getIntentFromColor(color);
  return intentTextClasses[intent];
}

// ============ ENTITY TYPE COLORS ============

export type EntityType = "vendor" | "artisan" | "partner" | "artist" | "volunteer" | "winecamp" | "default";

/**
 * Entity type to text color mapping
 */
export const entityTypeTextClasses: Record<EntityType, string> = {
  vendor: "text-[hsl(var(--admin-info))]",
  artisan: "text-[hsl(var(--admin-info))]", // Using info instead of hardcoded purple
  partner: "text-[hsl(var(--admin-warning))]",
  artist: "text-[hsl(var(--admin-danger))]",
  volunteer: "text-[hsl(var(--admin-success))]",
  winecamp: "text-[hsl(var(--admin-success))]",
  default: "text-[hsl(var(--admin-foreground))]",
};

/**
 * Get text color class for entity type
 */
export function getEntityTypeTextClass(type: EntityType | string | undefined | null): string {
  return entityTypeTextClasses[(type as EntityType) || "default"] || entityTypeTextClasses.default;
}
