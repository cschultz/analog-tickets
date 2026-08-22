// ===== TICKETING FLOW THEME =====
// Separate styling for ticketing/checkout pages
// Based on the original Cosmico "Audio Water" palette
// Keep distinct from the /may Analog brand theme

// ===== COLOR PALETTE =====
export const TICKETING_COLORS = {
  // Primary Palette
  deepRiver: '#0A2339',      // Dark backgrounds, headers
  electricCoral: '#FF6E4A',  // Primary CTAs, accents
  riverAqua: '#A7DCE3',      // Secondary accents, borders
  
  // Secondary Palette
  solarGold: '#F5C15A',      // Highlights, success states
  nightWater: '#0C0C0F',     // Deep dark backgrounds
  glacialBlue: '#5EA0C9',    // Subtle accents, links
  
  // Accent Colors
  waveViolet: '#735BFF',     // Special highlights
  heatRed: '#E34646',        // Errors, warnings
  mistGrey: '#F2F4F5',       // Light backgrounds, cards
  
  // Neutrals
  white: '#FFFFFF',
  black: '#000000',
  
  // Surface Colors (for cards, inputs)
  surface: '#F4F6F8',        // Card backgrounds
  surfaceElevated: '#FFFFFF', // Elevated cards
  border: '#C5CCD4',         // Input borders
  borderFocus: '#A7DCE3',    // Focused input borders
  
  // Text Colors
  textPrimary: '#1A2A3A',    // Main body text
  textSecondary: '#5B6B7B',  // Muted text
  textOnDark: '#F2F4F5',     // Text on dark backgrounds
  textOnAccent: '#FFFFFF',   // Text on accent colors
};

// ===== CSS VARIABLE MAPPINGS =====
// These map to index.css --preview-* variables
export const TICKETING_CSS_VARS = {
  '--preview-bg': '210 20% 96%',        // #F4F6F8
  '--preview-surface': '210 15% 92%',   // #E8EBEF
  '--preview-text': '212 40% 16%',      // #1A2A3A
  '--preview-muted': '210 20% 45%',     // #5B6B7B
  '--preview-accent': '187 45% 40%',    // #3A8A8F
  '--preview-border': '210 15% 80%',    // #C5CCD4
  '--preview-dark': '212 50% 10%',      // #0D1926
};

// ===== TYPOGRAPHY =====
export const ticketingTypography = {
  // Display/Hero text
  display: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontWeight: 400,
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
  },
  
  // Section headings
  heading: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontWeight: 500,
    letterSpacing: '-0.015em',
    lineHeight: 1.15,
  },
  
  // Body text
  body: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 400,
    letterSpacing: '0',
    lineHeight: 1.6,
  },
  
  // Labels, captions
  caption: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 500,
    letterSpacing: '0.02em',
    fontSize: '14px',
    lineHeight: 1.5,
  },
  
  // Buttons
  button: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 500,
    letterSpacing: '0.02em',
  },
  
  // Price/numbers
  price: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 600,
    letterSpacing: '-0.01em',
  },
};

// ===== BUTTON STYLES =====
export const ticketingButtons = {
  primary: {
    backgroundColor: TICKETING_COLORS.electricCoral,
    color: TICKETING_COLORS.white,
    hoverBackgroundColor: '#E65A3A', // Darker coral
    borderRadius: '8px',
    padding: '14px 28px',
    fontSize: '16px',
    fontWeight: 500,
    transition: 'all 0.2s ease',
  },
  
  secondary: {
    backgroundColor: 'transparent',
    color: TICKETING_COLORS.textPrimary,
    border: `1px solid ${TICKETING_COLORS.border}`,
    hoverBackgroundColor: TICKETING_COLORS.surface,
    borderRadius: '8px',
    padding: '14px 28px',
    fontSize: '16px',
    fontWeight: 500,
    transition: 'all 0.2s ease',
  },
  
  outline: {
    backgroundColor: 'transparent',
    color: TICKETING_COLORS.riverAqua,
    border: `1.5px solid ${TICKETING_COLORS.riverAqua}`,
    hoverBackgroundColor: 'rgba(167, 220, 227, 0.1)',
    borderRadius: '8px',
    padding: '14px 28px',
    fontSize: '16px',
    fontWeight: 500,
    transition: 'all 0.2s ease',
  },
};

// ===== CARD STYLES =====
export const ticketingCards = {
  default: {
    backgroundColor: TICKETING_COLORS.white,
    borderRadius: '12px',
    border: `1px solid ${TICKETING_COLORS.border}`,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
    padding: '24px',
  },
  
  elevated: {
    backgroundColor: TICKETING_COLORS.white,
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
    padding: '24px',
  },
  
  selected: {
    backgroundColor: TICKETING_COLORS.white,
    borderRadius: '12px',
    border: `2px solid ${TICKETING_COLORS.electricCoral}`,
    boxShadow: '0 4px 20px rgba(255, 110, 74, 0.15)',
    padding: '24px',
  },
};

// ===== INPUT STYLES =====
export const ticketingInputs = {
  default: {
    backgroundColor: TICKETING_COLORS.white,
    border: `1px solid ${TICKETING_COLORS.border}`,
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '16px',
    color: TICKETING_COLORS.textPrimary,
    transition: 'border-color 0.2s ease',
  },
  
  focus: {
    borderColor: TICKETING_COLORS.riverAqua,
    outline: 'none',
    boxShadow: `0 0 0 3px rgba(167, 220, 227, 0.2)`,
  },
  
  error: {
    borderColor: TICKETING_COLORS.heatRed,
    boxShadow: `0 0 0 3px rgba(227, 70, 70, 0.1)`,
  },
};

// ===== SPACING =====
export const ticketingSpacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
  section: '64px',
};

// ===== SHADOWS =====
export const ticketingShadows = {
  subtle: '0 1px 3px rgba(0, 0, 0, 0.04)',
  card: '0 2px 8px rgba(0, 0, 0, 0.06)',
  elevated: '0 4px 20px rgba(0, 0, 0, 0.08)',
  focus: '0 0 0 3px rgba(167, 220, 227, 0.25)',
};

// ===== STATUS COLORS =====
export const ticketingStatus = {
  success: {
    background: '#E8F5E9',
    text: '#2E7D32',
    border: '#A5D6A7',
  },
  warning: {
    background: '#FFF3E0',
    text: '#E65100',
    border: '#FFCC80',
  },
  error: {
    background: '#FFEBEE',
    text: '#C62828',
    border: '#EF9A9A',
  },
  info: {
    background: '#E3F2FD',
    text: '#1565C0',
    border: '#90CAF9',
  },
};

// ===== ANIMATION =====
export const ticketingTransitions = {
  fast: '0.15s ease',
  default: '0.2s ease',
  slow: '0.3s ease',
  spring: '0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
};

// ===== TAILWIND CLASS HELPERS =====
// Use these with Tailwind's bg-*, text-*, border-* utilities
export const ticketingTailwindClasses = {
  // Backgrounds
  bgPage: 'bg-preview-bg',
  bgSurface: 'bg-preview-surface',
  bgDark: 'bg-preview-dark',
  
  // Text
  textPrimary: 'text-preview-text',
  textMuted: 'text-preview-muted',
  textOnDark: 'text-white',
  
  // Borders
  border: 'border-preview-border',
  
  // Accent
  accent: 'text-preview-accent',
  bgAccent: 'bg-preview-accent',
};
