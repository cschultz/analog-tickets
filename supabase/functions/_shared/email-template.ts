// Shared email template utilities for consistent styling across all edge functions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// CORS headers for all edge functions
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Email template configuration interface (matches database schema)
export interface EmailTemplateConfig {
  id: string;
  // Light theme
  background_color: string;
  surface_color: string;
  surface_alt_color: string;
  primary_color: string;
  primary_gold_color: string;
  text_color: string;
  text_muted_color: string;
  border_color: string;
  // Dark theme
  dark_bg_color: string;
  dark_surface_color: string;
  dark_text_color: string;
  dark_muted_color: string;
  // Accents
  accent_color: string;
  accent_gold_color: string;
  // Status
  success_color: string;
  error_color: string;
  warning_color: string;
  info_color: string;
  // Typography
  font_family: string;
  heading_font_family: string;
  // Branding
  logo_url: string | null;
  brand_name: string;
  // Footer
  footer_text: string;
  unsubscribe_text: string;
}

// Color palette for email templates - DEFAULT VALUES (fallback if DB not available)
// All edge functions should import from here instead of hardcoding colors
export const colors = {
  // Primary palette (light theme)
  background: "#F3EEE6",
  surface: "#FFFFFF",
  surfaceAlt: "#F9F7F4",
  primary: "#A37552",
  primaryGold: "#C7A97A",
  text: "#322821",
  textMuted: "#7B6E61",
  textLight: "#666666",
  border: "#D1C2AE",
  
  // Dark theme (for ticket confirmations, etc.)
  darkBg: "#0A2339",
  darkSurface: "#2d2d44",
  darkText: "#e0e0e0",
  darkMuted: "#a0a0b0",
  
  // Accent colors
  accent: "#d4a574",
  accentBlue: "#A7DCE3",
  accentGold: "#F5C15A",
  
  // Status/semantic colors
  success: "#366129",
  error: "#f5576c",
  warning: "#f093fb",
  info: "#4a90d9",
  
  // Gradients (as CSS strings)
  gradientPrimary: "linear-gradient(135deg, #A37552 0%, #C7A97A 100%)",
  gradientDark: "linear-gradient(135deg, #366129 0%, #0A2339 100%)",
  gradientUrgent: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  gradientGold: "linear-gradient(135deg, #C7A97A 0%, #A37552 100%)",
};

// Fetch email template config from database
export async function fetchEmailTemplateConfig(): Promise<EmailTemplateConfig | null> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const { data, error } = await supabase
      .from('email_template_config')
      .select('*')
      .limit(1)
      .single();
    
    if (error || !data) {
      console.warn('Could not fetch email template config, using defaults:', error?.message);
      return null;
    }
    
    return data as EmailTemplateConfig;
  } catch (err) {
    console.warn('Error fetching email template config:', err);
    return null;
  }
}

// Build colors object from database config (merges with defaults)
export function buildColorsFromConfig(config: EmailTemplateConfig | null): typeof colors {
  if (!config) return colors;
  
  return {
    background: config.background_color || colors.background,
    surface: config.surface_color || colors.surface,
    surfaceAlt: config.surface_alt_color || colors.surfaceAlt,
    primary: config.primary_color || colors.primary,
    primaryGold: config.primary_gold_color || colors.primaryGold,
    text: config.text_color || colors.text,
    textMuted: config.text_muted_color || colors.textMuted,
    textLight: "#666666",
    border: config.border_color || colors.border,
    darkBg: config.dark_bg_color || colors.darkBg,
    darkSurface: config.dark_surface_color || colors.darkSurface,
    darkText: config.dark_text_color || colors.darkText,
    darkMuted: config.dark_muted_color || colors.darkMuted,
    accent: config.accent_color || colors.accent,
    accentBlue: "#A7DCE3",
    accentGold: config.accent_gold_color || colors.accentGold,
    success: config.success_color || colors.success,
    error: config.error_color || colors.error,
    warning: config.warning_color || colors.warning,
    info: config.info_color || colors.info,
    gradientPrimary: `linear-gradient(135deg, ${config.primary_color || colors.primary} 0%, ${config.primary_gold_color || colors.primaryGold} 100%)`,
    gradientDark: `linear-gradient(135deg, ${config.success_color || colors.success} 0%, ${config.dark_bg_color || colors.darkBg} 100%)`,
    gradientUrgent: `linear-gradient(135deg, ${config.warning_color || colors.warning} 0%, ${config.error_color || colors.error} 100%)`,
    gradientGold: `linear-gradient(135deg, ${config.primary_gold_color || colors.primaryGold} 0%, ${config.primary_color || colors.primary} 100%)`,
  };
}

// Escape HTML to prevent XSS
export function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(text).replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
}

// Get first name from full name
export function getFirstName(fullName: string | null | undefined): string {
  if (!fullName) return 'there';
  return fullName.trim().split(' ')[0] || 'there';
}

// ============================================================
// TICKET TYPE CONFIGURATION
// Primary source: ticket_types database table
// Fallback: hardcoded values below for backward compatibility
// ============================================================

export interface TicketTypeConfig {
  key: string;
  label: string;
  shortLabel: string;
  order: number;
  /** Price in cents */
  price: number;
  /** Early bird price in cents (if applicable) */
  earlyBirdPrice?: number;
  event?: 'winter_escape' | 'may_2026' | 'all';
  isEarlyBird?: boolean;
  description?: string;
}

// Fetch ticket types from database (preferred method)
export async function fetchTicketTypesFromDb(eventId?: string): Promise<Record<string, TicketTypeConfig>> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    let query = supabase
      .from('ticket_types')
      .select('key, label, short_label, sort_order, price, description, is_active')
      .eq('is_active', true);
    
    if (eventId) {
      query = query.eq('event_id', eventId);
    }
    
    const { data, error } = await query;
    
    if (error || !data) {
      console.warn('Could not fetch ticket types from DB, using fallback:', error?.message);
      return TICKET_TYPES;
    }
    
    const dbTicketTypes: Record<string, TicketTypeConfig> = {};
    for (const row of data) {
      dbTicketTypes[row.key] = {
        key: row.key,
        label: row.label,
        shortLabel: row.short_label,
        order: row.sort_order,
        price: row.price,
        description: row.description || '',
      };
    }
    
    return dbTicketTypes;
  } catch (err) {
    console.warn('Error fetching ticket types:', err);
    return TICKET_TYPES;
  }
}

// Complete ticket type configuration (synced with src/config/ticketTypes.ts)
// NOTE: Prices are in CENTS (e.g., 34900 = $349.00)
export const TICKET_TYPES: Record<string, TicketTypeConfig> = {
  // May 2026 Tier 1 ticket types
  tier_1_ga_2day: {
    key: 'tier_1_ga_2day',
    label: 'GA — 2 Day',
    shortLabel: 'GA',
    order: 1,
    price: 21500,
    event: 'may_2026',
    description: 'General Admission 2-day pass for Friday & Saturday (May 15-16)',
  },
  tier_1_krewe_3day: {
    key: 'tier_1_krewe_3day',
    label: 'Krewe — 3 Day',
    shortLabel: 'Krewe',
    order: 2,
    price: 9900,
    event: 'may_2026',
    description: 'Krewe 3-day pass',
  },
  tier_1_vip_3day: {
    key: 'tier_1_vip_3day',
    label: 'VIP — 3 Day',
    shortLabel: 'VIP',
    order: 3,
    price: 42500,
    event: 'may_2026',
    description: 'VIP 3-day pass',
  },
  // May 2026 Standard ticket types
  ga_2day: {
    key: 'ga_2day',
    label: 'GA — 2 Day Pass',
    shortLabel: 'GA',
    order: 4,
    price: 44900,
    earlyBirdPrice: 34900,
    event: 'may_2026',
    description: 'General Admission access for Friday & Saturday (May 15-16)',
  },
  krewe_3day: {
    key: 'krewe_3day',
    label: 'Krewe — 3 Day Pass',
    shortLabel: 'Krewe',
    order: 5,
    price: 74900,
    earlyBirdPrice: 59900,
    event: 'may_2026',
    description: 'Full weekend access with Krewe perks',
  },
  vip_3day: {
    key: 'vip_3day',
    label: 'VIP — 3 Day Pass',
    shortLabel: 'VIP',
    order: 6,
    price: 119900,
    earlyBirdPrice: 89900,
    event: 'may_2026',
    description: 'Premium VIP experience with exclusive access',
  },
  // May 2026 Patrons ticket types
  patrons_premier: {
    key: 'patrons_premier',
    label: 'Patrons Premier',
    shortLabel: 'Premier',
    order: 7,
    price: 250000,
    event: 'may_2026',
    description: 'Premier Patron package with exclusive benefits',
  },
  patrons_ultimate: {
    key: 'patrons_ultimate',
    label: 'Patrons Ultimate',
    shortLabel: 'Ultimate',
    order: 8,
    price: 500000,
    event: 'may_2026',
    description: 'Ultimate Patron experience with all-access privileges',
  },
  patrons_vip: {
    key: 'patrons_vip',
    label: 'Patrons VIP',
    shortLabel: 'Patrons VIP',
    order: 9,
    price: 150000,
    event: 'may_2026',
    description: 'VIP Patron package',
  },
  // May 2026 Additional pass types
  weekend_pass: {
    key: 'weekend_pass',
    label: 'Weekend Pass',
    shortLabel: 'Weekend',
    order: 10,
    price: 29900,
    event: 'may_2026',
    description: 'Weekend-only access pass',
  },
  day_pass: {
    key: 'day_pass',
    label: 'Day Pass',
    shortLabel: 'Day',
    order: 11,
    price: 14900,
    event: 'may_2026',
    description: 'Single day access',
  },
  kids_pass: {
    key: 'kids_pass',
    label: 'Kids Pass',
    shortLabel: 'Kids',
    order: 12,
    price: 0,
    event: 'may_2026',
    description: 'Free admission for children under 12',
  },
  camping_addon: {
    key: 'camping_addon',
    label: 'Camping Add-on',
    shortLabel: 'Camping',
    order: 13,
    price: 15000,
    event: 'may_2026',
    description: 'Add camping to your ticket',
  },
  // Winter Escape ticket types (legacy)
  dinner_party: {
    key: 'dinner_party',
    label: 'Dinner + Party',
    shortLabel: 'Dinner',
    order: 20,
    price: 14900,
    event: 'winter_escape',
    description: 'Full dinner and party experience',
  },
  party: {
    key: 'party',
    label: 'Party Only',
    shortLabel: 'Party',
    order: 21,
    price: 6900,
    event: 'winter_escape',
    description: 'Party-only admission',
  },
  party_only: {
    key: 'party_only',
    label: 'Party Only',
    shortLabel: 'Party',
    order: 21,
    price: 6900,
    event: 'winter_escape',
    description: 'Party-only admission',
  },
};

// Check if ticket type is a 2-day GA pass (only Friday & Saturday)
export function isGa2DayTicket(ticketType: string): boolean {
  return ticketType === 'ga_2day' || ticketType === 'tier_1_ga_2day';
}

// Get the appropriate date range based on ticket type
export function getEventDateRange(ticketType: string): { dateRange: string; dayDescription: string } {
  if (isGa2DayTicket(ticketType)) {
    return {
      dateRange: 'May 15–16, 2026',
      dayDescription: 'Friday & Saturday'
    };
  }
  // VIP, Krewe, Patrons, and other 3-day passes
  return {
    dateRange: 'May 15–17, 2026',
    dayDescription: 'Friday through Sunday'
  };
}

// Format ticket type for display
export function formatTicketType(ticketType: string): string {
  return TICKET_TYPES[ticketType]?.label || 
    ticketType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Get ticket price
export function getTicketPrice(ticketType: string): number {
  return TICKET_TYPES[ticketType]?.price || 0;
}

// Get ticket short label
export function getTicketShortLabel(ticketType: string): string {
  return TICKET_TYPES[ticketType]?.shortLabel || ticketType.replace(/_/g, ' ');
}

// Format currency amount (from cents to dollars)
export function formatAmount(amountInCents: number): string {
  return `$${(amountInCents / 100).toFixed(2)}`;
}

// Format price without cents for display
export function formatPrice(priceInCents: number): string {
  return `$${(priceInCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0, timeZone: "America/Los_Angeles" })}`;
}

// Template variable replacement
export function replaceTemplateVars(
  text: string | null | undefined, 
  vars: Record<string, string>
): string {
  if (!text) return '';
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

// Email template configuration for wrapper generation
export interface EmailWrapperConfig {
  eventTitle: string;
  heading?: string;
  firstName: string;
  signatureLine: string;
  signatureName: string;
  theme?: 'light' | 'dark';
}

// Generate plain text email wrapper (minimal, personal feel)
// Used for drip sequences where a casual, personal tone is preferred
export function generatePlainTextEmailWrapper(
  content: string,
  templateConfig?: EmailTemplateConfig | null
): string {
  const c = buildColorsFromConfig(templateConfig || null);
  const fontFamily = templateConfig?.font_family || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: ${fontFamily}; 
            line-height: 1.6; 
            color: ${c.text}; 
            background: ${c.background}; 
            margin: 0; 
            padding: 0; 
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: ${c.surface}; 
            padding: 40px 30px;
          }
          a { color: ${c.primary}; }
        </style>
      </head>
      <body>
        <div class="container">
          ${content}
        </div>
      </body>
    </html>
  `;
}

// Generate base email wrapper with consistent styling (HTML template)
export function generateEmailWrapper(
  config: EmailWrapperConfig,
  content: string,
  templateConfig?: EmailTemplateConfig | null
): string {
  const { eventTitle, heading, firstName, signatureLine, signatureName, theme = 'light' } = config;
  const c = buildColorsFromConfig(templateConfig || null);
  const fontFamily = templateConfig?.font_family || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const headingFont = templateConfig?.heading_font_family || 'Georgia, serif';
  const brandName = templateConfig?.brand_name || 'Cosmico';
  const footerText = (templateConfig?.footer_text || '© {{year}} Cosmico. All rights reserved.').replace('{{year}}', new Date().getFullYear().toString());

  if (theme === 'dark') {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: ${c.darkBg}; font-family: ${fontFamily};">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${c.darkBg}; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: linear-gradient(135deg, ${c.darkSurface} 0%, ${c.darkBg} 100%); border-radius: 16px; overflow: hidden;">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 40px 40px 20px; text-align: center;">
                      <h1 style="color: ${c.accent}; font-size: 32px; margin: 0; font-weight: 600; letter-spacing: 2px;">${escapeHtml(eventTitle)}</h1>
                      ${heading ? `<p style="color: ${c.darkMuted}; font-size: 14px; margin: 8px 0 0; letter-spacing: 1px;">${escapeHtml(heading)}</p>` : ''}
                    </td>
                  </tr>
                  
                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 20px 40px;">
                      <p style="color: ${c.darkText}; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                        Hi ${escapeHtml(firstName)},
                      </p>
                      ${content}
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 30px 40px; border-top: 1px solid rgba(255,255,255,0.1);">
                      <p style="color: ${c.accent}; font-size: 14px; margin: 0 0 16px; text-align: center;">
                        ${escapeHtml(signatureLine)}<br>${escapeHtml(signatureName)}
                      </p>
                      <p style="color: #606070; font-size: 12px; margin: 16px 0 0; text-align: center;">
                        ${footerText}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  // Light theme (default)
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: ${fontFamily}; line-height: 1.6; color: ${c.text}; background: ${c.background}; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; background: ${c.surface}; }
          .header { background: ${c.gradientPrimary}; color: ${c.background}; padding: 40px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; font-family: ${headingFont}; }
          .header p { margin: 10px 0 0; font-size: 16px; opacity: 0.9; }
          .content { padding: 40px 30px; }
          .intro { font-size: 16px; color: ${c.text}; margin-bottom: 20px; }
          .section { margin: 30px 0; }
          .section-title { font-size: 18px; font-weight: 600; color: ${c.primary}; margin-bottom: 15px; }
          .details-box { background: ${c.surfaceAlt}; border-left: 4px solid ${c.primaryGold}; padding: 20px; margin: 15px 0; }
          .details-box p { margin: 8px 0; }
          .highlight-box { background: #FFF9F0; border: 2px solid ${c.primaryGold}; border-radius: 8px; padding: 20px; margin: 15px 0; }
          .cta-button { display: inline-block; background: ${c.primaryGold}; color: ${c.background}; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; }
          .footer { text-align: center; padding: 30px 20px; color: ${c.textMuted}; font-size: 14px; border-top: 1px solid ${c.border}; background: ${c.surfaceAlt}; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${escapeHtml(eventTitle)}</h1>
            ${heading ? `<p>${escapeHtml(heading)}</p>` : ''}
          </div>
          <div class="content">
            <p class="intro">Hi ${escapeHtml(firstName)},</p>
            ${content}
          </div>
          <div class="footer">
            <p style="margin: 10px 0;"><strong>${escapeHtml(signatureLine)}<br>${escapeHtml(signatureName)}</strong></p>
            <p style="margin: 16px 0 0; font-size: 12px;">${footerText}</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

// Generate a section with title and content
export function generateSection(title: string, content: string): string {
  return `
    <div class="section">
      <div class="section-title">${escapeHtml(title)}</div>
      ${content}
    </div>
  `;
}

// Generate a details box
export function generateDetailsBox(items: Array<{ label: string; value: string }>): string {
  const itemsHtml = items
    .map(item => `<p><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</p>`)
    .join('');
  return `<div class="details-box">${itemsHtml}</div>`;
}

// Generate a CTA button
export function generateCtaButton(text: string, url: string): string {
  return `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${url}" class="cta-button">${escapeHtml(text)}</a>
    </div>
  `;
}

// Generate a highlight/info box
export function generateHighlightBox(content: string): string {
  return `<div class="highlight-box">${content}</div>`;
}

// Announcement email template (used by bulk announcements)
export function generateAnnouncementEmail(
  config: EmailWrapperConfig,
  messageContent: string,
  isPreview: boolean = false,
  templateConfig?: EmailTemplateConfig | null
): string {
  const c = buildColorsFromConfig(templateConfig || null);
  const fontFamily = templateConfig?.font_family || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const headingFont = templateConfig?.heading_font_family || 'Georgia, serif';
  const footerText = (templateConfig?.footer_text || '© {{year}} Cosmico. All rights reserved.').replace('{{year}}', new Date().getFullYear().toString());
  
  const previewBanner = isPreview 
    ? `<div style="background: #FEF3C7; color: #92400E; padding: 12px; text-align: center; font-weight: bold; border-radius: 10px 10px 0 0;">⚠️ PREVIEW - This email was not sent to attendees</div>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: ${fontFamily}; line-height: 1.6; color: ${c.text}; background: ${c.background}; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; background: ${c.surface}; }
          .header { background: ${c.gradientPrimary}; color: ${c.background}; padding: 40px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; font-family: ${headingFont}; }
          .header p { margin: 10px 0 0; font-size: 16px; opacity: 0.9; }
          .content { padding: 40px 30px; }
          .intro { font-size: 16px; color: ${c.text}; margin-bottom: 20px; }
          .footer { text-align: center; padding: 30px 20px; color: ${c.textMuted}; font-size: 14px; border-top: 1px solid ${c.border}; background: ${c.surfaceAlt}; }
          a { color: ${c.primary}; }
        </style>
      </head>
      <body>
        ${previewBanner}
        <div class="container">
          <div class="header">
            <h1>${escapeHtml(config.eventTitle)}</h1>
            ${config.heading ? `<p>${escapeHtml(config.heading)}</p>` : ''}
          </div>
          <div class="content">
            <p class="intro">Hi ${escapeHtml(config.firstName)},</p>
            ${messageContent}
          </div>
          <div class="footer">
            <p style="margin: 10px 0;"><strong>${escapeHtml(config.signatureLine)}<br>${escapeHtml(config.signatureName)}</strong></p>
            <p style="margin: 16px 0 0; font-size: 12px;">${footerText}</p>
          </div>
        </div>
      </body>
    </html>
  `;
}
