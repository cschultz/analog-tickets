# Analog Design System — Full Transfer Package

> Upload this file to a new Lovable project and paste the prompt at the bottom into chat.
> You will also need to upload the font files separately (see Step 1).

---

## STEP 1: Font Files (Manual Upload Required)

Download these from the original project's `public/fonts/` directory and upload to the new project's `public/fonts/`:
- `TAYLosa.woff2`, `TAYLosa.woff`, `TAYLosa.otf`
- `SerialB-Medium.woff2`, `SerialB-Medium.woff`, `SerialB-Medium.otf`

---

## STEP 2: index.html — Add to `<head>`

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Serif:wght@400;500;600&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

---

## STEP 3: index.css — Font Declarations & CSS Variables

Add these to `index.css`:

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

Add these CSS variables to `:root`:

```css
:root {
  /* === ANALOG BRAND COLORS (HSL) === */
  --may-bone-white: 45 30% 96%;
  --may-charcoal: 0 0% 18%;
  --may-river-mist: 210 30% 85%;
  --may-redwood-green: 165 45% 25%;
  --may-cosmic-magenta: 330 100% 60%;
  --may-festival-amber: 42 95% 55%;
  --may-indigo-plum: 270 45% 25%;
  --may-denim: 213 40% 39%;
  --may-clay: 18 78% 64%;
  --may-deep-water: 270 45% 19%;
  --may-forest: 168 45% 26%;
  --may-dusty-sky: 230 100% 97%;
  --may-boulder: 200 15% 71%;
  --may-mustard: 47 94% 48%;
  --may-electric-lavender: 273 66% 60%;
  --may-sage: 90 66% 75%;
}
```

---

## STEP 4: tailwind.config.ts — Extend Section

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

## STEP 5: Create `src/styles/may-theme.ts`

```typescript
import { Variants } from 'framer-motion';

// Brand Colors (Hex — for inline styles only)
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

// Typography presets
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

// Film Grain SVG texture
export const filmGrain = {
  backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 512 512\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'filmGrain\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.7\' numOctaves=\'5\' stitchTiles=\'stitch\'/%3E%3CfeColorMatrix type=\'saturate\' values=\'0\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23filmGrain)\'/%3E%3C/svg%3E")',
  backgroundSize: '512px 512px',
};

// Duotone Image Style
export const duotoneImageStyle = {
  filter: 'grayscale(100%) contrast(1.1) brightness(0.9)',
  mixBlendMode: 'multiply' as const,
};

// Animation Variants (Framer Motion)
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

export const fadeInScale: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -60 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 60 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

export const staggerContainer: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
};
```

---

## STEP 6: Create `src/components/may/FilmGrainOverlay.tsx`

```tsx
import React from 'react';
import { filmGrain } from '@/styles/may-theme';

interface FilmGrainOverlayProps {
  opacity?: number;
  className?: string;
}

const FilmGrainOverlay: React.FC<FilmGrainOverlayProps> = ({
  opacity = 0.08,
  className = '',
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

export default FilmGrainOverlay;
```

---

## STEP 7: Create `src/components/may/DuotonePanel.tsx`

```tsx
import React from 'react';
import { duotoneImageStyle } from '@/styles/may-theme';
import FilmGrainOverlay from './FilmGrainOverlay';

interface DuotonePanelProps {
  image: string;
  color: string;
  className?: string;
  grainOpacity?: number;
}

const DuotonePanel: React.FC<DuotonePanelProps> = ({
  image,
  color,
  className = '',
  grainOpacity = 0.5,
}) => {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: color }}
      />
      <img
        src={image}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={duotoneImageStyle}
      />
      <FilmGrainOverlay opacity={grainOpacity} />
    </div>
  );
};

export default DuotonePanel;
```

---

## Brand Philosophy & Design Rules

### Identity
- Grassroots, human, grounded — secularly spiritual
- Emotionally intelligent, calm but bold
- Never corporate, techy, or sales-driven

### Color Rules
- Use exact hex/HSL codes from the palette — no substitution
- No gradients, neons, or arbitrary transparency
- Accents (mustard, magenta, lavender) used sparingly and intentionally

### Typography Rules
- Headlines: Tay Losa (Medium) — tight leading (1.05)
- Body: Serial B (Medium) — generous line height (1.75)
- Captions: Serial B uppercase, 0.12em letter-spacing, 11px
- Fallbacks: DM Sans (headlines), IBM Plex Serif (body)

### Image Treatment
- Community/human photos: NO duotone — preserve authentic skin tones
- Concert/stage/editorial scenes: USE duotone (grayscale + color multiply)
- Film grain overlay at 0.5 opacity on all colored sections

### Layout Patterns
- Split panels: solid color + duotone image
- Generous whitespace throughout
- Scroll-triggered Framer Motion animations
- Staggered reveals for content sections

### Do's
- Use exact palette colors
- Apply film grain to color blocks
- Write poetic, grounded copy
- Maintain generous whitespace

### Don'ts
- Use gradients or decorative transparency
- Use generic stock imagery
- Write corporate or sales-y copy
- Use bright saturated colors outside the palette
- Ignore brand fonts

---

## ONE-SHOT SETUP PROMPT

Copy everything below this line and paste into your new Lovable project chat:

---

Please set up the Analog design system for this project. Here are the exact steps:

1. Add the Google Fonts link to index.html `<head>` (Cormorant Garamond, DM Sans, Fraunces, IBM Plex Serif, Inter)

2. Add @font-face declarations for 'Tay Losa' and 'Serial B' to index.css (loading from /fonts/ directory)

3. Add these CSS variables to `:root` in index.css (all HSL format):
   - --may-bone-white: 45 30% 96%
   - --may-charcoal: 0 0% 18%
   - --may-river-mist: 210 30% 85%
   - --may-redwood-green: 165 45% 25%
   - --may-cosmic-magenta: 330 100% 60%
   - --may-festival-amber: 42 95% 55%
   - --may-indigo-plum: 270 45% 25%
   - --may-denim: 213 40% 39%
   - --may-clay: 18 78% 64%
   - --may-deep-water: 270 45% 19%
   - --may-forest: 168 45% 26%
   - --may-dusty-sky: 230 100% 97%
   - --may-boulder: 200 15% 71%
   - --may-mustard: 47 94% 48%
   - --may-electric-lavender: 273 66% 60%
   - --may-sage: 90 66% 75%

4. Add `may` color namespace and font families to tailwind.config.ts (using hsl(var(--may-*)) format)

5. Create `src/styles/may-theme.ts` with COLORS (hex), typography presets, filmGrain texture, duotoneImageStyle, and Framer Motion animation variants (fadeInUp, fadeInScale, slideInLeft, slideInRight, staggerContainer)

6. Create `src/components/may/FilmGrainOverlay.tsx` — pointer-events-none absolute overlay with film grain SVG at configurable opacity

7. Create `src/components/may/DuotonePanel.tsx` — image panel with grayscale filter + color overlay using multiply blend mode

8. Install framer-motion if not already installed

Use HSL for all CSS variables. The design aesthetic is vintage 70s film photography — warm, earthy, editorial. Headlines use Tay Losa font, body uses Serial B. Film grain at 0.5 opacity on color sections. Duotone only on concert/stage imagery, NOT on human/community photos.
