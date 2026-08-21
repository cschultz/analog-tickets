# May 2026 Design System Transfer Guide

This guide contains everything needed to replicate the May 2026 festival design in another Lovable project.

---

## Step 1: Copy Font Files

Download these font files from `public/fonts/`:
- `TAYLosa.woff2`, `TAYLosa.woff`, `TAYLosa.otf`
- `SerialB-Medium.woff2`, `SerialB-Medium.woff`, `SerialB-Medium.otf`

In the new project, upload these to `public/fonts/`

---

## Step 2: Add to index.html

Add Google Fonts to `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Serif:wght@400;500;600&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

---

## Step 3: Add Custom Font Declarations to index.css

Add these @font-face rules:

```css
@font-face {
  font-family: 'Tay Losa';
  src: url('/fonts/TAYLosa.woff2') format('woff2'),
       url('/fonts/TAYLosa.woff') format('woff'),
       url('/fonts/TAYLosa.otf') format('opentype');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Serial B';
  src: url('/fonts/SerialB-Medium.woff2') format('woff2'),
       url('/fonts/SerialB-Medium.woff') format('woff'),
       url('/fonts/SerialB-Medium.otf') format('opentype');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}
```

---

## Step 4: CSS Variables (add to :root in index.css)

```css
:root {
  /* === MAY 2026 BRAND COLORS === */
  --may-bone-white: 45 30% 96%;
  --may-charcoal: 0 0% 18%;
  --may-river-mist: 210 30% 85%;
  --may-redwood-green: 165 45% 25%;
  --may-cosmic-magenta: 330 100% 60%;
  --may-festival-amber: 42 95% 55%;
  --may-indigo-plum: 270 45% 25%;
  
  /* Core palette */
  --may-denim: 213 40% 39%;
  --may-clay: 18 78% 64%;
  --may-deep-water: 270 45% 19%;
  --may-forest: 168 45% 26%;
  --may-dusty-sky: 230 100% 97%;
  --may-boulder: 200 15% 71%;
  
  /* Accents */
  --may-mustard: 47 94% 48%;
  --may-electric-lavender: 273 66% 60%;
  --may-sage: 90 66% 75%;
}
```

---

## Step 5: Tailwind Config Additions

Add to `tailwind.config.ts` in the `extend` section:

```typescript
colors: {
  may: {
    bone: "hsl(var(--may-bone-white))",
    charcoal: "hsl(var(--may-charcoal))",
    mist: "hsl(var(--may-river-mist))",
    redwood: "hsl(var(--may-redwood-green))",
    magenta: "hsl(var(--may-cosmic-magenta))",
    amber: "hsl(var(--may-festival-amber))",
    plum: "hsl(var(--may-indigo-plum))",
    denim: "hsl(var(--may-denim))",
    clay: "hsl(var(--may-clay))",
    deepWater: "hsl(var(--may-deep-water))",
    forest: "hsl(var(--may-forest))",
    dustySky: "hsl(var(--may-dusty-sky))",
    boulder: "hsl(var(--may-boulder))",
    mustard: "hsl(var(--may-mustard))",
    lavender: "hsl(var(--may-electric-lavender))",
    sage: "hsl(var(--may-sage))",
  },
},
fontFamily: {
  taylosa: ["'Tay Losa'", "'DM Sans'", "sans-serif"],
  serialb: ["'Serial B'", "'IBM Plex Serif'", "serif"],
  serif: ["'Cormorant Garamond'", "serif"],
  display: ["'Fraunces'", "serif"],
},
```

---

## Step 6: Theme Constants File

Create `src/styles/may-theme.ts`:

```typescript
import { Variants } from 'framer-motion';

// Brand Colors (Hex for inline styles)
export const COLORS = {
  white: '#FFFFFF',
  dustySky: '#EEF1FF',
  charcoal: '#2F2F2F',
  boulder: '#AEBDC5',
  denim: '#3C6189',
  clay: '#E9835E',
  deepWater: '#2E1A47',
  forest: '#235F56',
  mustard: '#EEB906',
  electricLavender: '#9B57DE',
  magenta: '#FF2E77',
  sage: '#BEEA95',
};

// Typography
export const typography = {
  headline: {
    fontFamily: "'Tay Losa', 'DM Sans', sans-serif",
    fontWeight: 500,
    letterSpacing: '0',
    lineHeight: 1.05,
  },
  subhead: {
    fontFamily: "'Tay Losa', 'DM Sans', sans-serif",
    fontWeight: 500,
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
  },
  body: {
    fontFamily: "'Serial B', 'IBM Plex Serif', serif",
    fontWeight: 500,
    letterSpacing: '0',
    lineHeight: 1.75,
  },
  caption: {
    fontFamily: "'Serial B', 'IBM Plex Serif', serif",
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.12em',
    fontSize: '11px',
  },
};

// Film Grain Texture
export const filmGrain = {
  backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 512 512\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'filmGrain\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.7\' numOctaves=\'5\' stitchTiles=\'stitch\'/%3E%3CfeColorMatrix type=\'saturate\' values=\'0\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23filmGrain)\'/%3E%3C/svg%3E")',
  backgroundSize: '512px 512px',
};

// Animation Variants
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
  }
};

export const staggerContainer: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    }
  }
};

// Duotone Image Style
export const duotoneImageStyle = {
  filter: 'grayscale(100%) contrast(1.1) brightness(0.9)',
  mixBlendMode: 'multiply' as const,
};
```

---

## Step 7: Film Grain Overlay Component

Create `src/components/FilmGrainOverlay.tsx`:

```tsx
import React from 'react';
import { filmGrain } from '@/styles/may-theme';

interface FilmGrainOverlayProps {
  opacity?: number;
  className?: string;
}

export const FilmGrainOverlay: React.FC<FilmGrainOverlayProps> = ({ 
  opacity = 0.08,
  className = ''
}) => {
  return (
    <div 
      className={`pointer-events-none absolute inset-0 z-50 ${className}`}
      style={{
        ...filmGrain,
        opacity,
        mixBlendMode: 'overlay',
      }}
      aria-hidden="true"
    />
  );
};
```

---

# Ready-to-Use Prompt for New Project

Copy and paste this entire prompt into your new Lovable project:

---

**PROMPT START**

I want to set up a vintage festival design system with the following characteristics:

**Design Aesthetic:**
- Vintage 70s film photography feel with warm, earthy tones
- Film grain texture overlays on sections
- Duotone image treatment (grayscale with color overlay)
- Editorial typography with display headlines and serif body text

**Color Palette:**
Primary colors:
- Denim blue (#3C6189) - primary brand color
- Clay/terracotta (#E9835E) - warm accent
- Deep Water purple (#2E1A47) - dark accent
- Forest green (#235F56) - nature accent

Neutrals:
- Dusty Sky (#EEF1FF) - light background
- Charcoal (#2F2F2F) - dark text
- Boulder (#AEBDC5) - muted gray

**Typography:**
- Headlines: Tay Losa or DM Sans (bold, tight leading)
- Body text: Serial B or IBM Plex Serif (medium weight, generous line height)
- Captions: Serial B uppercase with wide letter-spacing

**Visual Effects:**
- Film grain SVG texture overlay at 8% opacity
- Duotone images: grayscale filter + color overlay with multiply blend mode
- Smooth scroll-triggered animations using Framer Motion
- Staggered reveal animations for content sections

**Please:**
1. Add these CSS variables to index.css for the color palette
2. Configure tailwind.config.ts with the `may` color namespace
3. Create a theme constants file at src/styles/may-theme.ts with typography, colors, film grain, and animation variants
4. Create a FilmGrainOverlay component for the texture effect

Use HSL color format for all CSS variables. Make sure framer-motion is installed for animations.

**PROMPT END**

---

## Notes

- The fonts (Tay Losa, Serial B) are custom and need to be uploaded separately
- If you don't have the custom fonts, DM Sans and IBM Plex Serif work as fallbacks
- Framer Motion is used for all animations
- All images use a duotone treatment: `filter: grayscale(100%) contrast(1.1) brightness(0.9)` with a colored overlay using `mixBlendMode: 'multiply'`
