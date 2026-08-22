# Cosmico Style Guide

> The single source of truth for all /may pages and pages adopting the Analog brand identity.

---

## Brand Philosophy

The Analog brand represents a grassroots movement centered on presence, creativity, community, and reconnection in a digitally overwhelming world. It is:
- Secularly spiritual, human, grounded
- Emotionally intelligent, calm but bold
- Never corporate, techy, or sales-driven

Design should feel like a calm from the modern storm — a quiet rebellion against digital overload.

---

## Color Palette

All colors use exact hex codes. No substitution, approximation, or auto-generated shades.

### Neutrals
| Name | Hex | Usage |
|------|-----|-------|
| White | `#FFFFFF` | Backgrounds, text on dark |
| Dusty Sky | `#EEF1FF` | Light backgrounds, panels |
| Charcoal | `#2F2F2F` | Dark backgrounds, text |
| Boulder | `#AEBDC5` | Muted text, captions |

### Primary / Core
| Name | Hex | Usage |
|------|-----|-------|
| Denim | `#3C6189` | Accent, headers |
| Clay | `#E9835E` | Warm accent, CTAs |
| Deep Water | `#2E1A47` | Rich dark accent |
| Forest | `#235F56` | Nature, calm sections |

### Accent / Energy (use sparingly)
| Name | Hex | Usage |
|------|-----|-------|
| Mustard | `#EEB906` | Highlights, dividers |
| Electric Lavender | `#9B57DE` | Playful accent |
| Magenta | `#FF2E77` | High energy moments |
| Sage | `#BEEA95` | Fresh, nature accent |

### Rules
- No gradients, neons, or transparency effects not shown in brand guide
- Accents must be used intentionally and sparingly
- Overall palette must feel grounded, tactile, and restrained

---

## Typography

### Font Families
| Role | Primary Font | Fallback |
|------|-------------|----------|
| Headlines | TAY Losa (Medium) | DM Sans |
| Body/UI | Serial B (Medium) | IBM Plex Serif |

### Type Scale

```typescript
// Headlines
headline: {
  fontFamily: "'Tay Losa', 'DM Sans', sans-serif",
  fontWeight: 500,
  letterSpacing: '0',
  lineHeight: 1.05,
}

// Subheads
subhead: {
  fontFamily: "'Tay Losa', 'DM Sans', sans-serif",
  fontWeight: 500,
  letterSpacing: '-0.01em',
  lineHeight: 1.2,
}

// Body Text
body: {
  fontFamily: "'Serial B', 'IBM Plex Serif', serif",
  fontWeight: 500,
  letterSpacing: '0',
  lineHeight: 1.5,
}

// Captions (Uppercase)
caption: {
  fontFamily: "'Serial B', 'IBM Plex Serif', serif",
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontSize: '11px',
}

// Buttons
button: {
  fontFamily: "'Serial B', 'IBM Plex Serif', serif",
  fontWeight: 500,
  letterSpacing: '-0.02em',
}
```

---

## Visual Treatments

### Film Grain Overlay
All color blocks use a film grain overlay at **0.5 opacity** for analog texture.

```tsx
import FilmGrainOverlay from "@/components/may/FilmGrainOverlay";

<div className="relative">
  <FilmGrainOverlay opacity={0.5} />
  {/* Content */}
</div>
```

### Duotone Images
Images use grayscale + color overlay for printed poster aesthetic:

```typescript
duotoneImageStyle = {
  filter: 'grayscale(100%) contrast(1.1) brightness(0.9)',
  mixBlendMode: 'multiply',
}
```

Use with `DuotonePanel` component for consistent treatment.

### Halftone Patterns
Available for additional texture:
- `halftonePattern` - Standard dots
- `halftonePatternDense` - Closer dots for close-ups
- `heavyGrain` - Intense grain texture

---

## Layout Patterns

### Split Panels
Two-column layouts with:
- One solid color panel (text content)
- One duotone image panel

```tsx
<div className="grid grid-cols-1 md:grid-cols-2">
  <div style={{ backgroundColor: COLORS.dustySky }}>
    {/* Text content */}
  </div>
  <DuotonePanel image={photo} color={COLORS.mustard} />
</div>
```

### Section Spacing
- Desktop: `py-20 md:py-28` or `min-h-[500px]`
- Mobile: Content stacks vertically
- Generous whitespace throughout

---

## Animation

Use Framer Motion with these preset variants:

```typescript
import { fadeInUp, fadeInScale, slideInLeft, slideInRight, staggerContainer } from "@/styles/may-theme";

<motion.div
  initial="hidden"
  whileInView="visible"
  viewport={{ once: true, margin: "-100px" }}
  variants={fadeInUp}
>
```

Animation timing: `duration: 0.6-0.7s`, easing: `[0.22, 1, 0.36, 1]`

---

## Components

### Core May Components
Located in `src/components/may/`:

| Component | Usage |
|-----------|-------|
| `MayHeader` | Navigation header |
| `MayFooter` | Footer with nav links |
| `DuotonePanel` | Image with duotone effect |
| `FilmGrainOverlay` | Texture overlay |
| `AnalogButton` | Styled CTA buttons |

### Importing Theme
```typescript
import { COLORS, typography, fadeInUp } from "@/styles/may-theme";
```

---

## Page Structure

1. **Header** - Fixed navigation with logo
2. **Hero Section** - Full viewport, split layout
3. **Content Sections** - Alternating color panels
4. **Image Dividers** - Full-width cinematic photos
5. **CTA Sections** - Clear call-to-action moments
6. **Footer** - Navigation and mission statement

---

## Do's and Don'ts

### Do
- Use exact hex colors from the palette
- Apply film grain to color blocks
- Use duotone treatment on images
- Maintain generous whitespace
- Write poetic, grounded copy

### Don't
- Use gradients or transparency effects
- Use generic stock imagery
- Write corporate or sales-y copy
- Use bright, saturated colors
- Ignore the brand fonts

---

## File References

- Theme constants: `src/styles/may-theme.ts`
- Components: `src/components/may/`
- Pages: `src/modules/site/pages/` (presentation), `src/modules/ticketing/pages/` (ticketing/checkout)
