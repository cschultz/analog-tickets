// ===== MAY 2026 BRAND THEME =====
// Shared styling constants for all /may/ pages

import { Variants } from 'framer-motion';

// ===== BRAND COLORS (Hex values for inline styles) =====
export const COLORS = {
  // Neutrals
  white: '#FFFFFF',
  dustySky: '#EEF1FF',
  charcoal: '#2F2F2F',
  boulder: '#AEBDC5',
  
  // Primary / Core
  denim: '#3C6189',
  clay: '#E9835E',
  deepWater: '#2C1C52',
  forest: '#235F56',
  
  // Accent / Energy (use sparingly)
  mustard: '#EEB906',
  electricLavender: '#9157DE',
  magenta: '#FF2E77',
  sage: '#BEEA95',
  
  // Artist overlay color
  artistOverlay: '#FF2E77',
};

// ===== TYPOGRAPHY =====
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
    lineHeight: 1.5,
  },
  caption: {
    fontFamily: "'Serial B', 'IBM Plex Serif', serif",
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.12em',
    fontSize: '11px',
  },
  button: {
    fontFamily: "'Serial B', 'IBM Plex Serif', serif",
    fontWeight: 500,
    letterSpacing: '-0.02em',
  },
};

// ===== FILM GRAIN TEXTURE =====
export const filmGrain = {
  backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 512 512\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'filmGrain\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.7\' numOctaves=\'5\' stitchTiles=\'stitch\'/%3E%3CfeColorMatrix type=\'saturate\' values=\'0\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23filmGrain)\'/%3E%3C/svg%3E")',
  backgroundSize: '512px 512px',
};

// ===== HALFTONE PATTERN =====
export const halftonePattern = `url("data:image/svg+xml,%3Csvg width='8' height='8' viewBox='0 0 8 8' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1.6' fill='%23000' fill-opacity='0.35'/%3E%3Ccircle cx='6' cy='6' r='1.3' fill='%23000' fill-opacity='0.28'/%3E%3Ccircle cx='6' cy='2' r='0.7' fill='%23000' fill-opacity='0.18'/%3E%3Ccircle cx='2' cy='6' r='0.9' fill='%23000' fill-opacity='0.22'/%3E%3C/svg%3E")`;

// ===== DENSER HALFTONE FOR CLOSE-UPS =====
export const halftonePatternDense = `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.9' fill='%23000' fill-opacity='0.4'/%3E%3Ccircle cx='3' cy='3' r='0.75' fill='%23000' fill-opacity='0.32'/%3E%3Ccircle cx='3' cy='1' r='0.4' fill='%23000' fill-opacity='0.2'/%3E%3Ccircle cx='1' cy='3' r='0.5' fill='%23000' fill-opacity='0.25'/%3E%3C/svg%3E")`;

// ===== HEAVY GRAIN TEXTURE =====
export const heavyGrain = {
  backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3CfeColorMatrix type=\'saturate\' values=\'0\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")',
  backgroundSize: '256px 256px',
};

// ===== ANIMATION VARIANTS =====
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
  }
};

export const fadeInScale: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
  }
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -60 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
  }
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 60 },
  visible: { 
    opacity: 1, 
    x: 0,
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

// ===== DUOTONE IMAGE STYLES =====
export const duotoneImageStyle = {
  filter: 'grayscale(100%) contrast(1.1) brightness(0.9)',
  mixBlendMode: 'multiply' as const,
};
