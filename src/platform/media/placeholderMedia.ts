import filmCamera01 from "@/assets/placeholders/film-camera/film-camera-01.jpg.asset.json";
import filmCamera02 from "@/assets/placeholders/film-camera/film-camera-02.jpg.asset.json";

/**
 * Temporary placeholder media for the generic festival template.
 *
 * Credit: @bmaphoto. Approved 2026-08-21 for placeholder use only (see docs/PHOTOGRAPHY_MEDIA_INVENTORY.md).
 * Final redistribution / legal clearance remains an open follow-up.
 *
 * Swap the template's placeholder imagery by editing this file only.
 */
export const PLACEHOLDER_MEDIA_CREDIT = "@bmaphoto" as const;

export const PLACEHOLDER_MEDIA = {
  hero: filmCamera01.url,
  gallery: filmCamera02.url,
} as const;

export type PlaceholderMediaKey = keyof typeof PLACEHOLDER_MEDIA;
