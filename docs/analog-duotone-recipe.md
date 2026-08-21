# Analog Commons — Duotone Treatment Recipe

Use this guide to replicate the signature "Analog" photo treatment on high-resolution source files for print marketing.

---

## Treatment Overview

The look is: **desaturated film stock + color tint + heavy grain**.  
Think vintage Ektachrome cross-processed with a single-color wash.

---

## Step-by-Step (Photoshop)

### 1. Desaturate
- **Image → Adjustments → Black & White** (or Desaturate)
- Keep the default channel mix — we want a flat, even grayscale.

### 2. Adjust Contrast & Brightness
- **Image → Adjustments → Brightness/Contrast**
  - Brightness: **-10** (slightly darker)
  - Contrast: **+10** (subtle punch)
- Alternatively use Curves: gentle S-curve, lift shadows slightly.

### 3. Color Overlay (Duotone Tint)
- Create a **new Solid Color fill layer** above the image.
- **Magenta variant** (default): `#FF2E77`
- **Mustard variant** (for DJ sets): `#EEB906`
- Set blend mode: **Multiply**
- Set opacity: **18%**

### 4. Film Grain
- **Filter → Noise → Add Noise**
  - Amount: **8-12%**
  - Distribution: **Gaussian**
  - ✅ Monochromatic
- Or use a grain texture overlay layer at **50% opacity**, blend mode **Overlay**.

### 5. Optional: Vertical Gradient
- Add a gradient overlay (top-to-bottom):
  - Top: `rgba(255,255,255,0.12)` 
  - Middle: transparent
  - Bottom: `rgba(0,0,0,0.08)`
- Blend mode: **Overlay**

---

## Step-by-Step (Lightroom)

1. **Saturation**: -100
2. **Contrast**: +10
3. **Exposure**: -0.1
4. **Split Toning / Color Grading**:
   - Shadows: Hue 340° (magenta), Saturation 20
   - OR Shadows: Hue 42° (mustard), Saturation 25
5. **Effects → Grain**:
   - Amount: 40
   - Size: 25
   - Roughness: 50

---

## Brand Color Reference

| Name               | Hex       | Use                        |
|--------------------|-----------|----------------------------|
| Cosmic Magenta     | `#FF2E77` | Default overlay for photos  |
| Festival Mustard   | `#EEB906` | DJ set / night scenes       |
| Denim Blue         | `#3C6189` | Alternate cool tone         |
| Forest Green       | `#235F56` | Nature / outdoor scenes     |

---

## Resolution Notes

- **Web images** on the site are 1200–2000px (not sufficient for print).
- For **print marketing**, apply this recipe to the original high-res files from the photographer.
- Recommended: **300 DPI minimum** for print, **150 DPI** for large format.

---

## Exported Web Versions

Treated web-resolution versions are available in the `marketing-assets` storage bucket under the `duotone/` folder. These are suitable for social media, email, and digital use but **not for print**.
