/**
 * Client-side image processing to bake the Analog duotone treatment.
 * Replicates the exact CSS layer stack used in the site's DuotonePanel components:
 *   1. Heavy grain overlay (0.35 opacity, overlay blend)
 *   2. Image: grayscale(100%) contrast(1.1) brightness(X), multiply blend
 *   3. Color overlay (multiply blend, variable opacity)
 *   4. Secondary gradient tint (overlay blend)
 *   5. Dense halftone dots (multiply blend, variable opacity)
 *   6. Extra grain (0.25 opacity)
 */

import { COLORS } from "@/styles/may-theme";

// ===== PER-IMAGE TREATMENT MAP =====
// Maps source filenames to their exact on-site DuotonePanel config.
// Images not in this map are exported with a default treatment.
export interface DuotoneTreatment {
  color: string;
  secondaryColor: string;
  brightness?: number;    // default 0.9
  colorOpacity?: number;  // default 0.65
  halftoneOpacity?: number; // default 0.35
}

// Images shown without any duotone overlay on the site (authentic/clear)
export const CLEAR_IMAGES = new Set([
  "crowd-golden.jpg",
  "kids-sprinkler.jpg",
  "holding-hands-wristband.jpg",
  "backstory-group.jpg",
  "night-stage.jpg",
  "maximum-fun-family.jpg",
  "child-art-canvas.jpg",
  "child-shoulders.jpg",
  "winecamp-gathering.jpg",
  // Posters / artwork — not photos
  "analog-poster-2026.jpg",
  "analog-poster-2026-v2.jpg",
  "analog-poster-2026.png",
  "lineup-poster-2026.png",
  "poster-may-2026.jpg",
  "og-crew-stylized.jpg",
]);

export const IMAGE_TREATMENTS: Record<string, DuotoneTreatment> = {
  // ── Story.tsx DuotonePanels ──
  "founders-ritual.jpg": {
    color: COLORS.forest,
    secondaryColor: COLORS.sage,
    brightness: 1.25,
    colorOpacity: 0.45,
    halftoneOpacity: 0.25,
  },
  "hands-raised-bokeh.jpg": {
    color: COLORS.denim,
    secondaryColor: COLORS.electricLavender,
    brightness: 1.2,
    colorOpacity: 0.5,
    halftoneOpacity: 0.25,
  },
  "singer-pink-performing.jpg": {
    color: COLORS.clay,
    secondaryColor: COLORS.mustard,
  },
  // ── Lineup.tsx DuotonePanels ──
  "cosmico-stage-night.jpg": {
    color: COLORS.mustard,
    secondaryColor: COLORS.clay,
  },
  "stage-energy-motion.jpg": {
    color: COLORS.denim,
    secondaryColor: COLORS.sage,
  },
  // ── Experience.tsx DuotonePanels ──
  "dock-hangout-river.jpg": {
    color: COLORS.sage,
    secondaryColor: COLORS.forest,
  },
  "denim-woman-portrait.jpg": {
    color: COLORS.magenta,
    secondaryColor: COLORS.electricLavender,
  },
  // ── Index.tsx hero & inline panels ──
  "hero-couple-stage.jpg": {
    color: COLORS.forest,
    secondaryColor: COLORS.mustard,
    brightness: 1.1,
    colorOpacity: 0.45,
    halftoneOpacity: 0.25,
  },
  "disco-ball-portrait.jpg": {
    color: COLORS.magenta,
    secondaryColor: COLORS.electricLavender,
  },
  "disco-ball-wagon.jpg": {
    color: COLORS.deepWater,
    secondaryColor: COLORS.electricLavender,
  },
  // ── BringYourCrew.tsx ──
  "crew-stage-crowd.jpg": {
    color: COLORS.deepWater,
    secondaryColor: COLORS.denim,
    colorOpacity: 0.7,
  },
  "crew-gathering-meadow.jpg": {
    color: COLORS.forest,
    secondaryColor: COLORS.sage,
  },
  "crew-dancing-night.jpg": {
    color: COLORS.deepWater,
    secondaryColor: COLORS.electricLavender,
  },
  "crew-denim-friends.jpg": {
    color: COLORS.denim,
    secondaryColor: COLORS.sage,
  },
  "crew-friends-golden.jpg": {
    color: COLORS.clay,
    secondaryColor: COLORS.mustard,
    brightness: 1.1,
  },
  // ── Other photos with editorial treatment ──
  "couple-stage-sunbeam.jpg": {
    color: COLORS.clay,
    secondaryColor: COLORS.mustard,
    brightness: 1.1,
  },
  "cosmico-projection.jpg": {
    color: COLORS.deepWater,
    secondaryColor: COLORS.electricLavender,
  },
  "flag-daisies-double-exposure.jpg": {
    color: COLORS.sage,
    secondaryColor: COLORS.forest,
    brightness: 1.1,
  },
  "night-crowd-magenta.jpg": {
    color: COLORS.magenta,
    secondaryColor: COLORS.clay,
  },
  "stage-lighting-setup.jpg": {
    color: COLORS.denim,
    secondaryColor: COLORS.deepWater,
  },
  "backstory-outdoor-concert.png": {
    color: COLORS.deepWater,
    secondaryColor: COLORS.denim,
  },
  // ── Camera roll photos (U5A series) ──
  "U5A5374.jpg": {
    color: COLORS.forest,
    secondaryColor: COLORS.sage,
  },
  "u5a5347.jpg": {
    color: COLORS.denim,
    secondaryColor: COLORS.sage,
  },
  "U5A5489.jpg": {
    color: COLORS.clay,
    secondaryColor: COLORS.mustard,
    brightness: 1.1,
  },
  "U5A5650.jpg": {
    color: COLORS.magenta,
    secondaryColor: COLORS.electricLavender,
  },
  "u5a5447.jpg": {
    color: COLORS.deepWater,
    secondaryColor: COLORS.electricLavender,
  },
  "U5A6417.jpg": {
    color: COLORS.mustard,
    secondaryColor: COLORS.clay,
  },
  "U5A7139.jpg": {
    color: COLORS.sage,
    secondaryColor: COLORS.forest,
    brightness: 1.1,
  },
  "u5a7044.jpg": {
    color: COLORS.denim,
    secondaryColor: COLORS.forest,
  },
};

// Default treatment for images not in the map
const DEFAULT_TREATMENT: DuotoneTreatment = {
  color: COLORS.denim,
  secondaryColor: COLORS.forest,
};

const GRAIN_INTENSITY = 30;

/**
 * Apply the exact on-site Analog treatment to an image.
 * Returns a JPEG Blob with all layers baked in.
 */
export async function applyAnalogTreatment(
  imageUrl: string,
  overrideTreatment?: DuotoneTreatment
): Promise<Blob> {
  const fileName = imageUrl.split("/").pop() || "";
  const treatment = overrideTreatment || IMAGE_TREATMENTS[fileName] || DEFAULT_TREATMENT;

  const brightness = treatment.brightness ?? 0.9;
  const colorOpacity = treatment.colorOpacity ?? 0.65;
  const halftoneOpacity = treatment.halftoneOpacity ?? 0.35;

  const img = await loadImage(imageUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Layer 0: Fill with the treatment color as background
  ctx.fillStyle = treatment.color;
  ctx.fillRect(0, 0, w, h);

  // Layer 1: Heavy grain (overlay, 0.35)
  const grain1 = generateGrainTexture(w, h);
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = 0.35;
  ctx.drawImage(grain1, 0, 0);

  // Layer 2: Image with grayscale + contrast + brightness, multiply blend
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 1;
  ctx.filter = `grayscale(100%) contrast(1.1) brightness(${brightness})`;
  ctx.drawImage(img, 0, 0);
  ctx.filter = "none";

  // Layer 3: Color overlay (multiply blend)
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = colorOpacity;
  ctx.fillStyle = treatment.color;
  ctx.fillRect(0, 0, w, h);

  // Layer 4: Secondary gradient tint (overlay blend)
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = 1;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, hexToRgba(treatment.secondaryColor, 0.19)); // ~30 hex = ~19%
  grad.addColorStop(0.5, "transparent");
  grad.addColorStop(1, hexToRgba(treatment.color, 0.13)); // ~20 hex = ~13%
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Layer 5: Halftone dot pattern (multiply blend)
  const halftone = generateHalftoneTexture(w, h);
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = halftoneOpacity;
  ctx.drawImage(halftone, 0, 0);

  // Layer 6: Extra grain (source-over, 0.25)
  const grain2 = generateGrainTexture(w, h);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 0.25;
  ctx.drawImage(grain2, 0, 0);

  // Reset
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      "image/jpeg",
      0.92
    );
  });
}

// ===== Helpers =====

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function generateGrainTexture(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * GRAIN_INTENSITY * 2;
    const v = 128 + noise;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Approximate the dense halftone SVG pattern as a tiled canvas texture. */
function generateHalftoneTexture(width: number, height: number): HTMLCanvasElement {
  // Create a small 4x4 tile matching halftonePatternDense
  const tile = document.createElement("canvas");
  tile.width = 4;
  tile.height = 4;
  const tCtx = tile.getContext("2d")!;

  tCtx.fillStyle = "white";
  tCtx.fillRect(0, 0, 4, 4);

  // Dot at (1,1) r=0.9 opacity 0.4
  tCtx.globalAlpha = 0.4;
  tCtx.fillStyle = "black";
  tCtx.beginPath();
  tCtx.arc(1, 1, 0.9, 0, Math.PI * 2);
  tCtx.fill();

  // Dot at (3,3) r=0.75 opacity 0.32
  tCtx.globalAlpha = 0.32;
  tCtx.beginPath();
  tCtx.arc(3, 3, 0.75, 0, Math.PI * 2);
  tCtx.fill();

  // Dot at (3,1) r=0.4 opacity 0.2
  tCtx.globalAlpha = 0.2;
  tCtx.beginPath();
  tCtx.arc(3, 1, 0.4, 0, Math.PI * 2);
  tCtx.fill();

  // Dot at (1,3) r=0.5 opacity 0.25
  tCtx.globalAlpha = 0.25;
  tCtx.beginPath();
  tCtx.arc(1, 3, 0.5, 0, Math.PI * 2);
  tCtx.fill();

  // Tile it across the full canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const pattern = ctx.createPattern(tile, "repeat")!;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
